// app/search-experiences/_components/CreateWizard/StepBasicInfo.tsx

/**
 * Step 1: Basic Information
 *
 * - Name and slug
 * - Description
 * - Select search indexes
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Database,
  Plus,
  X,
  Check,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import {
  generateSlugFromName,
  type WizardFormData,
} from '@/features/search-experience/search-experience.client';
import { useSlugAvailability } from '../../_lib/hooks';

// ============================================================================
// TYPES
// ============================================================================

interface StepBasicInfoProps {
  formData: WizardFormData;
  errors: Record<string, string>;
  updateField: <K extends keyof WizardFormData>(field: K, value: WizardFormData[K]) => void;
  setExternalError?: (field: string, error: string | undefined) => void;
}

interface SearchIndexOption {
  id: string;
  name: string;
  displayName: string;
  searchType: string;
  searchProvider: string;
  isActive: boolean;
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

  // Fetch available search indexes
  const { data: indexesData, isLoading: isLoadingIndexes } = useQuery({
    queryKey: ['search-indexes', 'all-active'],
    queryFn: async () => {
      const response = await fetch('/api/search-indexes?isActive=true&pageSize=100');
      const data = await response.json();
      return data.data?.items || [];
    },
  });

  const availableIndexes: SearchIndexOption[] = indexesData || [];

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

  // Add index to selection
  const handleAddIndex = useCallback(
    (indexId: string) => {
      const index = availableIndexes.find((i) => i.id === indexId);
      if (!index) return;

      // Check if already added
      if (formData.indexes.some((i) => i.searchIndexId === indexId)) return;

      const newIndex = {
        searchIndexId: indexId,
        role: (formData.indexes.length === 0 ? 'primary' : 'secondary') as 'primary' | 'secondary',
        weight: 1.0,
        sortOrder: formData.indexes.length,
      };

      updateField('indexes', [...formData.indexes, newIndex]);
    },
    [availableIndexes, formData.indexes, updateField]
  );

  // Remove index from selection
  const handleRemoveIndex = useCallback(
    (indexId: string) => {
      updateField(
        'indexes',
        formData.indexes.filter((i) => i.searchIndexId !== indexId)
      );
    },
    [formData.indexes, updateField]
  );

  // Update index role
  const handleRoleChange = useCallback(
    (indexId: string, role: 'primary' | 'secondary') => {
      updateField(
        'indexes',
        formData.indexes.map((i) =>
          i.searchIndexId === indexId ? { ...i, role } : i
        )
      );
    },
    [formData.indexes, updateField]
  );

  // Get index display info
  const getIndexInfo = (indexId: string) => {
    return availableIndexes.find((i) => i.id === indexId);
  };

  // Indexes not yet selected
  const unselectedIndexes = availableIndexes.filter(
    (i) => !formData.indexes.some((fi) => fi.searchIndexId === i.id)
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

      {/* Search Indexes */}
      <div className="space-y-4">
        <div>
          <Label>
            Search Indexes <span className="text-red-500">*</span>
          </Label>
          <p className="text-xs text-muted-foreground mt-1">
            Select the search indexes to include in this experience
          </p>
        </div>

        {/* Selected indexes */}
        {formData.indexes.length > 0 && (
          <div className="space-y-2">
            {formData.indexes.map((idx) => {
              const indexInfo = getIndexInfo(idx.searchIndexId);
              return (
                <Card key={idx.searchIndexId} className="border-border/60 rounded-xl">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-muted rounded-lg">
                          <Database className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">
                            {indexInfo?.displayName || 'Unknown Index'}
                          </p>
                          <p className="text-xs text-muted-foreground">{indexInfo?.name}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Select
                          value={idx.role}
                          onValueChange={(value: 'primary' | 'secondary') =>
                            handleRoleChange(idx.searchIndexId, value)
                          }
                        >
                          <SelectTrigger className="w-28 h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="primary">Primary</SelectItem>
                            <SelectItem value="secondary">Secondary</SelectItem>
                          </SelectContent>
                        </Select>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleRemoveIndex(idx.searchIndexId)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Add index dropdown */}
        {isLoadingIndexes ? (
          <Skeleton className="h-10 w-full" />
        ) : unselectedIndexes.length > 0 ? (
          <Select onValueChange={handleAddIndex}>
            <SelectTrigger className="w-full rounded-xl">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Plus className="h-4 w-4" />
                <span>Add search index...</span>
              </div>
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {unselectedIndexes.map((index) => (
                <SelectItem key={index.id} value={index.id} className="rounded-lg">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-muted-foreground" />
                    <span>{index.displayName}</span>
                    <Badge variant="outline" className="text-xs ml-2 rounded-md">
                      {index.searchType}
                    </Badge>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : availableIndexes.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-border rounded-xl">
            <Database className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No search indexes available</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Create a search index first before creating an experience
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-2">
            All available indexes have been added
          </p>
        )}

        {errors.indexes && (
          <p className="text-sm text-destructive font-medium">{errors.indexes}</p>
        )}
      </div>
    </div>
  );
}
