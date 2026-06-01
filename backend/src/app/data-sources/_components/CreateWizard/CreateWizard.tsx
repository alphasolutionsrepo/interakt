'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Loader2, Check } from 'lucide-react';
import { useMinDelayAction } from '@/shared/hooks';
import { Step1_BasicInfo } from './Step1_BasicInfo';
import { Step2_Config } from './Step2_Config';
import { DataSourceTypeChip } from '../DataSourceTypeChip';
import { useCreateDataSource } from '../../_lib/hooks/useDataSources';
import type { DataSourceType } from '../../_lib/api-client';

// ============================================================================
// TYPES
// ============================================================================

interface WizardData {
  name: string;
  slug: string;
  description: string;
  type: DataSourceType | '';
  config: Record<string, unknown>;
}

const STEPS = [
  { label: 'Basic Info', description: 'Name and type' },
  { label: 'Configuration', description: 'Type-specific config' },
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
  const { createDataSource, isCreating } = useCreateDataSource();
  const isRedirecting = useRef(false);

  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>({
    name: '',
    slug: '',
    description: '',
    type: '',
    config: {},
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
      if (!data.type) e.type = 'Select a data source type to continue';
    }

    if (s === 2) {
      if (data.type === 'search_index') {
        if (!data.config.searchIndexId) e.searchIndexId = 'A search index is required';
      }
      if (data.type === 'search_index_external') {
        const conn = (data.config.connection as Record<string, unknown>) || {};
        if (!conn.provider) e.provider = 'Provider is required';
        if (!conn.url) e.url = 'Connection URL is required';
        if (!conn.indexName) e.indexName = 'Index name is required';
      }
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleNext() {
    if (!validateStep(step)) return;
    setStep((s) => s + 1);
  }

  function handleBack() {
    setErrors({});
    setStep((s) => s - 1);
  }

  const doCreate = useCallback(async () => {
    if (!validateStep(2) || isRedirecting.current) return;
    setSubmitError(null);

    // Build the config payload based on type
    let config = data.config;
    if (data.type === 'search_index_external') {
      const conn = (data.config.connection as Record<string, unknown>) || {};
      config = {
        provider: conn.provider,
        connection: {
          url: conn.url,
          authType: conn.authType || 'api_key',
          credentials: conn.credentials || { secretRef: '' },
          indexName: conn.indexName,
        },
        searchDefaults: {
          searchType: 'auto',
          maxResults: 10,
          includeHighlights: true,
        },
        healthCheck: {
          enabled: true,
          intervalMs: 60000,
        },
      };
    }

    try {
      const ds = await createDataSource({
        name: data.name,
        slug: data.slug,
        description: data.description || undefined,
        type: data.type as DataSourceType,
        config,
      });
      isRedirecting.current = true;
      router.push(`/data-sources/${ds.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create data source');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, createDataSource, router]);

  const [handleCreate, isSaving] = useMinDelayAction(doCreate);

  const step1Data = { name: data.name, slug: data.slug, description: data.description, type: data.type };

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
                {step === 1 && 'Enter the basic information and choose a data source type.'}
                {step === 2 && data.type && (
                  <span className="flex items-center gap-2">
                    Configure the <DataSourceTypeChip type={data.type} size="sm" /> data source.
                  </span>
                )}
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
          {step === 2 && data.type && (
            <Step2_Config
              dataSourceType={data.type as DataSourceType}
              value={data.config}
              onChange={(config) => setData((prev) => ({ ...prev, config }))}
              errors={errors}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex items-center justify-between">
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={step === 1 ? () => router.push('/data-sources') : handleBack}
            disabled={isSaving}
          >
            <ChevronLeft className="size-4 mr-1" />
            {step === 1 ? 'Cancel' : 'Back'}
          </Button>

          <div className="flex items-center gap-3">
            {submitError && (
              <p className="text-sm text-destructive">{submitError}</p>
            )}
            {step < 2 ? (
              <Button className="rounded-xl" onClick={handleNext}>
                Next
              </Button>
            ) : (
              <Button className="rounded-xl" onClick={handleCreate} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="size-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Data Source'
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
