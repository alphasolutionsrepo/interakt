// src/features/tools/lookup-fields.service.ts

/**
 * A Find Record tool's name and code fields against its data source: the fields a picker can
 * offer, what a save may store, what to suggest, and what has gone missing since.
 *
 * Reads through the repositories: data-source.service imports tools.service, so going through
 * the data source service from here would be an import cycle.
 */

import {
  checkLookupFields,
  chosenLookupFields,
  hasChosenLookupFields,
  missingLookupFields,
  suggestLookupFields,
  type LookupFieldCandidate,
  type LookupFieldProblem,
  type LookupFieldRules,
  type LookupFieldsConfig,
} from './executors/data-source/lookup-field-rules';

import type { DataSourceSchema } from '@/db/schema/data-sources.schema';
import * as dataSourceRepository from '@/features/data-source/data-source.repository';
import * as searchIndexFieldsRepository from '@/features/search-index/search-index-fields.repository';

/** Field types whose paths (variants.sku) can be chosen */
const PATH_TYPES = new Set(['json', 'object', 'nested']);

export interface LookupFieldsContext {
  candidates: LookupFieldCandidate[];
  rules: LookupFieldRules;
}

/**
 * The fields a Find Record tool on this data source can choose from, or null when its Find
 * Record doesn't take name or code fields (uploaded files: id only) or the source is gone.
 * Managed index: the index's own field definitions, which are always current. External source:
 * the schema discovery last read (refreshed by health checks).
 */
export async function lookupFieldsContext(dataSourceId: string | null | undefined): Promise<LookupFieldsContext | null> {
  if (!dataSourceId) return null;
  const dataSource = await dataSourceRepository.getDataSourceById(dataSourceId);
  if (!dataSource) return null;

  if (dataSource.type === 'search_index') {
    const searchIndexId = (dataSource.config as { searchIndexId?: string } | null)?.searchIndexId;
    if (!searchIndexId) return null;
    const roles = new Map(((dataSource.schema as DataSourceSchema | null)?.fields ?? []).map((f) => [f.name, f.role]));
    const fields = await searchIndexFieldsRepository.getFieldsBySearchIndexId(searchIndexId);
    return {
      candidates: fields.map((f) => ({
        name: f.fieldName,
        type: f.fieldType,
        searchable: f.isSearchable,
        filterable: f.isFacetable,
        hasPaths: PATH_TYPES.has(f.fieldType),
        role: roles.get(f.fieldName) ?? null,
        shownInResponses: f.includeInResponse,
      })),
      rules: { findsThroughSearch: true, codesNeedFilter: false },
    };
  }

  if (dataSource.type === 'search_index_external') {
    const schema = dataSource.schema as DataSourceSchema | null;
    const fields = schema?.fields ?? [];
    // Each discovery stamps the fields it saw; a sampled schema keeps the ones it didn't
    const latestSample = schema?.discoveredFrom === 'sample'
      ? fields.reduce((latest, f) => ((f.profile?.profiledAt ?? '') > latest ? f.profile!.profiledAt : latest), '')
      : '';
    return {
      candidates: fields.map((f) => ({
        name: f.name,
        type: f.type,
        searchable: f.isSearchable,
        filterable: f.isFilterable,
        hasPaths: PATH_TYPES.has(f.type),
        role: f.role ?? null,
        nullRate: f.profile?.nullRate,
        notInLatestSample: latestSample !== '' && (f.profile?.profiledAt ?? '') < latestSample,
      })),
      rules: { findsThroughSearch: true, codesNeedFilter: true },
    };
  }

  return null;
}

/**
 * Check a Find Record tool's config before it is stored. Only fields this save adds are
 * checked, so a tool saved for another reason never fails on a field chosen earlier.
 * Throws "Invalid config: ..." (a 400) on a field that can't work; returns the warnings.
 */
export async function checkLookupFieldsForSave(
  dataSourceId: string | null | undefined,
  config: LookupFieldsConfig | undefined,
  previous?: LookupFieldsConfig,
): Promise<LookupFieldProblem[]> {
  const chosen = chosenLookupFields(config);
  const before = chosenLookupFields(previous);
  const added = new Set(
    [...chosen.nameFields.filter((f) => !before.nameFields.includes(f)), ...chosen.codeFields.filter((f) => !before.codeFields.includes(f))],
  );
  if (added.size === 0) return [];

  const context = await lookupFieldsContext(dataSourceId);
  if (!context) throw new Error('Invalid config: name and code fields only apply to Find Record on a search index');
  if (context.candidates.length === 0) {
    throw new Error(context.rules.codesNeedFilter
      ? 'Invalid config: the data source has no fields yet. Run a health check on the data source first'
      : 'Invalid config: the search index has no fields yet. Add its fields first');
  }
  const { errors, warnings } = checkLookupFields(config, context.candidates, context.rules, added);
  if (errors.length > 0) throw new Error(`Invalid config: ${errors.map((e) => e.message).join('; ')}`);
  return warnings;
}

/** Fields to pre-fill for a Find Record tool on this data source (empty when none fit). */
export async function suggestLookupFieldsFor(dataSourceId: string): Promise<{ nameFields: string[]; codeFields: string[] }> {
  const context = await lookupFieldsContext(dataSourceId);
  return context ? suggestLookupFields(context.candidates, context.rules) : { nameFields: [], codeFields: [] };
}

/** What a Find Record tool's pages show: what it can choose from, what has gone missing, and what is weak. */
export async function lookupFieldsStatus(dataSourceId: string | null | undefined, config: LookupFieldsConfig | undefined) {
  const context = await lookupFieldsContext(dataSourceId);
  if (!context) return null;
  const chosen = chosenLookupFields(config);
  return {
    candidates: context.candidates.filter((f) => f.type !== 'vector'),
    rules: context.rules,
    chosen,
    configured: hasChosenLookupFields(config),
    missing: context.candidates.length > 0 ? missingLookupFields(config, context.candidates) : [],
    warnings: checkLookupFields(chosen, context.candidates, context.rules).warnings,
    suggested: suggestLookupFields(context.candidates, context.rules),
  };
}
