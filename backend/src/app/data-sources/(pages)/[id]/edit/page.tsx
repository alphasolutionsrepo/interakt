'use client';

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Loader2, Save, Database } from 'lucide-react';
import { useMinDelayAction } from '@/shared/hooks';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageHeader } from '@/shared/ui/custom/PageHeader';
import { DataSourceTypeChip, DS_TYPE_CONFIG } from '../../../_components/DataSourceTypeChip';
import { Step2_Config } from '../../../_components/CreateWizard/Step2_Config';
import { useDataSource } from '../../../_lib/hooks/useDataSources';
import type { DataSourceType } from '../../../_lib/api-client';

export default function EditDataSourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { dataSource, isLoading, updateDataSource, isUpdating } = useDataSource(id);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Track initial values for dirty check
  const initialValues = useRef<{ name: string; description: string; config: string }>({ name: '', description: '', config: '{}' });

  useEffect(() => {
    if (dataSource) {
      setName(dataSource.name);
      setDescription(dataSource.description ?? '');
      setConfig(dataSource.config);
      initialValues.current = {
        name: dataSource.name,
        description: dataSource.description ?? '',
        config: JSON.stringify(dataSource.config),
      };
    }
  }, [dataSource]);

  const isDirty = useMemo(() => {
    if (!dataSource) return false;
    return (
      name !== initialValues.current.name ||
      description !== initialValues.current.description ||
      JSON.stringify(config) !== initialValues.current.config
    );
  }, [name, description, config, dataSource]);

  function validate() {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Name is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const doSave = useCallback(async () => {
    if (!validate()) return;
    setSubmitError(null);

    try {
      await updateDataSource({
        name,
        description: description.trim() || undefined,
        config,
      });
      router.push(`/data-sources/${id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, description, config, id, updateDataSource, router]);

  const [handleSave, isSaving] = useMinDelayAction(doSave);

  if (isLoading || !dataSource) {
    return (
      <div className="flex-1 p-6 lg:p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-16 bg-muted rounded-2xl" />
          <div className="h-64 bg-muted rounded-2xl" />
        </div>
      </div>
    );
  }

  const cfg = DS_TYPE_CONFIG[dataSource.type as DataSourceType];
  const Icon = cfg?.icon ?? Database;

  return (
    <div className="flex-1 space-y-8 p-6 lg:p-8">
      <PageHeader
        variant="detail"
        title={`Edit ${dataSource.name}`}
        description="Update data source configuration."
        breadcrumb={
          <>
            <Link href="/data-sources" className="hover:text-foreground transition-colors font-medium">Data Sources</Link>
            <ChevronRight className="size-3.5" />
            <Link href={`/data-sources/${id}`} className="hover:text-foreground transition-colors font-medium truncate max-w-[160px]">
              {dataSource.name}
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
        badge={<DataSourceTypeChip type={dataSource.type} />}
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
              Type-specific settings for this <DataSourceTypeChip type={dataSource.type} size="sm" /> data source.
              The type cannot be changed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Step2_Config
              dataSourceType={dataSource.type as DataSourceType}
              value={config}
              onChange={setConfig}
              errors={errors}
            />
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex items-center justify-between">
          <Button variant="outline" className="rounded-xl" onClick={() => router.push(`/data-sources/${id}`)}>
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
