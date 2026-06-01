// src/features/tools/executors/http-api.ts
//
// Executes an HTTP API tool config.
//
// Before this runs, resolveSecretRefs() has already replaced all
// {{secret:name}} patterns in string values throughout the config.
// The authentication.valueRef field is stored as a raw secret name
// (not a {{secret:...}} template), so we resolve it here directly.

import { resolveSecret } from '@/features/secrets/secrets.service';
import type { ToolExecutionResult } from '../tools.executor';

// ============================================================================
// CONFIG TYPES
// ============================================================================

interface HttpApiConfig {
  baseUrl: string;
  method: 'GET' | 'POST' | 'PUT';
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  bodyTemplate?: Record<string, unknown> | null;
  responseMapping: {
    resultsPath: string;
    totalCountPath?: string;
    fieldMappings?: Record<string, string>;
  };
  authentication?: {
    type: 'none' | 'header' | 'query_param';
    key?: string;
    valueRef?: string; // raw secret name — resolved below
  };
  timeout?: number;
  retries?: number;
}

// ============================================================================
// {{input.field}} TEMPLATE RESOLUTION
// Replaces {{input.fieldName}} with values from the AI-provided input.
// {{secret:name}} refs are already resolved before this executor runs.
// ============================================================================

const INPUT_PATTERN = /\{\{input\.([a-zA-Z0-9_]+)\}\}/g;

function resolveInputTemplates(val: unknown, input: Record<string, unknown>): unknown {
  if (typeof val === 'string') {
    return val.replace(INPUT_PATTERN, (_, field: string) => {
      const v = input[field];
      return v != null ? String(v) : '';
    });
  }
  if (Array.isArray(val)) {
    return val.map((item) => resolveInputTemplates(item, input));
  }
  if (val !== null && typeof val === 'object') {
    return Object.fromEntries(
      Object.entries(val as Record<string, unknown>).map(([k, v]) => [
        k,
        resolveInputTemplates(v, input),
      ]),
    );
  }
  return val;
}

// ============================================================================
// SIMPLE JSONPATH RESOLVER
// Handles the subset of JSONPath used in responseMapping:
//   $.field             → obj.field
//   $.a.b.c             → obj.a.b.c
//   $.a[*]              → obj.a  (already an array — [*] means "spread")
//   $.a.b[*]            → obj.a.b
//   $.a[0]              → obj.a[0]
// ============================================================================

function resolveJsonPath(path: string, obj: unknown): unknown {
  let p = path.trim();
  if (p.startsWith('$.')) p = p.slice(2);
  else if (p.startsWith('$')) p = p.slice(1);
  if (!p) return obj;

  // Split on dots, flatten array notation into segments
  const segments: string[] = p.split('.').flatMap((seg) => {
    // "results[*]" → ["results"]   |   "results[0]" → ["results", "0"]
    const m = seg.match(/^([^\[]+)(?:\[(\*|\d+)\])?$/);
    if (!m) return [seg];
    const [, name, index] = m;
    if (index === undefined || index === '*') return [name];
    return [name, index];
  });

  let current: unknown = obj;
  for (const seg of segments) {
    if (current == null || typeof current !== 'object') return undefined;
    if (Array.isArray(current)) {
      const idx = Number(seg);
      current = isNaN(idx) ? undefined : current[idx];
    } else {
      current = (current as Record<string, unknown>)[seg];
    }
  }
  return current;
}

// ============================================================================
// MAIN EXECUTOR
// ============================================================================

export async function executeHttpApi(
  config: Record<string, unknown>,
  input: Record<string, unknown>,
): Promise<Omit<ToolExecutionResult, 'durationMs'>> {
  const cfg = config as unknown as HttpApiConfig;

  if (!cfg.baseUrl || !cfg.method) {
    return { success: false, error: 'HTTP API config is missing baseUrl or method' };
  }
  if (!cfg.responseMapping?.resultsPath) {
    return { success: false, error: 'HTTP API config is missing responseMapping.resultsPath' };
  }

  // 1. Resolve {{input.field}} templates throughout the entire config
  const resolved = resolveInputTemplates(cfg, input) as HttpApiConfig;

  // 2. Build query params (may include static values + resolved templates)
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(resolved.queryParams ?? {})) {
    if (k) params.set(k, String(v));
  }

  // 3. Resolve authentication secret and apply it
  const auth = resolved.authentication;
  const headers: Record<string, string> = { ...(resolved.headers ?? {}) };

  if (auth && auth.type !== 'none' && auth.key && auth.valueRef) {
    const secretValue = await resolveSecret(auth.valueRef);
    if (secretValue == null) {
      return { success: false, error: `Authentication secret "${auth.valueRef}" not found` };
    }
    if (auth.type === 'header') {
      headers[auth.key] = secretValue;
    } else if (auth.type === 'query_param') {
      params.set(auth.key, secretValue);
    }
  }

  // 4. Build full URL
  const qs = params.toString();
  const url = qs ? `${resolved.baseUrl}?${qs}` : resolved.baseUrl;

  // 5. Build fetch options
  const timeout = cfg.timeout ?? 8000;
  const maxAttempts = (cfg.retries ?? 0) + 1;

  const requestInit: RequestInit = {
    method: resolved.method,
    headers: {
      Accept: 'application/json',
      ...headers,
      // Only set Content-Type for requests with a body
      ...(resolved.method !== 'GET' && resolved.bodyTemplate
        ? { 'Content-Type': 'application/json' }
        : {}),
    },
    ...(resolved.method !== 'GET' && resolved.bodyTemplate
      ? { body: JSON.stringify(resolved.bodyTemplate) }
      : {}),
  };

  // 6. Fetch with retry on network errors (not on 4xx)
  let lastError = 'Request failed';

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, { ...requestInit, signal: controller.signal });
      clearTimeout(timer);

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        lastError = `HTTP ${response.status}${text ? ': ' + text.slice(0, 300) : ''}`;
        // Don't retry 4xx — it's a client config error
        if (response.status >= 400 && response.status < 500) break;
        continue;
      }

      let json: unknown;
      try {
        json = await response.json();
      } catch {
        return { success: false, error: 'API response was not valid JSON' };
      }

      // 7. Apply response mapping
      const mapping = cfg.responseMapping;
      const results = resolveJsonPath(mapping.resultsPath, json);
      const resultsArray = Array.isArray(results)
        ? results
        : results != null
          ? [results]
          : [];

      const totalRaw = mapping.totalCountPath
        ? resolveJsonPath(mapping.totalCountPath, json)
        : undefined;
      const totalCount = typeof totalRaw === 'number' ? totalRaw : resultsArray.length;

      return {
        success: true,
        data: {
          results: resultsArray,
          totalCount,
        },
      };
    } catch (err) {
      clearTimeout(timer);
      const msg = err instanceof Error ? err.message : String(err);
      lastError = msg.toLowerCase().includes('abort')
        ? `Request timed out after ${timeout}ms`
        : msg;
      // Retry on network-level errors
    }
  }

  return { success: false, error: lastError };
}
