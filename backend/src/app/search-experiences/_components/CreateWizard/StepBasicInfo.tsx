// app/search-experiences/_components/CreateWizard/StepBasicInfo.tsx

/**
 * Step 1: Basic Information
 *
 * - Name and slug
 * - Description
 * - Select search indexes and external indexes
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Check,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import {
  generateSlugFromName,
  type WizardFormData,
} from '@/features/search-experience/search-experience.client';
import { useSlugAvailability } from '../../_lib/hooks';
import { ExperienceSources, useSourceOptions } from '../ExperienceSources';

// ============================================================================
// TYPES
// ============================================================================

interface StepBasicInfoProps {
  formData: WizardFormData;
  errors: Record<string, string>;
  updateField: <K extends keyof WizardFormData>(field: K, value: WizardFormData[K]) => void;
  setExternalError?: (field: string, error: string | undefined) => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function StepBasicInfo({
  formData,
  errors,
  updateField,
  setExternalError,
}: StepBasicInfoProps) {
  const [slugTouched, setSlugTouched] = useState(false);

  // Search indexes and external indexes that can be attached
  const { indexOptions, externalOptions, isLoading: isLoadingSources } = useSourceOptions();

  // Check slug availability
  const { isAvailable, isChecking, isDebouncing } = useSlugAvailability(
    formData.slug,
    undefined,
    { enabled: formData.slug.length >= 3 }
  );

  // Update external error based on slug availability
  useEffect(() => {
    if (setExternalError) {
      if (formData.slug.length >= 3 && isAvailable === false) {
        setExternalError('slug', 'This slug is already in use');
      } else {
        setExternalError('slug', undefined);
      }
    }
  }, [isAvailable, formData.slug, setExternalError]);

  // Auto-generate slug from name
  const handleNameChange = useCallback(
    (name: string) => {
      updateField('name', name);

      // Only auto-generate slug if user hasn't manually edited it
      if (!slugTouched) {
        const generatedSlug = generateSlugFromName(name);
        if (generatedSlug.length >= 3) {
          updateField('slug', generatedSlug);
        }
      }
    },
    [slugTouched, updateField]
  );

  const handleSlugChange = useCallback(
    (slug: string) => {
      setSlugTouched(true);
      updateField('slug', slug.toLowerCase().replace(/[^a-z0-9-]/g, ''));
    },
    [updateField]
  );

  const handleAddIndex = useCallback(
    (searchIndexId: string) => {
      if (formData.indexes.some((i) => i.searchIndexId === searchIndexId)) return;
      updateField('indexes', [
        ...formData.indexes,
        {
          searchIndexId,
          role: (formData.indexes.length === 0 ? 'primary' : 'secondary') as 'primary' | 'secondary',
          weight: 1.0,
          sortOrder: formData.indexes.length,
        },
      ]);
    },
    [formData.indexes, updateField]
  );

  const handleAddExternal = useCallback(
    (dataSourceId: string) => {
      if (formData.externalSources.some((s) => s.dataSourceId === dataSourceId)) return;
      updateField('externalSources', [
        ...formData.externalSources,
        { dataSourceId, weight: 1.0, sortOrder: formData.externalSources.length },
      ]);
    },
    [formData.externalSources, updateField]
  );

  return (
    <div className="space-y-8">
      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="name">
          Name <span className="text-red-500">*</span>
        </Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="My Search Experience"
          className={`rounded-xl ${errors.name ? 'border-destructive' : ''}`}
        />
        {errors.name && (
          <p className="text-sm text-destructive font-medium">{errors.name}</p>
        )}
      </div>

      {/* Slug */}
      <div className="space-y-2">
        <Label htmlFor="slug">
          Slug <span className="text-red-500">*</span>
        </Label>
        <div className="relative">
          <Input
            id="slug"
            value={formData.slug}
            onChange={(e) => handleSlugChange(e.target.value)}
            placeholder="my-search-experience"
            className={`font-mono rounded-xl ${errors.slug || (isAvailable === false && formData.slug.length >= 3) ? 'border-destructive' : ''}`}
          />
          {formData.slug.length >= 3 && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {isChecking || isDebouncing ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : isAvailable === true ? (
                <Check className="h-4 w-4 text-emerald-600" />
              ) : isAvailable === false ? (
                <AlertCircle className="h-4 w-4 text-destructive" />
              ) : null}
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Used in API endpoints: /api/v1/search-experiences/{formData.slug || 'your-slug'}
        </p>
        {errors.slug && (
          <p className="text-sm text-destructive font-medium">{errors.slug}</p>
        )}
        {isAvailable === false && formData.slug.length >= 3 && !errors.slug && (
          <p className="text-sm text-destructive font-medium">This slug is already in use</p>
        )}
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => updateField('description', e.target.value)}
          placeholder="Optional description for this search experience..."
          rows={3}
          className="rounded-xl"
        />
      </div>

      {/* Sources */}
      <div className="space-y-4">
        <Label>
          Sources <span className="text-red-500">*</span>
        </Label>
        <ExperienceSources
          selectedIndexes={formData.indexes}
          selectedExternal={formData.externalSources.map((s) => s.dataSourceId)}
          indexOptions={indexOptions}
          externalOptions={externalOptions}
          isLoading={isLoadingSources}
          error={errors.indexes}
          onAddIndex={handleAddIndex}
          onRemoveIndex={(id) => updateField('indexes', formData.indexes.filter((i) => i.searchIndexId !== id))}
          onRoleChange={(id, role) =>
            updateField('indexes', formData.indexes.map((i) => (i.searchIndexId === id ? { ...i, role } : i)))
          }
          onAddExternal={handleAddExternal}
          onRemoveExternal={(id) =>
            updateField('externalSources', formData.externalSources.filter((s) => s.dataSourceId !== id))
          }
        />
      </div>
    </div>
  );
}
