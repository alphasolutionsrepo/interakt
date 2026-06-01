'use client';

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Loader2, Save, Wrench } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageHeader } from '@/shared/ui/custom/PageHeader';
import { ToolTypeChip, resolveToolChipConfig } from '../../../_components/ToolTypeChip';
import { Step2_Config } from '../../../_components/CreateWizard/Step2_Config';
import { DisplayConfigEditor } from '../../../_components/DisplayConfigEditor';
import { useTool } from '../../../_lib/hooks/useTools';
import { useMinDelayAction } from '@/shared/hooks';
import type { ExecutorType, ToolDisplayConfig } from '../../../_lib/api-client';
import { dataSourcesApi } from '@/app/data-sources/_lib/api-client';

export default function EditToolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { tool, isLoading, updateTool } = useTool(id);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [aiDescription, setAiDescription] = useState('');
  const [inputSchema, setInputSchema] = useState('');
  const [outputSchema, setOutputSchema] = useState('');
  const [displayConfig, setDisplayConfig] = useState<ToolDisplayConfig | null>(null);
  const [dataSourceFields, setDataSourceFields] = useState<Array<{ name: string; displayName: string; type: string; role?: string | null }>>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Track initial values for dirty check
  const initialValues = useRef<{
    name: string; description: string; config: string;
    aiDescription: string; inputSchema: string; outputSchema: string;
    displayConfig: string;
  }>({ name: '', description: '', config: '{}', aiDescription: '', inputSchema: '', outputSchema: '', displayConfig: 'null' });

  useEffect(() => {
    if (tool) {
      const effectiveConfig = tool.executorConfig ?? {};
      const vals = {
        name: tool.name,
        description: tool.description ?? '',
        config: JSON.stringify(effectiveConfig),
        aiDescription: tool.aiDescription,
        inputSchema: tool.inputSchema ? JSON.stringify(tool.inputSchema, null, 2) : '',
        outputSchema: tool.outputSchema ? JSON.stringify(tool.outputSchema, null, 2) : '',
        displayConfig: JSON.stringify(tool.displayConfig ?? null),
      };
      setName(vals.name);
      setDescription(vals.description);
      setConfig(effectiveConfig);
      setAiDescription(vals.aiDescription);
      setInputSchema(vals.inputSchema);
      setOutputSchema(vals.outputSchema);
      setDisplayConfig(tool.displayConfig ?? null);
      initialValues.current = vals;
    }
  }, [tool]);

  // Fetch data source schema fields (fallback for source field picker)
  useEffect(() => {
    if (!tool?.dataSourceId) return;
    dataSourcesApi.getById(tool.dataSourceId).then((ds) => {
      const schema = ds.schema as { fields?: Array<{ name: string; displayName: string; type: string; role?: string | null }> } | null;
      if (schema?.fields) setDataSourceFields(schema.fields);
    }).catch(() => { /* data source may not exist */ });
  }, [tool?.dataSourceId]);

  const isDirty = useMemo(() => {
    if (!tool) return false;
    return (
      name !== initialValues.current.name ||
      description !== initialValues.current.description ||
      JSON.stringify(config) !== initialValues.current.config ||
      aiDescription !== initialValues.current.aiDescription ||
      inputSchema !== initialValues.current.inputSchema ||
      outputSchema !== initialValues.current.outputSchema ||
      JSON.stringify(displayConfig) !== initialValues.current.displayConfig
    );
  }, [name, description, config, aiDescription, inputSchema, outputSchema, displayConfig, tool]);

  function validate() {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Name is required';
    if (!aiDescription.trim()) e.aiDescription = 'AI description is required';
    else if (aiDescription.trim().length < 10) e.aiDescription = 'AI description must be at least 10 characters';
    if (inputSchema.trim()) {
      try { JSON.parse(inputSchema); } catch { e.inputSchema = 'Input schema must be valid JSON'; }
    }
    if (outputSchema.trim()) {
      try { JSON.parse(outputSchema); } catch { e.outputSchema = 'Output schema must be valid JSON'; }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const doSave = useCallback(async () => {
    if (!validate()) return;
    setSubmitError(null);

    let inputSchemaParsed: Record<string, unknown> | undefined;
    let outputSchemaParsed: Record<string, unknown> | undefined;
    try {
      if (inputSchema.trim()) inputSchemaParsed = JSON.parse(inputSchema);
      if (outputSchema.trim()) outputSchemaParsed = JSON.parse(outputSchema);
    } catch { return; }

    try {
      await updateTool({
        name,
        description: description.trim() || undefined,
        executorConfig: config,
        aiDescription,
        inputSchema: inputSchemaParsed,
        outputSchema: outputSchemaParsed,
        displayConfig,
      });
      router.push(`/tools/${id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, description, config, aiDescription, inputSchema, outputSchema, displayConfig, id, updateTool, router]);

  const [handleSave, isSaving] = useMinDelayAction(doSave);

  if (isLoading || !tool) {
    return (
      <div className="flex-1 p-6 lg:p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-16 bg-muted rounded-2xl" />
          <div className="h-64 bg-muted rounded-2xl" />
        </div>
      </div>
    );
  }

  const cfg = resolveToolChipConfig(tool);
  const Icon = cfg?.icon ?? Wrench;

  return (
    <div className="flex-1 space-y-8 p-6 lg:p-8">
      <PageHeader
        variant="detail"
        title={`Edit ${tool.name}`}
        description="Update tool configuration and AI settings."
        breadcrumb={
          <>
            <Link href="/tools" className="hover:text-foreground transition-colors font-medium">Tools</Link>
            <ChevronRight className="size-3.5" />
            <Link href={`/tools/${id}`} className="hover:text-foreground transition-colors font-medium truncate max-w-[160px]">
              {tool.name}
            </Link>
            <ChevronRight className="size-3.5" />
            <span className="text-foreground font-medium">Edit</span>
          </>
        }
        customIcon={
          <div className={`flex size-12 items-center justify-center rounded-xl ${cfg?.iconBg ?? 'bg-muted'}`}>
            <Icon className={`size-6 ${cfg?.iconClass ?? 'text-muted-foreground'}`} />
          </div>
        }
        badge={<ToolTypeChip executorType={tool.executorType} operation={tool.operation} />}
        actions={
          <Button className="rounded-xl" onClick={handleSave} disabled={isSaving || !isDirty}>
            {isSaving ? (
              <><Loader2 className="size-4 mr-2 animate-spin" />Saving...</>
            ) : (
              <><Save className="size-4 mr-2" />Save Changes</>
            )}
          </Button>
        }
      />

      <div className="space-y-6 max-w-3xl">
        {/* Basic Info */}
        <Card className="border-border/60 shadow-sm rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`rounded-xl ${errors.name ? 'border-destructive' : ''}`}
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="rounded-xl resize-none"
              />
            </div>
          </CardContent>
        </Card>

        {/* Type Config */}
        <Card className="border-border/60 shadow-sm rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Configuration</CardTitle>
            <CardDescription>
              Executor-specific settings for this <ToolTypeChip executorType={tool.executorType} operation={tool.operation} size="sm" /> tool.
              The executor type cannot be changed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Step2_Config
              executorType={(tool.executorType ?? 'data_source') as ExecutorType}
              value={config}
              onChange={setConfig}
              errors={errors}
              onSchemaImport={(schema) => setOutputSchema(JSON.stringify(schema, null, 2))}
            />
          </CardContent>
        </Card>

        {/* AI Settings */}
        <Card className="border-border/60 shadow-sm rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">AI Settings</CardTitle>
            <CardDescription>How the AI knows when and how to use this tool.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>AI Description <span className="text-destructive">*</span></Label>
              <Textarea
                value={aiDescription}
                onChange={(e) => setAiDescription(e.target.value)}
                rows={4}
                className={`rounded-xl resize-none ${errors.aiDescription ? 'border-destructive' : ''}`}
              />
              {errors.aiDescription && <p className="text-xs text-destructive">{errors.aiDescription}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Input Schema (JSON)</Label>
              <Textarea
                value={inputSchema}
                onChange={(e) => setInputSchema(e.target.value)}
                rows={6}
                className={`rounded-xl font-mono text-sm resize-none ${errors.inputSchema ? 'border-destructive' : ''}`}
                placeholder='{"type": "object", "properties": {...}}'
              />
              {errors.inputSchema && <p className="text-xs text-destructive">{errors.inputSchema}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Output Schema (JSON)</Label>
              <Textarea
                value={outputSchema}
                onChange={(e) => setOutputSchema(e.target.value)}
                rows={6}
                className={`rounded-xl font-mono text-sm resize-none ${errors.outputSchema ? 'border-destructive' : ''}`}
                placeholder='{"type": "object", "properties": {...}}'
              />
              {errors.outputSchema && <p className="text-xs text-destructive">{errors.outputSchema}</p>}
            </div>
          </CardContent>
        </Card>

        {/* Display Config */}
        <Card className="border-border/60 shadow-sm rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Display Settings</CardTitle>
            <CardDescription>Map result fields to semantic roles for visual preset rendering in chat.</CardDescription>
          </CardHeader>
          <CardContent>
            <DisplayConfigEditor
              value={displayConfig}
              onChange={setDisplayConfig}
              outputSchema={tool.outputSchema}
              dataSourceFields={dataSourceFields}
            />
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex items-center justify-between">
          <Button variant="outline" className="rounded-xl" onClick={() => router.push(`/tools/${id}`)}>
            Cancel
          </Button>
          <div className="flex items-center gap-3">
            {submitError && <p className="text-sm text-destructive">{submitError}</p>}
            <Button className="rounded-xl" onClick={handleSave} disabled={isSaving || !isDirty}>
              {isSaving ? (
                <><Loader2 className="size-4 mr-2 animate-spin" />Saving...</>
              ) : (
                <><Save className="size-4 mr-2" />Save Changes</>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
