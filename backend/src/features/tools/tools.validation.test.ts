import { describe, it, expect } from 'vitest';
import {
  createToolSchema,
  updateToolSchema,
  listToolsQuerySchema,
  updateToolHealthSchema,
} from './tools.validation';

// ============================================================================
// HELPERS
// ============================================================================

/** Minimal valid base fields shared by all tool types */
const baseFields = {
  name: 'My Tool',
  slug: 'my-tool',
  aiDescription: 'This tool does something useful for the AI agent',
};

// ============================================================================
// CREATE TOOL — PER-EXECUTOR CONFIG VALIDATION
// ============================================================================

describe('createToolSchema', () => {
  // --------------------------------------------------------------------------
  // data_source executor
  // --------------------------------------------------------------------------
  describe('executorType: data_source', () => {
    const validSearch = {
      ...baseFields,
      executorType: 'data_source' as const,
      dataSourceId: '550e8400-e29b-41d4-a716-446655440000',
      operation: 'search' as const,
      executorConfig: {
        maxResults: 20,
        searchType: 'hybrid' as const,
      },
    };

    it('accepts valid data_source search config', () => {
      const result = createToolSchema.safeParse(validSearch);
      expect(result.success).toBe(true);
    });

    it('requires dataSourceId as uuid', () => {
      const result = createToolSchema.safeParse({
        ...validSearch,
        dataSourceId: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });

    it('requires operation', () => {
      const result = createToolSchema.safeParse({
        ...validSearch,
        operation: undefined,
      });
      expect(result.success).toBe(false);
    });

    it('accepts lookup operation', () => {
      const result = createToolSchema.safeParse({
        ...baseFields,
        executorType: 'data_source' as const,
        dataSourceId: '550e8400-e29b-41d4-a716-446655440000',
        operation: 'lookup' as const,
        executorConfig: {
          idField: 'product_id',
        },
      });
      expect(result.success).toBe(true);
    });

    it('accepts inspect operation', () => {
      const result = createToolSchema.safeParse({
        ...baseFields,
        executorType: 'data_source' as const,
        dataSourceId: '550e8400-e29b-41d4-a716-446655440000',
        operation: 'inspect' as const,
        executorConfig: {
          includeFieldStats: true,
        },
      });
      expect(result.success).toBe(true);
    });

    it('accepts enumerate operation', () => {
      const result = createToolSchema.safeParse({
        ...baseFields,
        executorType: 'data_source' as const,
        dataSourceId: '550e8400-e29b-41d4-a716-446655440000',
        operation: 'enumerate' as const,
        executorConfig: {
          maxValues: 100,
          defaultField: 'category',
        },
      });
      expect(result.success).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // http executor
  // --------------------------------------------------------------------------
  describe('executorType: http', () => {
    const validHttp = {
      ...baseFields,
      executorType: 'http' as const,
      executorConfig: {
        baseUrl: 'https://api.example.com/v1/products',
        method: 'GET' as const,
        responseMapping: { resultsPath: 'data.items' },
      },
    };

    it('accepts valid http config', () => {
      const result = createToolSchema.safeParse(validHttp);
      expect(result.success).toBe(true);
    });

    it('accepts config with method field', () => {
      const result = createToolSchema.safeParse(validHttp);
      expect(result.success).toBe(true);
    });

    it('accepts authentication config', () => {
      const result = createToolSchema.safeParse({
        ...validHttp,
        executorConfig: {
          ...validHttp.executorConfig,
          authentication: { type: 'bearer', valueRef: 'secret:api-key' },
        },
      });
      expect(result.success).toBe(true);
    });

    it('accepts web search variant config', () => {
      const result = createToolSchema.safeParse({
        ...baseFields,
        executorType: 'http' as const,
        executorConfig: {
          maxResults: 5,
          searchDepth: 'advanced',
          includeAnswer: true,
        },
      });
      expect(result.success).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // ai_call executor
  // --------------------------------------------------------------------------
  describe('executorType: ai_call', () => {
    const validAiCall = {
      ...baseFields,
      executorType: 'ai_call' as const,
      executorConfig: {
        instructions: 'You are a helpful product recommendation assistant.',
      },
    };

    it('accepts valid ai_call config', () => {
      const result = createToolSchema.safeParse(validAiCall);
      expect(result.success).toBe(true);
    });

    it('requires instructions', () => {
      const result = createToolSchema.safeParse({
        ...validAiCall,
        executorConfig: {},
      });
      expect(result.success).toBe(false);
    });

    it('accepts optional model/temperature settings', () => {
      const result = createToolSchema.safeParse({
        ...validAiCall,
        executorConfig: {
          ...validAiCall.executorConfig,
          temperature: 0.7,
          maxTokens: 1000,
          contextSources: ['conversation_history', 'tool_results'],
        },
      });
      expect(result.success).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Executor type validation
  // --------------------------------------------------------------------------
  describe('executor type validation', () => {
    it('rejects unknown executor type', () => {
      const result = createToolSchema.safeParse({
        ...baseFields,
        executorType: 'unknown_type',
        executorConfig: {},
      });
      expect(result.success).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Common base field validation
  // --------------------------------------------------------------------------
  describe('base fields', () => {
    const validTool = {
      ...baseFields,
      executorType: 'http' as const,
      executorConfig: {
        maxResults: 5,
        searchDepth: 'basic' as const,
      },
    };

    it('requires name', () => {
      const result = createToolSchema.safeParse({ ...validTool, name: '' });
      expect(result.success).toBe(false);
    });

    it('requires valid slug format', () => {
      const result = createToolSchema.safeParse({ ...validTool, slug: 'Invalid Slug!' });
      expect(result.success).toBe(false);
    });

    it('requires aiDescription min 10 chars', () => {
      const result = createToolSchema.safeParse({ ...validTool, aiDescription: 'short' });
      expect(result.success).toBe(false);
    });

    it('applies default timeout of 30000', () => {
      const result = createToolSchema.safeParse(validTool);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.timeout).toBe(30_000);
      }
    });

    it('rejects timeout below 1000', () => {
      const result = createToolSchema.safeParse({ ...validTool, timeout: 500 });
      expect(result.success).toBe(false);
    });

    it('rejects timeout above 300000', () => {
      const result = createToolSchema.safeParse({ ...validTool, timeout: 500_000 });
      expect(result.success).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Reliability config
  // --------------------------------------------------------------------------
  describe('reliability config', () => {
    const validTool = {
      ...baseFields,
      executorType: 'http' as const,
      executorConfig: {
        maxResults: 5,
        searchDepth: 'basic' as const,
      },
    };

    it('accepts retryConfig', () => {
      const result = createToolSchema.safeParse({
        ...validTool,
        retryConfig: { count: 3, backoff: 'linear' },
      });
      expect(result.success).toBe(true);
    });

    it('rejects retry count > 5', () => {
      const result = createToolSchema.safeParse({
        ...validTool,
        retryConfig: { count: 10, backoff: 'exponential' },
      });
      expect(result.success).toBe(false);
    });

    it('accepts fallbackConfig', () => {
      const result = createToolSchema.safeParse({
        ...validTool,
        fallbackConfig: { type: 'skip', config: {} },
      });
      expect(result.success).toBe(true);
    });

    it('accepts healthCheckConfig', () => {
      const result = createToolSchema.safeParse({
        ...validTool,
        healthCheckConfig: { enabled: true, intervalMs: 30_000, timeout: 5000 },
      });
      expect(result.success).toBe(true);
    });
  });
});

// ============================================================================
// UPDATE TOOL
// ============================================================================

describe('updateToolSchema', () => {
  it('accepts partial updates', () => {
    const result = updateToolSchema.safeParse({ name: 'New Name' });
    expect(result.success).toBe(true);
  });

  it('rejects empty object', () => {
    const result = updateToolSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('accepts executorConfig as generic record', () => {
    const result = updateToolSchema.safeParse({
      executorConfig: { maxResults: 20, searchType: 'hybrid' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts nullable fallbackConfig', () => {
    const result = updateToolSchema.safeParse({ fallbackConfig: null });
    expect(result.success).toBe(true);
  });

  it('accepts nullable healthCheckConfig', () => {
    const result = updateToolSchema.safeParse({ healthCheckConfig: null });
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// LIST QUERY
// ============================================================================

describe('listToolsQuerySchema', () => {
  it('applies defaults', () => {
    const result = listToolsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(25);
      expect(result.data.sortBy).toBe('createdAt');
      expect(result.data.sortOrder).toBe('desc');
    }
  });

  it('coerces string numbers', () => {
    const result = listToolsQuerySchema.safeParse({ page: '3', pageSize: '10' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(3);
      expect(result.data.pageSize).toBe(10);
    }
  });

  it('accepts executorType filter', () => {
    const result = listToolsQuerySchema.safeParse({ executorType: 'http' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid executorType', () => {
    const result = listToolsQuerySchema.safeParse({ executorType: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('accepts operation filter', () => {
    const result = listToolsQuerySchema.safeParse({ operation: 'search' });
    expect(result.success).toBe(true);
  });

  it('transforms isActive string to boolean', () => {
    const result = listToolsQuerySchema.safeParse({ isActive: 'true' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isActive).toBe(true);
    }
  });
});

// ============================================================================
// HEALTH UPDATE
// ============================================================================

describe('updateToolHealthSchema', () => {
  it('accepts valid health update', () => {
    const result = updateToolHealthSchema.safeParse({
      status: 'healthy',
      message: 'All systems operational',
    });
    expect(result.success).toBe(true);
  });

  it('requires status', () => {
    const result = updateToolHealthSchema.safeParse({ message: 'oops' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid status', () => {
    const result = updateToolHealthSchema.safeParse({ status: 'broken' });
    expect(result.success).toBe(false);
  });
});
