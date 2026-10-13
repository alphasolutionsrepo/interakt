// app/search-experiences/_lib/hooks/useAvailableDisplayFields.ts

/**
 * Fields a search experience can show in results: the response fields of its
 * search indexes plus the retrievable fields of its external indexes (from the
 * data source schema). Shared by the create wizard and the edit page.
 */

'use client';

import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { dataSourcesApi } from '@/app/data-sources/_lib/api-client';
import type { DataSourceField } from '@/db/schema/data-sources.schema';

export interface DisplayFieldOption {
  id: number;
  fieldName: string;
  displayName: string | null;
  fieldType: string;
  includeInResponse: boolean;
}

export function useAvailableDisplayFields(searchIndexIds: string[], externalSourceIds: string[]) {
  const indexFieldQueries = useQueries({
    queries: searchIndexIds.map((searchIndexId) => ({
      queryKey: ['search-index-fields', searchIndexId],
      queryFn: async () => {
        const response = await fetch(`/api/search-indexes/${searchIndexId}/fields`);
        if (!response.ok) throw new Error('Failed to fetch fields');
        const data = await response.json();
        return { indexId: searchIndexId, fields: (data.data || data.fields || []) as DisplayFieldOption[] };
      },
      enabled: !!searchIndexId,
    })),
  });

  const externalQueries = useQueries({
    queries: externalSourceIds.map((dataSourceId) => ({
      queryKey: ['data-source', dataSourceId],
      queryFn: () => dataSourcesApi.getById(dataSourceId),
      enabled: !!dataSourceId,
    })),
  });

  const isLoading = indexFieldQueries.some((q) => q.isLoading) || externalQueries.some((q) => q.isLoading);

  const availableFields = useMemo(() => {
    const fieldMap = new Map<string, DisplayFieldOption>();

    for (const query of indexFieldQueries) {
      for (const f of query.data?.fields ?? []) {
        if (f.includeInResponse && !fieldMap.has(f.fieldName)) fieldMap.set(f.fieldName, f);
      }
    }

    for (const query of externalQueries) {
      const fields = (query.data?.schema as { fields?: DataSourceField[] } | null | undefined)?.fields ?? [];
      fields.forEach((f, i) => {
        if (f.isRetrievable !== false && !fieldMap.has(f.name)) {
          fieldMap.set(f.name, {
            id: -(i + 1),
            fieldName: f.name,
            displayName: f.displayName || null,
            fieldType: f.type,
            includeInResponse: true,
          });
        }
      });
    }

    return Array.from(fieldMap.values());
  }, [indexFieldQueries, externalQueries]);

  return { availableFields, isLoading };
}
