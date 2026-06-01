'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2, Loader2, XCircle, Database, Globe, Search, Bot } from 'lucide-react';
import type { ExecutorType } from '../../_lib/api-client';
import { useToolSlugAvailability } from '../../_lib/hooks/useTools';

// ============================================================================
// EXECUTOR TYPE OPTIONS (matches registry)
// ============================================================================

const EXECUTOR_TYPE_OPTIONS: Array<{
  executorType: ExecutorType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconClass: string;
}> = [
  {
    executorType: 'data_source',
    label: 'Data Source',
    description: 'Search, browse, or look up data from a connected source.',
    icon: Database,
    iconBg: 'bg-blue-500/10',
    iconClass: 'text-blue-500',
  },
  {
    executorType: 'http',
    label: 'HTTP API',
    description: 'Call an external API or web service.',
    icon: Globe,
    iconBg: 'bg-teal-500/10',
    iconClass: 'text-teal-500',
  },
  {
    executorType: 'web_search',
    label: 'Web Search',
    description: 'Search the live web to ground AI responses in up-to-date information.',
    icon: Search,
    iconBg: 'bg-sky-500/10',
    iconClass: 'text-sky-500',
  },
  {
    executorType: 'ai_call',
    label: 'AI Responder',
    description: 'Use AI with custom instructions for specialized tasks.',
    icon: Bot,
    iconBg: 'bg-violet-500/10',
    iconClass: 'text-violet-500',
  },
];

// ============================================================================
// TYPES
// ============================================================================

export interface Step1Data {
  name: string;
  slug: string;
  description: string;
  executorType: ExecutorType | '';
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

// ============================================================================
// COMPONENT
// ============================================================================

export function Step1_BasicInfo({ data, onChange, errors }: Step1Props) {
  const { isAvailable, isChecking, isDebouncing } = useToolSlugAvailability(
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
        <Label htmlFor="tool-name">
          Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="tool-name"
          value={data.name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="e.g. Product Search"
          className={`rounded-xl ${errors.name ? 'border-destructive' : ''}`}
          autoFocus
        />
        {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
      </div>

      {/* Slug */}
      <div className="space-y-1.5">
        <Label htmlFor="tool-slug">
          Unique ID <span className="text-destructive">*</span>
        </Label>
        <div className="relative">
          <Input
            id="tool-slug"
            value={data.slug}
            onChange={(e) => handleSlugChange(e.target.value)}
            placeholder="product-search"
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
            Used in API calls. Auto-generated from name. Letters, numbers, and hyphens only.
          </p>
        )}
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label htmlFor="tool-description">Description</Label>
        <Textarea
          id="tool-description"
          value={data.description}
          onChange={(e) => onChange({ ...data, description: e.target.value })}
          placeholder="Brief description of what this tool does"
          rows={2}
          className="rounded-xl resize-none"
        />
      </div>

      {/* Tool Type */}
      <div className="space-y-2">
        <Label>
          What type of tool is this? <span className="text-destructive">*</span>
        </Label>
        {errors.executorType && <p className="text-xs text-destructive">{errors.executorType}</p>}
        <div className="rounded-xl border border-border/60 overflow-hidden divide-y divide-border/60">
          {EXECUTOR_TYPE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isSelected = data.executorType === opt.executorType;
            return (
              <button
                key={opt.executorType}
                type="button"
                onClick={() => onChange({ ...data, executorType: opt.executorType })}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                  isSelected ? 'bg-primary/5' : 'bg-card hover:bg-muted/30'
                }`}
              >
                {/* Radio indicator */}
                <div className={`flex size-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                  isSelected ? 'border-primary' : 'border-border'
                }`}>
                  {isSelected && <div className="size-2 rounded-full bg-primary" />}
                </div>

                {/* Icon */}
                <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${opt.iconBg}`}>
                  <Icon className={`size-4 ${opt.iconClass}`} />
                </div>

                {/* Text */}
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold leading-tight ${isSelected ? 'text-primary' : ''}`}>
                    {opt.label}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                    {opt.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
