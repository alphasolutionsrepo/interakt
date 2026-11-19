import { describe, it, expect } from 'vitest';
import {
  createAIExperienceSchema,
  updateAIExperienceSchema,
  listAIExperiencesQuerySchema,
  personaConfigSchema,
  guardrailConfigSchema,
  sessionConfigSchema,
  accessConfigSchema,
  observabilityConfigSchema,
  pipelineConfigSchema,
  assignToolSchema,
  updateToolAssignmentSchema,
} from './ai-experience.validation';

// ============================================================================
// HELPERS — minimal valid payloads
// ============================================================================

const validPersona = {
  tone: 'professional' as const,
  systemInstructions: 'You are a helpful plumbing supplies expert.',
  responseFormats: {
    enabledPresets: ['markdown_rich' as const],
    defaultPreset: 'markdown_rich' as const,
    enableCitations: true,
    citationStyle: 'inline' as const,
  },
};

const validSession = {
  maxContextMessages: 20,
};

const validAccess = {
  rateLimits: { chatPerMinute: 30, requestsPerDay: 10_000 },
};

const validObservability = {};

const validCreate = {
  name: 'PlumbPro Assistant',
  slug: 'plumbpro',
  personaConfig: validPersona,
  sessionConfig: validSession,
  accessConfig: validAccess,
  observabilityConfig: validObservability,
};

// ============================================================================
// PERSONA CONFIG
// ============================================================================

describe('personaConfigSchema', () => {
  it('accepts valid persona', () => {
    const result = personaConfigSchema.safeParse(validPersona);
    expect(result.success).toBe(true);
  });

  it('requires systemInstructions min 10 chars', () => {
    const result = personaConfigSchema.safeParse({
      ...validPersona,
      systemInstructions: 'short',
    });
    expect(result.success).toBe(false);
  });

  it('requires at least one enabled preset', () => {
    const result = personaConfigSchema.safeParse({
      ...validPersona,
      responseFormats: { ...validPersona.responseFormats, enabledPresets: [] },
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional fields', () => {
    const result = personaConfigSchema.safeParse({
      ...validPersona,
      name: 'PlumbBot',
      avatarUrl: 'https://example.com/avatar.png',
      focusAreas: ['plumbing', 'HVAC'],
      avoidTopics: ['politics'],
      businessDomains: ['plumbing'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid tone', () => {
    const result = personaConfigSchema.safeParse({
      ...validPersona,
      tone: 'aggressive',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid citation style', () => {
    const result = personaConfigSchema.safeParse({
      ...validPersona,
      responseFormats: { ...validPersona.responseFormats, citationStyle: 'superscript' },
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// GUARDRAIL CONFIG
// ============================================================================

describe('guardrailConfigSchema', () => {
  const validGuardrail = {
    inputGuardrail: {
      enabled: true,
      rules: [
        {
          id: 'topic-gate',
          name: 'Topic Gate',
          type: 'topic_gate' as const,
          config: { domains: ['plumbing'] },
          action: 'block' as const,
          enabled: true,
          priority: 0,
        },
      ],
      onBlock: { message: "I can only help with plumbing topics." },
    },
    outputGuardrail: {
      enabled: false,
      rules: [],
      onBlock: { message: "Response blocked." },
    },
  };

  it('accepts valid guardrail config', () => {
    const result = guardrailConfigSchema.safeParse(validGuardrail);
    expect(result.success).toBe(true);
  });

  it('requires both input and output guardrails', () => {
    const result = guardrailConfigSchema.safeParse({
      inputGuardrail: validGuardrail.inputGuardrail,
    });
    expect(result.success).toBe(false);
  });

  it('validates rule types', () => {
    const result = guardrailConfigSchema.safeParse({
      ...validGuardrail,
      inputGuardrail: {
        ...validGuardrail.inputGuardrail,
        rules: [{ ...validGuardrail.inputGuardrail.rules[0], type: 'invalid_type' }],
      },
    });
    expect(result.success).toBe(false);
  });

  it('validates rule actions', () => {
    const result = guardrailConfigSchema.safeParse({
      ...validGuardrail,
      inputGuardrail: {
        ...validGuardrail.inputGuardrail,
        rules: [{ ...validGuardrail.inputGuardrail.rules[0], action: 'destroy' }],
      },
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// SESSION CONFIG
// ============================================================================

describe('sessionConfigSchema', () => {
  it('applies defaults', () => {
    const result = sessionConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sessionTtlMinutes).toBe(1440);
      expect(result.data.maxContextMessages).toBe(20);
      expect(result.data.enableConversationSummary).toBe(false);
      expect(result.data.summaryThreshold).toBe(30);
      expect(result.data.enableUserContext).toBe(false);
    }
  });

  it('rejects TTL above 43200 (30 days)', () => {
    const result = sessionConfigSchema.safeParse({ sessionTtlMinutes: 50_000 });
    expect(result.success).toBe(false);
  });

  it('accepts optional maxSessionsPerUser', () => {
    const result = sessionConfigSchema.safeParse({ maxSessionsPerUser: 5 });
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// ACCESS CONFIG
// ============================================================================

describe('accessConfigSchema', () => {
  it('accepts valid access config', () => {
    const result = accessConfigSchema.safeParse(validAccess);
    expect(result.success).toBe(true);
  });

  it('applies rate limit defaults (the same 60 per minute the form, the seeders and the docs use)', () => {
    const result = accessConfigSchema.safeParse({ rateLimits: {} });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rateLimits.chatPerMinute).toBe(60);
      expect(result.data.rateLimits.requestsPerDay).toBe(10_000);
    }
  });

  it('defaults allowedOrigins to empty array', () => {
    const result = accessConfigSchema.safeParse({ rateLimits: {} });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.allowedOrigins).toEqual([]);
    }
  });

  it('accepts embed config', () => {
    const result = accessConfigSchema.safeParse({
      ...validAccess,
      embedConfig: {
        widgetTheme: 'dark',
        widgetPosition: 'bottom-right',
        primaryColor: '#FF5733',
        welcomeMessage: 'Hi there!',
        showBranding: true,
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid hex color in embed config', () => {
    const result = accessConfigSchema.safeParse({
      ...validAccess,
      embedConfig: {
        widgetTheme: 'light',
        widgetPosition: 'inline',
        primaryColor: 'red',
        showBranding: false,
      },
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// OBSERVABILITY CONFIG
// ============================================================================

describe('observabilityConfigSchema', () => {
  it('applies defaults', () => {
    const result = observabilityConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.telemetryDetailLevel).toBe('metadata');
      expect(result.data.enableConversationLogging).toBe(true);
      expect(result.data.conversationRetentionDays).toBe(90);
    }
  });

  it('accepts full telemetry level', () => {
    const result = observabilityConfigSchema.safeParse({
      telemetryDetailLevel: 'full',
      enableConversationLogging: true,
      conversationRetentionDays: 30,
    });
    expect(result.success).toBe(true);
  });

  it('rejects retention days above 365', () => {
    const result = observabilityConfigSchema.safeParse({
      conversationRetentionDays: 500,
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// PIPELINE CONFIG
// ============================================================================

describe('pipelineConfigSchema', () => {
  const validPipeline = {
    mode: 'deterministic' as const,
    steps: [
      {
        id: 'input-guardrail',
        type: 'input_guardrail',
        name: 'Input Guardrail',
        config: {},
        enabled: true,
        order: 0,
      },
      {
        id: 'intent-detection',
        type: 'intent_detection',
        name: 'Intent Detection',
        config: {},
        enabled: true,
        order: 1,
        onFailure: 'abort' as const,
      },
    ],
    settings: {},
  };

  it('accepts valid pipeline config', () => {
    const result = pipelineConfigSchema.safeParse(validPipeline);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.settings.maxTotalDurationMs).toBe(30_000);
      expect(result.data.settings.enableTracing).toBe(true);
      expect(result.data.settings.onStepFailure).toBe('abort');
    }
  });

  it('requires mode', () => {
    const result = pipelineConfigSchema.safeParse({
      steps: [],
      settings: {},
    });
    expect(result.success).toBe(false);
  });

  it('accepts step conditions', () => {
    const result = pipelineConfigSchema.safeParse({
      ...validPipeline,
      steps: [
        {
          ...validPipeline.steps[0],
          conditions: [
            { field: 'stepResults.intent.data.action', operator: 'eq', value: 'search' },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects maxTotalDurationMs above 120000', () => {
    const result = pipelineConfigSchema.safeParse({
      ...validPipeline,
      settings: { maxTotalDurationMs: 200_000 },
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// CREATE AI EXPERIENCE
// ============================================================================

describe('createAIExperienceSchema', () => {
  it('accepts valid create payload', () => {
    const result = createAIExperienceSchema.safeParse(validCreate);
    expect(result.success).toBe(true);
  });

  it('requires name', () => {
    const result = createAIExperienceSchema.safeParse({ ...validCreate, name: '' });
    expect(result.success).toBe(false);
  });

  it('requires valid slug format', () => {
    const result = createAIExperienceSchema.safeParse({ ...validCreate, slug: 'Bad Slug!' });
    expect(result.success).toBe(false);
  });

  it('requires personaConfig', () => {
    const { personaConfig: _, ...rest } = validCreate;
    const result = createAIExperienceSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('requires sessionConfig', () => {
    const { sessionConfig: _, ...rest } = validCreate;
    const result = createAIExperienceSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('requires accessConfig', () => {
    const { accessConfig: _, ...rest } = validCreate;
    const result = createAIExperienceSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('defaults pipelineMode to deterministic', () => {
    const result = createAIExperienceSchema.safeParse(validCreate);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pipelineMode).toBe('deterministic');
    }
  });

  it('defaults toolIds to empty array', () => {
    const result = createAIExperienceSchema.safeParse(validCreate);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.toolIds).toEqual([]);
    }
  });

  it('accepts optional pipelineConfig', () => {
    const result = createAIExperienceSchema.safeParse({
      ...validCreate,
      pipelineConfig: {
        mode: 'deterministic',
        steps: [],
        settings: {},
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts optional guardrailConfig', () => {
    const result = createAIExperienceSchema.safeParse({
      ...validCreate,
      guardrailConfig: {
        inputGuardrail: {
          enabled: true,
          rules: [],
          onBlock: { message: 'Blocked' },
        },
        outputGuardrail: {
          enabled: false,
          rules: [],
          onBlock: { message: 'Blocked' },
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts tool IDs as UUIDs', () => {
    const result = createAIExperienceSchema.safeParse({
      ...validCreate,
      toolIds: ['550e8400-e29b-41d4-a716-446655440000'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-UUID tool IDs', () => {
    const result = createAIExperienceSchema.safeParse({
      ...validCreate,
      toolIds: ['not-a-uuid'],
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// UPDATE AI EXPERIENCE
// ============================================================================

describe('updateAIExperienceSchema', () => {
  it('accepts partial update', () => {
    const result = updateAIExperienceSchema.safeParse({ name: 'New Name' });
    expect(result.success).toBe(true);
  });

  it('rejects empty object', () => {
    const result = updateAIExperienceSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('accepts nullable guardrailConfig (to remove)', () => {
    const result = updateAIExperienceSchema.safeParse({ guardrailConfig: null });
    expect(result.success).toBe(true);
  });

  it('accepts nullable providerId', () => {
    const result = updateAIExperienceSchema.safeParse({ providerId: null });
    expect(result.success).toBe(true);
  });

  it('accepts individual config domain updates', () => {
    const result = updateAIExperienceSchema.safeParse({
      personaConfig: validPersona,
      sessionConfig: { maxContextMessages: 30 },
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// TOOL ASSIGNMENT
// ============================================================================

describe('assignToolSchema', () => {
  it('accepts valid assignment', () => {
    const result = assignToolSchema.safeParse({
      toolId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isEnabled).toBe(true);
      expect(result.data.sortOrder).toBe(0);
    }
  });

  it('rejects invalid toolId', () => {
    const result = assignToolSchema.safeParse({ toolId: 'bad' });
    expect(result.success).toBe(false);
  });

  it('accepts override fields', () => {
    const result = assignToolSchema.safeParse({
      toolId: '550e8400-e29b-41d4-a716-446655440000',
      overrideAiDescription: 'Custom description for this experience',
      overrideConfig: { maxResults: 5 },
      isEnabled: false,
      sortOrder: 3,
    });
    expect(result.success).toBe(true);
  });
});

describe('updateToolAssignmentSchema', () => {
  it('accepts partial updates', () => {
    const result = updateToolAssignmentSchema.safeParse({ isEnabled: false });
    expect(result.success).toBe(true);
  });

  it('accepts sortOrder update', () => {
    const result = updateToolAssignmentSchema.safeParse({ sortOrder: 5 });
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// LIST QUERY
// ============================================================================

describe('listAIExperiencesQuerySchema', () => {
  it('applies defaults', () => {
    const result = listAIExperiencesQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(25);
      expect(result.data.sortBy).toBe('createdAt');
      expect(result.data.sortOrder).toBe('desc');
    }
  });

  it('coerces string numbers', () => {
    const result = listAIExperiencesQuerySchema.safeParse({ page: '2', pageSize: '50' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.pageSize).toBe(50);
    }
  });

  it('accepts pipeline mode filter', () => {
    const result = listAIExperiencesQuerySchema.safeParse({ pipelineMode: 'agentic' });
    expect(result.success).toBe(true);
  });

  it('transforms isActive string to boolean', () => {
    const result = listAIExperiencesQuerySchema.safeParse({ isActive: 'false' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isActive).toBe(false);
    }
  });
});

// ============================================================================
// FREE-FORM RECORD FIELDS (acceptance pins: records of unknown keep their content;
// a string or array in a record's place is rejected with an invalid_type at its path)
// ============================================================================

describe('free-form record fields', () => {
  const freeForm = { threshold: 0.5, list: ['a', { b: null }], nested: { deep: true } };
  const pathsOf = (result: { success: boolean; error?: { issues: Array<{ code: string; path: PropertyKey[] }> } }) =>
    result.error?.issues.map((i) => ({ code: i.code, path: i.path }));

  describe('tool assignment overrideConfig', () => {
    const toolId = '123e4567-e89b-42d3-a456-426614174000';

    it('assign: keeps the record as sent; null becomes undefined', () => {
      expect(assignToolSchema.parse({ toolId, overrideConfig: freeForm }).overrideConfig).toEqual(freeForm);
      expect(assignToolSchema.parse({ toolId, overrideConfig: null }).overrideConfig).toBeUndefined();
    });

    it.each([['a string', 'x'], ['an array', [1]]])('assign: %s is rejected at overrideConfig', (_n, value) => {
      expect(pathsOf(assignToolSchema.safeParse({ toolId, overrideConfig: value }))).toEqual([{ code: 'invalid_type', path: ['overrideConfig'] }]);
    });

    it('update: keeps the record; a string is rejected at overrideConfig', () => {
      expect(updateToolAssignmentSchema.parse({ overrideConfig: freeForm }).overrideConfig).toEqual(freeForm);
      expect(pathsOf(updateToolAssignmentSchema.safeParse({ overrideConfig: 'x' }))).toEqual([{ code: 'invalid_type', path: ['overrideConfig'] }]);
    });
  });

  describe('pipeline step config and fallbackConfig', () => {
    const step = (over: Record<string, unknown>) => ({
      mode: 'deterministic' as const,
      steps: [{ id: 's', type: 't', name: 'n', config: {}, enabled: true, order: 0, ...over }],
      settings: {},
    });

    it('keeps config and fallbackConfig as sent', () => {
      const parsed = pipelineConfigSchema.parse(step({ config: freeForm, fallbackConfig: freeForm }));
      expect(parsed.steps[0].config).toEqual(freeForm);
      expect(parsed.steps[0].fallbackConfig).toEqual(freeForm);
    });

    it.each([['config', 'x'], ['config', [1]], ['fallbackConfig', 'x'], ['fallbackConfig', [1]]])('rejects %s given %j', (key, value) => {
      expect(pathsOf(pipelineConfigSchema.safeParse(step({ [key]: value })))).toEqual([{ code: 'invalid_type', path: ['steps', 0, key] }]);
    });
  });

  describe('guardrail rule config', () => {
    const rule = (config: unknown) => ({
      id: 'r', name: 'n', type: 'topic_gate' as const, config, action: 'block', enabled: true, priority: 1,
    });
    const side = (config: unknown) => ({ enabled: true, rules: [rule(config)], onBlock: { message: 'no' } });

    it('keeps the rule config as sent', () => {
      const parsed = guardrailConfigSchema.parse({ inputGuardrail: side(freeForm), outputGuardrail: { ...side({}), rules: [] } });
      expect(parsed.inputGuardrail.rules[0].config).toEqual(freeForm);
    });

    it.each([['a string', 'x'], ['an array', [1]]])('rejects a rule config given %s', (_n, value) => {
      const result = guardrailConfigSchema.safeParse({ inputGuardrail: side(value), outputGuardrail: { ...side({}), rules: [] } });
      expect(pathsOf(result)).toContainEqual({ code: 'invalid_type', path: ['inputGuardrail', 'rules', 0, 'config'] });
    });
  });
});
