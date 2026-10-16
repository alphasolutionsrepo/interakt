// app/data-sources/_lib/external-config.ts

/**
 * External index config ↔ form state.
 *
 * The stored config keeps `provider` and `providerSettings` at the top level; the
 * form keeps everything under `connection` (and fixed filters as editable text).
 * Create and edit both convert through here, so the two can't drift apart.
 */

type Config = Record<string, unknown>;

interface FilterClause {
  field: string;
  operator: 'eq';
  value: string;
}

/** "attribute = value" lines → eq filter clauses. Lines without both sides are ignored. */
export function parseFixedFilters(text: string | undefined): FilterClause[] {
  return (text ?? '')
    .split('\n')
    .map((line) => line.split('='))
    .filter((parts) => parts.length >= 2 && parts[0].trim() && parts.slice(1).join('=').trim())
    .map(([field, ...rest]) => ({ field: field.trim(), operator: 'eq' as const, value: rest.join('=').trim() }));
}

/** eq filter clauses → "attribute = value" lines (other operators can't be edited as text). */
export function formatFixedFilters(filters: unknown): string {
  if (!Array.isArray(filters)) return '';
  return filters
    .filter((f): f is { field: string; operator: string; value: unknown } => !!f && typeof f === 'object' && 'field' in f)
    .filter((f) => f.operator === 'eq')
    .map((f) => `${f.field} = ${String(f.value)}`)
    .join('\n');
}

/** Stored config → form state. */
export function externalConfigToForm(config: Config): Config {
  const connection = (config.connection as Config) ?? {};
  const { fixedFilters, ...providerSettings } = (config.providerSettings as Config) ?? {};
  return {
    ...config,
    connection: {
      ...connection,
      provider: config.provider,
      providerSettings: { ...providerSettings, fixedFiltersText: formatFixedFilters(fixedFilters) },
    },
  };
}

/**
 * Form state → stored config. Settings the form doesn't edit (search defaults,
 * health check, profiling, non-eq fixed filters) are kept from `base`.
 */
export function externalFormToConfig(form: Config, base: Config = {}): Config {
  const connection = (form.connection as Config) ?? {};
  const provider = connection.provider;
  const { fixedFiltersText, ...providerSettings } = (connection.providerSettings as Config) ?? {};
  const baseSettings = (base.providerSettings as Config) ?? {};
  const keptFilters = Array.isArray(baseSettings.fixedFilters)
    ? (baseSettings.fixedFilters as Array<{ operator?: string }>).filter((f) => f?.operator !== 'eq')
    : [];
  const fixedFilters = [...keptFilters, ...parseFixedFilters(fixedFiltersText as string | undefined)];

  return {
    ...base,
    provider,
    connection: {
      url: connection.url,
      authType: connection.authType || 'api_key',
      credentials: connection.credentials || { secretRef: '' },
      indexName: connection.indexName,
    },
    searchDefaults: base.searchDefaults ?? { searchType: 'auto', maxResults: 10, includeHighlights: true },
    healthCheck: base.healthCheck ?? { enabled: true, intervalMs: 60000 },
    ...(provider === 'sitecore_search'
      ? { providerSettings: { ...baseSettings, entity: 'content', ...providerSettings, fixedFilters } }
      : { providerSettings: undefined }),
  };
}
