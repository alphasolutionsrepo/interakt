// src/shared/seeders/demo/demo-manifest.ts

/**
 * Demo manifest loader.
 *
 * Reads `setup/data/demo.manifest.yaml`, validates its shape, and resolves the
 * two JSON files it references (the field mappings + the product documents).
 *
 * The manifest is the single source of truth for `npm run setup:demo`. Nested
 * config blocks (searchConfig, guardrails, embed, …) are intentionally passed
 * through loosely — the feature service DTOs do the strict validation when the
 * seeder creates each entity, so we don't duplicate every field here.
 */

import 'server-only';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve, dirname, isAbsolute } from 'node:path';

import YAML from 'yaml';
import { z } from 'zod';

// A loose object that we forward to a service DTO verbatim.
const looseObject = z.record(z.unknown());

// One selectable AI provider for the demo (e.g. ollama, openai). authType drives
// what the page asks for: 'api_key' → a key input; 'none' → a base-URL input.
const providerOptionSchema = z.object({
  key: z.string(), // catalog providerKey
  label: z.string(),
  tagline: z.string().optional(),
  authType: z.enum(['none', 'api_key']).default('none'),
  defaultBaseUrl: z.string().optional(), // local providers (ollama)
  baseUrlEnv: z.string().optional(), // optional env override for the base URL
  requiredModels: z.array(z.string()).default([]), // pulled-model readiness check
  embeddingDimensions: z.number().int().positive().optional(), // used to register the embedding model if missing
  defaults: z.object({
    chatModel: z.string(),
    textModel: z.string(),
    embeddingModel: z.string(),
  }),
});

const guardrailRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  action: z.string().default('block'),
  priority: z.number().int().default(0),
  enabled: z.boolean().default(true),
  config: looseObject.default({}),
});

export const demoManifestSchema = z.object({
  version: z.number().default(1),
  demo: z.object({
    key: z.string(),
    name: z.string(),
    description: z.string().optional(),
  }),
  provider: z.object({
    // Which option is pre-selected on the Demo Setup page.
    recommended: z.string().default('ollama'),
    // One entry per selectable provider, keyed by catalog providerKey.
    options: z.record(providerOptionSchema),
  }),
  index: z.object({
    name: z.string(),
    displayName: z.string(),
    description: z.string().optional(),
    searchType: z.enum(['lexical', 'semantic', 'hybrid']),
    searchProvider: z.enum(['elasticsearch', 'azure-ai-search']).default('elasticsearch'),
    indexingStrategy: z.enum(['on_upload', 'scheduled', 'manual']).default('on_upload'),
    language: z.string().default('english'),
    synonyms: z.array(z.string()).default([]),
    stopWords: z.array(z.string()).default([]),
    vectorSimilarity: z.enum(['cosine', 'euclidean', 'dot_product']).default('cosine'),
    rrfRankConstant: z.number().int().default(60),
    rrfWindowSize: z.number().int().default(100),
    numberOfShards: z.number().int().default(1),
    numberOfReplicas: z.number().int().default(0),
    refreshInterval: z.string().default('1s'),
    mappingFile: z.string(),
    documentsFile: z.string(),
  }),
  dataSource: z.object({
    name: z.string(),
    slug: z.string(),
    type: z.string().default('search_index'),
  }),
  tools: z.object({
    scaffold: z.array(z.string()).default(['search', 'inspect', 'enumerate', 'lookup']),
    // Tool-level display config (ToolDisplayConfig) applied to the result tools
    // so chat renders visual presets instead of rich_text. Forwarded verbatim.
    displayConfig: looseObject.optional(),
  }),
  searchExperience: z.object({
    name: z.string(),
    slug: z.string(),
    description: z.string().optional(),
    searchConfig: looseObject.optional(),
    aiConfig: looseObject.optional(),
    toolsConfig: looseObject.optional(),
    displayConfig: looseObject.optional(),
  }),
  chatExperience: z.object({
    name: z.string(),
    slug: z.string(),
    description: z.string().optional(),
    icon: z.string().optional(),
    pipelineMode: z.enum(['agentic', 'deterministic']).default('deterministic'),
    persona: looseObject,
    session: looseObject.optional(),
    guardrails: z
      .object({
        input: z
          .object({
            enabled: z.boolean().default(true),
            onBlock: looseObject.optional(),
            rules: z.array(guardrailRuleSchema).default([]),
          })
          .optional(),
        output: z
          .object({
            enabled: z.boolean().default(false),
            onBlock: looseObject.optional(),
            rules: z.array(guardrailRuleSchema).default([]),
          })
          .optional(),
      })
      .optional(),
    access: looseObject.optional(),
    observability: looseObject.optional(),
    tools: z
      .object({ enabled: z.array(z.string()).default([]) })
      .default({ enabled: [] }),
  }),
  warmup: z
    .object({
      enabled: z.boolean().default(true),
      searches: z.array(z.string()).default([]),
      chats: z.array(z.array(z.string())).default([]),
      analyticsChats: z.array(z.array(z.string())).default([]),
    })
    .default({ enabled: true, searches: [], chats: [], analyticsChats: [] }),
});

export type DemoManifest = z.infer<typeof demoManifestSchema>;
export type DemoProviderOption = z.infer<typeof providerOptionSchema>;

export interface LoadedDemoManifest {
  manifest: DemoManifest;
  /** Parsed field-mapping export (`{ _version, _indexName, fields: [...] }`). */
  mapping: { fields: MappingFieldEntry[]; [k: string]: unknown };
  /** Product documents to bulk-load. */
  documents: Record<string, unknown>[];
  /** Absolute path the manifest was loaded from (for logging). */
  manifestPath: string;
}

/** One entry in the field-mapping export — matches `MappingEntryInput`. */
export interface MappingFieldEntry {
  fieldName: string;
  fieldType: string;
  displayName?: string | null;
  isSystemField?: boolean;
  isRequired?: boolean;
  mapping: {
    mode: string;
    sourceField: string | null;
    transform?: string;
    staticValue?: unknown;
    generator?: string;
    computed?: unknown;
    collectFields?: string[];
    sourceFromField?: string;
  };
  attributes: {
    isSearchable: boolean;
    isFacetable: boolean;
    includeInResponse: boolean;
    boostValue: number;
    isVectorSource: boolean;
    isAutocomplete?: boolean;
  };
  providerFieldSettings?: Record<string, unknown>;
}

/**
 * Default manifest location: `<cwd>/setup/data/demo.manifest.yaml`.
 * Override with the DEMO_MANIFEST env var (absolute or cwd-relative path).
 */
export function defaultManifestPath(): string {
  const fromEnv = process.env.DEMO_MANIFEST;
  if (fromEnv) return isAbsolute(fromEnv) ? fromEnv : resolve(process.cwd(), fromEnv);
  return resolve(process.cwd(), 'setup/data/demo.manifest.yaml');
}

/** Load + validate the manifest and its referenced JSON files. */
export async function loadDemoManifest(manifestPath = defaultManifestPath()): Promise<LoadedDemoManifest> {
  if (!existsSync(manifestPath)) {
    throw new Error(
      `Demo manifest not found at ${manifestPath}. Expected setup/data/demo.manifest.yaml — ` +
        `run setup:demo from the backend/ directory, or set DEMO_MANIFEST.`,
    );
  }

  const raw = await readFile(manifestPath, 'utf8');
  let parsed: unknown;
  try {
    parsed = YAML.parse(raw);
  } catch (e) {
    throw new Error(`Failed to parse ${manifestPath}: ${(e as Error).message}`);
  }

  const result = demoManifestSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`demo.manifest.yaml is invalid:\n${JSON.stringify(result.error.issues, null, 2)}`);
  }
  const manifest = result.data;

  // Resolve the two JSON files relative to the manifest's own directory.
  const baseDir = dirname(manifestPath);
  const mapping = await readJson<{ fields: MappingFieldEntry[]; [k: string]: unknown }>(
    resolve(baseDir, manifest.index.mappingFile),
  );
  if (!Array.isArray(mapping.fields)) {
    throw new Error(`${manifest.index.mappingFile} has no "fields" array — expected a field-mapping export.`);
  }

  const documentsRaw = await readJson<unknown>(resolve(baseDir, manifest.index.documentsFile));
  const documents = Array.isArray(documentsRaw)
    ? (documentsRaw as Record<string, unknown>[])
    : ((documentsRaw as { documents?: unknown[]; products?: unknown[] }).documents ??
        (documentsRaw as { products?: unknown[] }).products ??
        []) as Record<string, unknown>[];
  if (documents.length === 0) {
    throw new Error(`${manifest.index.documentsFile} contained no documents.`);
  }

  return { manifest, mapping, documents, manifestPath };
}

async function readJson<T>(path: string): Promise<T> {
  if (!existsSync(path)) throw new Error(`Referenced file not found: ${path}`);
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch (e) {
    throw new Error(`Failed to parse JSON ${path}: ${(e as Error).message}`);
  }
}
