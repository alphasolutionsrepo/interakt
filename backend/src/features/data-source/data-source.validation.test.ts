import { describe, it, expect } from 'vitest';
import {
  createDataSourceSchema,
  updateDataSourceSchema,
  listDataSourcesQuerySchema,
  updateHealthSchema,
} from './data-source.validation';

// ============================================================================
// HELPERS
// ============================================================================

function validSearchIndexInput() {
  return {
    name: 'Products Catalog',
    slug: 'products-catalog',
    type: 'search_index' as const,
    config: {
      searchIndexId: '550e8400-e29b-41d4-a716-446655440000',
    },
  };
}

function validExternalIndexInput() {
  return {
    name: 'External ES',
    slug: 'external-es',
    type: 'search_index_external' as const,
    config: {
      provider: 'elasticsearch' as const,
      connection: {
        url: 'https://es.example.com:9200',
        authType: 'api_key' as const,
        credentials: { secretRef: '{{secret:es_key}}' },
        indexName: 'products',
      },
      searchDefaults: {
        searchType: 'hybrid' as const,
        maxResults: 10,
        includeHighlights: true,
      },
      healthCheck: {
        enabled: true,
        intervalMs: 60_000,
      },
    },
  };
}

function validFileStoreInput() {
  return {
    name: 'Support Docs',
    slug: 'support-docs',
    type: 'file_store' as const,
    config: {
      chunkingStrategy: 'paragraph' as const,
      chunkSize: 500,
      chunkOverlap: 50,
      embeddingProviderId: '550e8400-e29b-41d4-a716-446655440000',
      embeddingModelId: 1,
      maxFileSizeMb: 50,
      maxTotalStorageMb: 1000,
      allowedFileTypes: ['application/pdf', 'text/plain'],
      extractMetadata: true,
      extractTables: false,
    },
  };
}

function validDatabaseInput() {
  return {
    name: 'Orders DB',
    slug: 'orders-db',
    type: 'database' as const,
    config: {
      provider: 'postgresql' as const,
      connection: { secretRef: '{{secret:orders_db}}' },
      allowedTables: ['orders', 'order_items'],
      allowedOperations: ['SELECT'] as ['SELECT'],
      maxRowsPerQuery: 100,
      queryTimeout: 10_000,
      queryMode: 'template_only' as const,
    },
  };
}

// ============================================================================
// CREATE DATA SOURCE
// ============================================================================

describe('createDataSourceSchema', () => {
  describe('search_index type', () => {
    it('accepts valid search index input', () => {
      const result = createDataSourceSchema.safeParse(validSearchIndexInput());
      expect(result.success).toBe(true);
    });

    it('rejects missing searchIndexId', () => {
      const input = { ...validSearchIndexInput(), config: {} };
      const result = createDataSourceSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects invalid UUID for searchIndexId', () => {
      const input = validSearchIndexInput();
      input.config.searchIndexId = 'not-a-uuid';
      const result = createDataSourceSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('search_index_external type', () => {
    it('accepts valid external index input', () => {
      const result = createDataSourceSchema.safeParse(validExternalIndexInput());
      expect(result.success).toBe(true);
    });

    it('rejects invalid provider', () => {
      const input = validExternalIndexInput();
      (input.config as any).provider = 'solr';
      const result = createDataSourceSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects invalid connection URL', () => {
      const input = validExternalIndexInput();
      input.config.connection.url = 'not-a-url';
      const result = createDataSourceSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('file_store type', () => {
    it('accepts valid file store input', () => {
      const result = createDataSourceSchema.safeParse(validFileStoreInput());
      expect(result.success).toBe(true);
    });

    it('rejects empty allowedFileTypes', () => {
      const input = validFileStoreInput();
      input.config.allowedFileTypes = [];
      const result = createDataSourceSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('database type', () => {
    it('accepts valid database input', () => {
      const result = createDataSourceSchema.safeParse(validDatabaseInput());
      expect(result.success).toBe(true);
    });

    it('rejects empty allowedTables', () => {
      const input = validDatabaseInput();
      input.config.allowedTables = [];
      const result = createDataSourceSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('common fields', () => {
    it('rejects empty name', () => {
      const input = { ...validSearchIndexInput(), name: '' };
      const result = createDataSourceSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects invalid slug format', () => {
      const input = { ...validSearchIndexInput(), slug: 'Invalid Slug!' };
      const result = createDataSourceSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('accepts slug with hyphens', () => {
      const input = { ...validSearchIndexInput(), slug: 'my-data-source' };
      const result = createDataSourceSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('rejects unknown type', () => {
      const input = { ...validSearchIndexInput(), type: 'unknown' };
      const result = createDataSourceSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('validates config matches type (wrong config for type)', () => {
      const input = {
        ...validSearchIndexInput(),
        type: 'file_store' as const,
        config: { searchIndexId: '550e8400-e29b-41d4-a716-446655440000' },
      };
      const result = createDataSourceSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });
});

// ============================================================================
// UPDATE DATA SOURCE
// ============================================================================

describe('updateDataSourceSchema', () => {
  it('accepts partial updates', () => {
    const result = updateDataSourceSchema.safeParse({ name: 'New Name' });
    expect(result.success).toBe(true);
  });

  it('rejects empty update', () => {
    const result = updateDataSourceSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('accepts isActive toggle', () => {
    const result = updateDataSourceSchema.safeParse({ isActive: false });
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// LIST QUERY
// ============================================================================

describe('listDataSourcesQuerySchema', () => {
  it('provides defaults for empty query', () => {
    const result = listDataSourcesQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(25);
    expect(result.sortBy).toBe('createdAt');
    expect(result.sortOrder).toBe('desc');
  });

  it('coerces string numbers for page/pageSize', () => {
    const result = listDataSourcesQuerySchema.parse({ page: '3', pageSize: '10' });
    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(10);
  });

  it('filters by type', () => {
    const result = listDataSourcesQuerySchema.parse({ type: 'file_store' });
    expect(result.type).toBe('file_store');
  });

  it('rejects invalid type', () => {
    const result = listDataSourcesQuerySchema.safeParse({ type: 'invalid' });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// HEALTH UPDATE
// ============================================================================

describe('updateHealthSchema', () => {
  it('accepts valid health update', () => {
    const result = updateHealthSchema.safeParse({
      status: 'healthy',
      documentCount: 12847,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid status', () => {
    const result = updateHealthSchema.safeParse({ status: 'broken' });
    expect(result.success).toBe(false);
  });
});
