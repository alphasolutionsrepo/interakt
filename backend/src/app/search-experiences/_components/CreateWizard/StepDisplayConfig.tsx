// app/search-experiences/_components/CreateWizard/StepDisplayConfig.tsx

/**
 * Step 4: Display Configuration
 *
 * Configure how search results are displayed in the frontend:
 * - Select fields to display and assign roles
 * - Set display order via drag-and-drop
 * - Configure layout options
 */

'use client';

import { useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Type,
  Text,
  AlignLeft,
  Image,
  DollarSign,
  Tag,
  Info,
  Plus,
  X,
  Settings,
  Layout,
  Link2,
} from 'lucide-react';
import { useQueries } from '@tanstack/react-query';
import {
  DISPLAY_FIELD_ROLE_INFO,
  type DisplayFieldRole,
  type WizardFormData,
} from '@/features/search-experience/search-experience.client';

// ============================================================================
// TYPES
// ============================================================================

interface StepDisplayConfigProps {
  formData: WizardFormData;
  errors: Record<string, string>;
  updateField: <K extends keyof WizardFormData>(field: K, value: WizardFormData[K]) => void;
}

interface IndexField {
  id: number;
  fieldName: string;
  displayName: string | null;
  fieldType: string;
  includeInResponse: boolean;
}

// ============================================================================
// ICON MAP
// ============================================================================

const RoleIcons: Record<DisplayFieldRole, React.ElementType> = {
  title: Type,
  subtitle: Text,
  description: AlignLeft,
  image: Image,
  price: DollarSign,
  badge: Tag,
  secondary: Info,
  link: Link2,
};

// ============================================================================
// COMPONENT
// ============================================================================

export function StepDisplayConfig({
  formData,
  errors,
  updateField,
}: StepDisplayConfigProps) {
  const { displayConfig, indexes } = formData;

  // Fetch fields for all selected indexes
  const indexFieldQueries = useQueries({
    queries: indexes.map((idx) => ({
      queryKey: ['search-index-fields', idx.searchIndexId],
      queryFn: async () => {
        const response = await fetch(`/api/search-indexes/${idx.searchIndexId}/fields`);
        if (!response.ok) throw new Error('Failed to fetch fields');
        const data = await response.json();
        return { indexId: idx.searchIndexId, fields: data.data || data.fields || [] };
      },
      enabled: !!idx.searchIndexId,
    })),
  });

  const isLoading = indexFieldQueries.some((q) => q.isLoading);

  // Merge fields from all indexes (only includeInResponse fields)
  const availableFields = useMemo(() => {
    const fieldMap = new Map<string, IndexField>();

    indexFieldQueries.forEach((query) => {
      if (query.data?.fields) {
        query.data.fields
          .filter((f: IndexField) => f.includeInResponse)
          .forEach((f: IndexField) => {
            if (!fieldMap.has(f.fieldName)) {
              fieldMap.set(f.fieldName, f);
            }
          });
      }
    });

    return Array.from(fieldMap.values());
  }, [indexFieldQueries]);

  // Current display fields
  const displayFields = displayConfig?.displayFields || [];
  const layoutConfig = displayConfig?.layout || {};

  // Add a new display field
  const addDisplayField = useCallback((fieldName: string) => {
    const field = availableFields.find((f) => f.fieldName === fieldName);
    if (!field) return;

    const newField = {
      fieldName: field.fieldName,
      role: 'secondary' as DisplayFieldRole,
      label: field.displayName || undefined,
      order: displayFields.length,
    };

    updateField('displayConfig', {
      displayFields: [...displayFields, newField],
      layout: layoutConfig,
    });
  }, [availableFields, displayFields, layoutConfig, updateField]);

  // Remove a display field
  const removeDisplayField = useCallback((index: number) => {
    const newFields = displayFields.filter((_, i) => i !== index);
    // Reorder remaining fields
    const reorderedFields = newFields.map((f, i) => ({ ...f, order: i }));

    updateField('displayConfig', {
      displayFields: reorderedFields,
      layout: layoutConfig,
    });
  }, [displayFields, layoutConfig, updateField]);

  // Update a display field
  const updateDisplayField = useCallback((
    index: number,
    updates: Partial<{ role: DisplayFieldRole; label: string }>
  ) => {
    const newFields = displayFields.map((f, i) =>
      i === index ? { ...f, ...updates } : f
    );

    updateField('displayConfig', {
      displayFields: newFields,
      layout: layoutConfig,
    });
  }, [displayFields, layoutConfig, updateField]);

  // Move field up/down
  const moveField = useCallback((index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= displayFields.length) return;

    const newFields = [...displayFields];
    [newFields[index], newFields[newIndex]] = [newFields[newIndex], newFields[index]];
    // Update order values
    const reorderedFields = newFields.map((f, i) => ({ ...f, order: i }));

    updateField('displayConfig', {
      displayFields: reorderedFields,
      layout: layoutConfig,
    });
  }, [displayFields, layoutConfig, updateField]);

  // Update layout config
  const updateLayout = useCallback((
    key: keyof NonNullable<WizardFormData['displayConfig']>['layout'],
    value: boolean
  ) => {
    updateField('displayConfig', {
      displayFields,
      layout: { ...layoutConfig, [key]: value },
    });
  }, [displayFields, layoutConfig, updateField]);

  // Fields not yet added
  const unusedFields = availableFields.filter(
    (f) => !displayFields.some((df) => df.fieldName === f.fieldName)
  );

  if (indexes.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Settings className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
        <p className="text-lg font-medium">No indexes selected</p>
        <p className="text-sm mt-2">Go back to Step 1 to select at least one search index.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Display Fields Configuration */}
      <Card className="border-border/60 rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Layout className="h-4 w-4 text-muted-foreground" />
            Display Fields
          </CardTitle>
          <CardDescription>
            Configure which fields to display in search results and their roles.
            This is optional - if not configured, all fields will be shown.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <>
              {/* Current display fields */}
              {displayFields.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Configured Fields</Label>
                  <div className="space-y-2">
                    {displayFields.map((field, index) => {
                      const RoleIcon = RoleIcons[field.role];
                      return (
                        <div
                          key={field.fieldName}
                          className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl border border-border/50"
                        >
                          <div className="flex flex-col gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 w-5 p-0"
                              onClick={() => moveField(index, 'up')}
                              disabled={index === 0}
                            >
                              <span className="text-xs">&#9650;</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 w-5 p-0"
                              onClick={() => moveField(index, 'down')}
                              disabled={index === displayFields.length - 1}
                            >
                              <span className="text-xs">&#9660;</span>
                            </Button>
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm text-foreground">
                                {field.fieldName}
                              </span>
                              {field.label && (
                                <span className="text-xs text-muted-foreground">
                                  ({field.label})
                                </span>
                              )}
                            </div>
                          </div>

                          <Select
                            value={field.role}
                            onValueChange={(value: DisplayFieldRole) =>
                              updateDisplayField(index, { role: value })
                            }
                          >
                            <SelectTrigger className="w-[140px] h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(DISPLAY_FIELD_ROLE_INFO).map(([role, info]) => {
                                const Icon = RoleIcons[role as DisplayFieldRole];
                                return (
                                  <SelectItem key={role} value={role}>
                                    <div className="flex items-center gap-2">
                                      <Icon className="h-3 w-3" />
                                      {info.label}
                                    </div>
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>

                          <Input
                            placeholder="Label (optional)"
                            value={field.label || ''}
                            onChange={(e) =>
                              updateDisplayField(index, { label: e.target.value || undefined })
                            }
                            className="w-[150px] h-8 text-sm"
                          />

                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-muted-foreground/70 hover:text-red-500"
                            onClick={() => removeDisplayField(index)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Add field selector */}
              {unusedFields.length > 0 && (
                <div className="pt-2">
                  <Label className="text-sm text-muted-foreground mb-2 block">Add Field</Label>
                  <div className="flex flex-wrap gap-2">
                    {unusedFields.map((field) => (
                      <Button
                        key={field.fieldName}
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => addDisplayField(field.fieldName)}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        {field.displayName || field.fieldName}
                        <Badge variant="secondary" className="ml-2 text-[10px] px-1">
                          {field.fieldType}
                        </Badge>
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {availableFields.length === 0 && !isLoading && (
                <div className="text-center py-6 text-muted-foreground">
                  <p className="text-sm">No fields available for display configuration.</p>
                  <p className="text-xs mt-1">
                    Ensure selected indexes have fields marked as &quot;Include in Response&quot;.
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Layout Options */}
      <Card className="border-border/60 rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="h-4 w-4 text-muted-foreground" />
            Layout Options
          </CardTitle>
          <CardDescription>
            Additional display preferences for search results.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Show Relevance Score</Label>
              <p className="text-xs text-muted-foreground">
                Display the search relevance score for each result
              </p>
            </div>
            <Switch
              checked={layoutConfig.showScore ?? false}
              onCheckedChange={(checked) => updateLayout('showScore', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Show Highlights</Label>
              <p className="text-xs text-muted-foreground">
                Display highlighted matching text in results
              </p>
            </div>
            <Switch
              checked={layoutConfig.showHighlights ?? true}
              onCheckedChange={(checked) => updateLayout('showHighlights', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Role Guide */}
      <Card className="border-border/60 bg-muted/30 rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">Field Role Guide</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            {Object.entries(DISPLAY_FIELD_ROLE_INFO).map(([role, info]) => {
              const Icon = RoleIcons[role as DisplayFieldRole];
              return (
                <div key={role} className="flex items-start gap-2">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground/70 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-medium text-foreground">{info.label}</span>
                    <p className="text-muted-foreground mt-0.5">{info.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
