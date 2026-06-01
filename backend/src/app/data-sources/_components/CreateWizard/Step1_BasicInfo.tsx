'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { DS_TYPE_CONFIG } from '../DataSourceTypeChip';
import type { DataSourceType } from '../../_lib/api-client';
import { useDataSourceSlugAvailability } from '../../_lib/hooks/useDataSources';

interface Step1Data {
  name: string;
  slug: string;
  description: string;
  type: DataSourceType | '';
}

interface Step1Props {
  data: Step1Data;
  onChange: (data: Step1Data) => void;
  errors: Record<string, string>;
}

function generateSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 100);
}

export function Step1_BasicInfo({ data, onChange, errors }: Step1Props) {
  const { isAvailable, isChecking, isDebouncing } = useDataSourceSlugAvailability(
    data.slug,
    undefined,
    data.slug.length >= 3
  );

  function handleNameChange(name: string) {
    const slug = generateSlug(name);
    onChange({ ...data, name, slug });
  }

  function handleSlugChange(slug: string) {
    onChange({ ...data, slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, '') });
  }

  const slugStatus =
    data.slug.length < 3 ? null
    : isChecking || isDebouncing ? 'checking'
    : isAvailable ? 'available'
    : 'taken';

  return (
    <div className="space-y-6">
      {/* Name */}
      <div className="space-y-1.5">
        <Label htmlFor="ds-name">
          Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="ds-name"
          value={data.name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="e.g. Products Index"
          className={`rounded-xl ${errors.name ? 'border-destructive' : ''}`}
          autoFocus
        />
        {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
      </div>

      {/* Slug */}
      <div className="space-y-1.5">
        <Label htmlFor="ds-slug">
          Slug <span className="text-destructive">*</span>
        </Label>
        <div className="relative">
          <Input
            id="ds-slug"
            value={data.slug}
            onChange={(e) => handleSlugChange(e.target.value)}
            placeholder="products-index"
            className={`rounded-xl font-mono pr-8 ${
              errors.slug ? 'border-destructive'
              : slugStatus === 'taken' ? 'border-destructive'
              : slugStatus === 'available' ? 'border-emerald-500'
              : ''
            }`}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {slugStatus === 'checking' && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
            {slugStatus === 'available' && <CheckCircle2 className="size-4 text-emerald-500" />}
            {slugStatus === 'taken' && <XCircle className="size-4 text-destructive" />}
          </div>
        </div>
        {errors.slug ? (
          <p className="text-xs text-destructive">{errors.slug}</p>
        ) : slugStatus === 'taken' ? (
          <p className="text-xs text-destructive">This slug is already taken.</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Lowercase letters, numbers, and hyphens only. Auto-generated from name.
          </p>
        )}
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label htmlFor="ds-description">Description</Label>
        <Textarea
          id="ds-description"
          value={data.description}
          onChange={(e) => onChange({ ...data, description: e.target.value })}
          placeholder="Brief description of this data source"
          rows={2}
          className="rounded-xl resize-none"
        />
      </div>

      {/* Data Source Type */}
      <div className="space-y-2">
        <Label>
          Data Source Type <span className="text-destructive">*</span>
        </Label>
        {errors.type && <p className="text-xs text-destructive">{errors.type}</p>}
        <div className="rounded-xl border border-border/60 overflow-hidden divide-y divide-border/60">
          {(Object.entries(DS_TYPE_CONFIG) as [DataSourceType, typeof DS_TYPE_CONFIG[DataSourceType]][]).map(
            ([type, cfg]) => {
              const Icon = cfg.icon;
              const isSelected = data.type === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => onChange({ ...data, type })}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                    isSelected ? 'bg-primary/5' : 'bg-card hover:bg-muted/30'
                  }`}
                >
                  <div className={`flex size-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    isSelected ? 'border-primary' : 'border-border'
                  }`}>
                    {isSelected && <div className="size-2 rounded-full bg-primary" />}
                  </div>
                  <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${cfg.iconBg}`}>
                    <Icon className={`size-4 ${cfg.iconClass}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-semibold leading-tight ${isSelected ? 'text-primary' : ''}`}>
                      {cfg.label}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                      {cfg.description}
                    </p>
                  </div>
                </button>
              );
            }
          )}
        </div>
      </div>
    </div>
  );
}
