'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Loader2, Check } from 'lucide-react';
import { useMinDelayAction } from '@/shared/hooks';
import { Step1_BasicInfo } from './Step1_BasicInfo';
import type { Step1Data } from './Step1_BasicInfo';
import { Step2_Config } from './Step2_Config';
import type { DataSourceMeta } from './Step2_Config';
import { Step3_AiSettings } from './Step3_AiSettings';
import { ToolTypeChip } from '../ToolTypeChip';
import { useCreateTool } from '../../_lib/hooks/useTools';
import type { ExecutorType, DataSourceOperation, CreateToolPayload } from '../../_lib/api-client';

// Default AI schemas per executor type (kept in sync with backend EXECUTOR_INPUT_SCHEMAS)
const EXECUTOR_INPUT_SCHEMAS: Record<string, object> = {
  'data_source:search': {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The search query string' },
      filters: {
        type: 'array',
        description: 'Filter constraints to narrow results',
        items: {
          type: 'object',
          properties: {
            field: { type: 'string' },
            operator: { type: 'string', enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains', 'range'] },
            value: { type: 'string' },
          },
          required: ['field', 'operator', 'value'],
        },
      },
      sort: {
        type: 'array',
        description: 'Sort ordering for results',
        items: {
          type: 'object',
          properties: {
            field: { type: 'string' },
            direction: { type: 'string', enum: ['asc', 'desc'] },
          },
          required: ['field'],
        },
      },
      maxResults: { type: 'integer', description: 'Maximum results (1–100)', minimum: 1, maximum: 100 },
    },
    required: ['query'],
  },
  'data_source:inspect': {
    type: 'object',
    properties: {},
    required: [],
  },
  'data_source:enumerate': {
    type: 'object',
    properties: {
      field: { type: 'string', description: 'The field name to enumerate values for' },
      maxValues: { type: 'integer', description: 'Maximum distinct values to return', minimum: 1, maximum: 1000 },
    },
    required: ['field'],
  },
  'data_source:lookup': {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'The unique identifier of the document' },
    },
    required: ['id'],
  },
  http: {
    type: 'object',
    properties: { query: { type: 'string', description: 'The search or query string to send to the API' } },
    required: ['query'],
  },
  web_search: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The web search query' },
      maxResults: { type: 'integer', description: 'Maximum results to return (1–20)', minimum: 1, maximum: 20 },
    },
    required: ['query'],
  },
  ai_call: {
    type: 'object',
    properties: { input: { type: 'string', description: 'The input text or question to send to the AI responder' } },
    required: ['input'],
  },
};

/** Default AI descriptions for standalone executor types (shown as editable starting point in Step 3) */
const DEFAULT_AI_DESCRIPTIONS: Partial<Record<string, string>> = {
  web_search:
    'Search the live web for up-to-date information. Use this when the user asks about recent events, current prices, news, or anything that may have changed since the AI\'s training data. Returns titles, URLs, and content snippets from relevant web pages.',
  http:
    'Call an external API to retrieve or submit data. Use this when you need information from a specific service or need to perform an action.',
  ai_call:
    'Process the input with specialized AI reasoning. Use this for tasks requiring focused analysis or transformation.',
};

function generateSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 100);
}

// ============================================================================
// TYPES
// ============================================================================

interface WizardData {
  // Step 1
  name: string;
  slug: string;
  description: string;
  executorType: ExecutorType | '';
  // Step 2
  config: Record<string, unknown>;
  // Step 3
  aiDescription: string;
  inputSchema: string;
  outputSchema: string;
}

const STEPS = [
  { label: 'Basics', description: 'Name and type' },
  { label: 'Setup', description: 'Connection details' },
  { label: 'AI Behavior', description: 'AI description & schemas' },
];

// ============================================================================
// STEP INDICATOR
// ============================================================================

function StepIndicator({ current, steps }: { current: number; steps: typeof STEPS }) {
  return (
    <div className="flex items-center gap-2">
      {steps.map((step, i) => {
        const idx = i + 1;
        const done = idx < current;
        const active = idx === current;
        return (
          <div key={i} className="flex items-center gap-2">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex size-8 items-center justify-center rounded-full text-xs font-bold transition-all ${
                  done
                    ? 'bg-emerald-500 text-white'
                    : active
                    ? 'bg-primary text-primary-foreground ring-4 ring-primary/20'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {done ? <Check className="size-4" /> : idx}
              </div>
              <div className="text-center hidden sm:block">
                <p className={`text-[11px] font-semibold leading-tight ${active ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {step.label}
                </p>
                <p className="text-[10px] text-muted-foreground leading-tight">{step.description}</p>
              </div>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 w-8 sm:w-12 rounded-full ${idx < current ? 'bg-emerald-500' : 'bg-border'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// WIZARD
// ============================================================================

export function CreateWizard() {
  const router = useRouter();
  const { createTool, isCreating } = useCreateTool();
  const isRedirecting = useRef(false);

  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>({
    name: '',
    slug: '',
    description: '',
    executorType: '',
    config: {},
    aiDescription: '',
    inputSchema: '',
    outputSchema: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  function validateStep(s: number): boolean {
    const e: Record<string, string> = {};

    if (s === 1) {
      if (!data.name.trim()) e.name = 'Name is required';
      if (!data.slug.trim()) e.slug = 'Slug is required';
      else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug))
        e.slug = 'Slug must be lowercase letters, numbers, and hyphens only';
      if (!data.executorType) e.executorType = 'Please choose a tool type to continue';
    }

    if (s === 2) {
      if (data.executorType === 'data_source') {
        if (!data.config.dataSourceId) {
          e.dataSourceId = 'A data source is required';
        }
      }
      if (data.executorType === 'http') {
        if (!data.config.baseUrl) e.baseUrl = 'Base URL is required';
        if (!(data.config.responseMapping as Record<string, unknown>)?.resultsPath)
          e['responseMapping.resultsPath'] = 'Results path is required';
      }
      if (data.executorType === 'ai_call') {
        if (!data.config.instructions) e.instructions = 'Instructions are required';
      }
    }

    if (s === 3) {
      if (!data.aiDescription.trim()) e.aiDescription = 'AI description is required';
      else if (data.aiDescription.trim().length < 10)
        e.aiDescription = 'AI description must be at least 10 characters';
      if (data.inputSchema.trim()) {
        try { JSON.parse(data.inputSchema); } catch {
          e.inputSchema = 'Input schema must be valid JSON';
        }
      }
      if (data.outputSchema.trim()) {
        try { JSON.parse(data.outputSchema); } catch {
          e.outputSchema = 'Output schema must be valid JSON';
        }
      }
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function getSchemaKey(): string {
    if (data.executorType === 'data_source') {
      const operation = (data.config.operation as string) || 'search';
      return `data_source:${operation}`;
    }
    return data.executorType;
  }

  function handleNext() {
    if (!validateStep(step)) return;
    // When leaving Step 1, seed default AI schemas and description if not already set
    if (step === 1 && data.executorType) {
      const schemaKey = getSchemaKey();
      const defaultInput = EXECUTOR_INPUT_SCHEMAS[schemaKey];
      const defaultAiDesc = DEFAULT_AI_DESCRIPTIONS[data.executorType];
      setData((prev) => ({
        ...prev,
        inputSchema: prev.inputSchema || (defaultInput ? JSON.stringify(defaultInput, null, 2) : ''),
        aiDescription: prev.aiDescription || defaultAiDesc || '',
      }));
    }
    setStep((s) => s + 1);
  }

  function handleBack() {
    setErrors({});
    setStep((s) => s - 1);
  }

  function handleDataSourceSelected(meta: DataSourceMeta) {
    setData((prev) => {
      const updates: Partial<WizardData> = {};
      if (!prev.name || prev.name === '') {
        updates.name = `Search ${meta.name}`;
        updates.slug = generateSlug(`Search ${meta.name}`);
      }
      if (!prev.description || prev.description === '') {
        updates.description = meta.description ?? `Search tool for ${meta.name} data source.`;
      }
      if (!prev.aiDescription || prev.aiDescription === '') {
        updates.aiDescription = `Search the "${meta.name}" data source. Returns ranked results with relevance scores. Use filters to narrow results and sort to order them.`;
      }
      return { ...prev, ...updates };
    });
  }

  const doCreate = useCallback(async () => {
    if (!validateStep(3) || isRedirecting.current) return;
    setSubmitError(null);

    let inputSchema: Record<string, unknown> | undefined;
    let outputSchema: Record<string, unknown> | undefined;
    try {
      if (data.inputSchema.trim()) inputSchema = JSON.parse(data.inputSchema);
      if (data.outputSchema.trim()) outputSchema = JSON.parse(data.outputSchema);
    } catch {
      setErrors({ inputSchema: 'Input/output schema must be valid JSON' });
      return;
    }

    try {
      const payload: CreateToolPayload = {
        name: data.name,
        slug: data.slug,
        description: data.description || undefined,
        executorType: data.executorType as ExecutorType,
        aiDescription: data.aiDescription,
        inputSchema,
        outputSchema,
      };

      // For data_source tools, extract dataSourceId and operation from config
      if (data.executorType === 'data_source') {
        payload.dataSourceId = data.config.dataSourceId as string;
        payload.operation = ((data.config.operation as string) || 'search') as DataSourceOperation;
        const { dataSourceId: _, operation: __, ...rest } = data.config;
        payload.executorConfig = Object.keys(rest).length > 0 ? rest : undefined;
      } else {
        payload.executorConfig = Object.keys(data.config).length > 0 ? data.config : undefined;
      }

      const tool = await createTool(payload);
      isRedirecting.current = true;
      router.push(`/tools/${tool.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create tool');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, createTool, router]);

  const [handleCreate, isSaving] = useMinDelayAction(doCreate);

  const step1Data: Step1Data = {
    name: data.name,
    slug: data.slug,
    description: data.description,
    executorType: data.executorType,
  };
  const step3Data = { aiDescription: data.aiDescription, inputSchema: data.inputSchema, outputSchema: data.outputSchema };

  return (
    <div className="space-y-8">
      {/* Step Indicator */}
      <div className="flex justify-center">
        <StepIndicator current={step} steps={STEPS} />
      </div>

      {/* Step Card */}
      <div className="rounded-2xl border border-border/60 bg-card shadow-sm">
        <div className="p-6 border-b border-border/60">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-base font-semibold">{STEPS[step - 1].label}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {step === 1 && 'Give your tool a name and choose what it connects to.'}
                {step === 2 && data.executorType && (
                  <span className="flex items-center gap-2">
                    Set up the <ToolTypeChip executorType={data.executorType} size="sm" /> connection.
                  </span>
                )}
                {step === 3 && 'Describe how the AI should use this tool.'}
              </p>
            </div>
          </div>
        </div>

        <div className="p-6">
          {step === 1 && (
            <Step1_BasicInfo
              data={step1Data}
              onChange={(d) => setData((prev) => ({ ...prev, ...d }))}
              errors={errors}
            />
          )}
          {step === 2 && data.executorType && (
            <Step2_Config
              executorType={data.executorType as ExecutorType}
              value={data.config}
              onChange={(config) => setData((prev) => ({ ...prev, config }))}
              errors={errors}
              onSchemaImport={(schema) =>
                setData((prev) => ({ ...prev, outputSchema: JSON.stringify(schema, null, 2) }))
              }
              onDataSourceSelected={handleDataSourceSelected}
            />
          )}
          {step === 3 && (
            <Step3_AiSettings
              data={step3Data}
              onChange={(d) => setData((prev) => ({ ...prev, ...d }))}
              errors={errors}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex items-center justify-between">
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={handleBack}
            disabled={step === 1 || isSaving}
          >
            <ChevronLeft className="size-4 mr-1" />
            Back
          </Button>

          <div className="flex items-center gap-3">
            {submitError && (
              <p className="text-sm text-destructive">{submitError}</p>
            )}
            {step < 3 ? (
              <Button className="rounded-xl" onClick={handleNext}>
                Next
                <ChevronRight className="size-4 ml-1" />
              </Button>
            ) : (
              <Button className="rounded-xl" onClick={handleCreate} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="size-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Tool'
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
