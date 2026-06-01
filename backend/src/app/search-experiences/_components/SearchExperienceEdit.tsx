'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ChevronLeft,
  Save,
  Loader2,
  AlertCircle,
  Settings,
  Brain,
  Shield,
  Layers,
  Plus,
  X,
  Highlighter,
  Sparkles,
  Layout,
  Type,
  Text,
  AlignLeft,
  Image,
  DollarSign,
  Tag,
  Info,
  Link2,
  Compass,
  Zap,
  Search,
  ChevronUp,
  ChevronDown,
  Blend,
} from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import { useQuery, useQueries } from '@tanstack/react-query';
import { useSearchExperience, useSlugAvailability } from '../_lib/hooks';
import {
  MULTI_INDEX_STRATEGY_INFO,
  RESULT_MERGE_STRATEGY_INFO,
  DISPLAY_FIELD_ROLE_INFO,
  type MultiIndexStrategy,
  type ResultMergeStrategy,
  type UpdateSearchExperienceDTO,
  type DisplayFieldRole,
 SearchExperienceDisplayConfig, SearchExperienceDisplayField } from '@/features/search-experience/search-experience.client';
import { CustomInstructionsGenerator } from './CreateWizard/CustomInstructionsGenerator/CustomInstructionsGenerator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

// ============================================================================
// TYPES
// ============================================================================

interface IndexField {
  id: number;
  fieldName: string;
  displayName: string | null;
  fieldType: string;
  includeInResponse: boolean;
}

// ============================================================================
// ICON MAP FOR DISPLAY FIELD ROLES
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
// SKELETON
// ============================================================================

function EditSkeleton() {
  return (
    <div className="flex-1 space-y-8 p-6 lg:p-8">
      {/* Breadcrumb skeleton */}
      <Skeleton className="h-4 w-48 rounded-lg" />

      {/* Header skeleton */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Skeleton className="size-14 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-64 rounded-lg" />
            <Skeleton className="h-4 w-48 rounded-lg" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24 rounded-xl" />
          <Skeleton className="h-10 w-32 rounded-xl" />
        </div>
      </div>

      {/* Tabs skeleton */}
      <Skeleton className="h-10 w-96 rounded-xl" />

      {/* Content skeleton */}
      <div className="space-y-4">
        <Skeleton className="h-64 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    </div>
  );
}

// ============================================================================
// DISPLAY CONFIG TAB COMPONENT
// ============================================================================

interface DisplayConfigTabProps {
  experience: {
    indexes: Array<{
      searchIndexId: string;
      searchIndex: {
        id: string;
        name: string;
        displayName: string;
      };
    }>;
  };
  displayConfig: SearchExperienceDisplayConfig | null;
  onDisplayConfigChange: (config: SearchExperienceDisplayConfig | null) => void;
}

function DisplayConfigTab({ experience, displayConfig, onDisplayConfigChange }: DisplayConfigTabProps) {
  // Fetch fields for all attached indexes
  const indexFieldQueries = useQueries({
    queries: experience.indexes.map((idx) => ({
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

  const isLoadingFields = indexFieldQueries.some((q) => q.isLoading);

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

    const newField: SearchExperienceDisplayField = {
      fieldName: field.fieldName,
      role: 'secondary',
      label: field.displayName || undefined,
      order: displayFields.length,
    };

    onDisplayConfigChange({
      displayFields: [...displayFields, newField],
      layout: layoutConfig,
    });
  }, [availableFields, displayFields, layoutConfig, onDisplayConfigChange]);

  // Remove a display field
  const removeDisplayField = useCallback((index: number) => {
    const newFields = displayFields.filter((_, i) => i !== index);
    const reorderedFields = newFields.map((f, i) => ({ ...f, order: i }));

    if (reorderedFields.length === 0) {
      onDisplayConfigChange(null);
    } else {
      onDisplayConfigChange({
        displayFields: reorderedFields,
        layout: layoutConfig,
      });
    }
  }, [displayFields, layoutConfig, onDisplayConfigChange]);

  // Update a display field
  const updateDisplayField = useCallback((
    index: number,
    updates: Partial<{ role: DisplayFieldRole; label: string }>
  ) => {
    const newFields = displayFields.map((f, i) =>
      i === index ? { ...f, ...updates } : f
    );

    onDisplayConfigChange({
      displayFields: newFields,
      layout: layoutConfig,
    });
  }, [displayFields, layoutConfig, onDisplayConfigChange]);

  // Move field up/down
  const moveField = useCallback((index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= displayFields.length) return;

    const newFields = [...displayFields];
    [newFields[index], newFields[newIndex]] = [newFields[newIndex], newFields[index]];
    const reorderedFields = newFields.map((f, i) => ({ ...f, order: i }));

    onDisplayConfigChange({
      displayFields: reorderedFields,
      layout: layoutConfig,
    });
  }, [displayFields, layoutConfig, onDisplayConfigChange]);

  // Fields not yet added
  const unusedFields = availableFields.filter(
    (f) => !displayFields.some((df) => df.fieldName === f.fieldName)
  );

  if (experience.indexes.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-muted/50 mx-auto mb-4">
          <Settings className="size-8 text-muted-foreground/50" />
        </div>
        <p className="text-lg font-semibold tracking-tight">No indexes attached</p>
        <p className="text-sm text-muted-foreground mt-2">Add indexes to configure display fields.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Display Fields Configuration */}
      <Card className="border-border/60 shadow-sm rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 font-semibold">
            <Layout className="h-4 w-4 text-blue-500" />
            Display Fields
          </CardTitle>
          <CardDescription>
            Configure which fields to display in search results and their roles.
            This is optional - if not configured, all fields will be shown.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoadingFields ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
          ) : (
            <>
              {/* Current display fields */}
              {displayFields.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground font-medium">Configured Fields</Label>
                  <div className="space-y-2">
                    {displayFields.map((field, index) => {
                      const FieldRoleIcon = RoleIcons[field.role];
                      return (
                        <div
                          key={field.fieldName}
                          className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl border border-border/50"
                        >
                          <div className="flex flex-col gap-0.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 w-5 p-0 rounded-md hover:bg-muted"
                              onClick={() => moveField(index, 'up')}
                              disabled={index === 0}
                            >
                              <ChevronUp className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 w-5 p-0 rounded-md hover:bg-muted"
                              onClick={() => moveField(index, 'down')}
                              disabled={index === displayFields.length - 1}
                            >
                              <ChevronDown className="h-3 w-3" />
                            </Button>
                          </div>

                          <div className="flex size-8 items-center justify-center rounded-lg bg-background border border-border/50">
                            <FieldRoleIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-medium">
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
                            <SelectTrigger className="w-[140px] h-8 rounded-lg">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                              {Object.entries(DISPLAY_FIELD_ROLE_INFO).map(([role, info]) => {
                                const Icon = RoleIcons[role as DisplayFieldRole];
                                return (
                                  <SelectItem key={role} value={role} className="rounded-lg">
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
                            className="w-[150px] h-8 text-sm rounded-lg"
                          />

                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive rounded-lg"
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
                  <Label className="text-sm text-muted-foreground font-medium mb-2 block">Add Field</Label>
                  <div className="flex flex-wrap gap-2">
                    {unusedFields.map((field) => (
                      <Button
                        key={field.fieldName}
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs rounded-lg"
                        onClick={() => addDisplayField(field.fieldName)}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        {field.displayName || field.fieldName}
                        <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 rounded-md">
                          {field.fieldType}
                        </Badge>
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {availableFields.length === 0 && !isLoadingFields && (
                <div className="text-center py-6">
                  <p className="text-sm text-muted-foreground">No fields available for display configuration.</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    Ensure attached indexes have fields marked as &quot;Include in Response&quot;.
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Role Guide */}
      <Card className="border-border/60 bg-muted/20 shadow-sm rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground font-medium">Field Role Guide</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            {Object.entries(DISPLAY_FIELD_ROLE_INFO).map(([role, info]) => {
              const Icon = RoleIcons[role as DisplayFieldRole];
              return (
                <div key={role} className="flex items-start gap-2">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-medium">{info.label}</span>
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

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface SearchExperienceEditProps {
  id: string;
  basePath?: string;
  listPath?: string;
}

export function SearchExperienceEdit({ id, basePath = '/search-experiences', listPath }: SearchExperienceEditProps) {
  const listHref = listPath ?? basePath;
  const router = useRouter();

  // Fetch existing data
  const { experience, isLoading, isError, updateExperience, isUpdating } = useSearchExperience(id);

  // Form state (initialized from fetched data)
  const [formData, setFormData] = useState<{
    name: string;
    slug: string;
    description: string;
    isActive: boolean;
    telemetryDetailLevel: 'off' | 'metadata' | 'full';
    searchConfig: {
      defaultPageSize: number;
      maxPageSize: number;
      enableHighlighting: boolean;
      enableFacets: boolean;
      multiIndexStrategy: MultiIndexStrategy;
      resultMergeStrategy: ResultMergeStrategy;
      maxIndexesPerQuery: number;
      autocomplete: {
        enabled: boolean;
        minLength: number;
        maxSuggestions: number;
        debounceMs: number;
      };
      hybridConfig?: {
        lexicalWeight?: number;
        semanticWeight?: number;
        rrfRankConstant?: number;
        rrfWindowSize?: number;
      };
      defaultSearchType?: 'lexical' | 'semantic' | 'hybrid' | 'auto';
    };
    aiConfig: {
      enabled: boolean;
      providerId: string | null;
      modelId: number | null;
      summary: {
        enabled: boolean;
        maxResultsForContext: number;
        maxTokens?: number;
        customInstructions?: string;
      };
      chat: {
        enabled: boolean;
        webSearchEnabled?: boolean;
        businessDomains?: string[];
        customInstructions?: string;
        enabledPresets?: string[];
        maxContextMessages: number;
        maxContextDocuments: number;
        temperature?: number;
        maxTokens?: number;
      };
    };
    toolsConfig: {
      enabled: string[];
      settings: Record<string, unknown>;
    };
    allowedOrigins: string[];
    displayConfig: SearchExperienceDisplayConfig | null;
  } | null>(null);

  const [newOrigin, setNewOrigin] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showSummaryGenerator, setShowSummaryGenerator] = useState(false);

  // Collapsible section states (collapsed by default if content exists)
  const [summaryInstructionsOpen, setSummaryInstructionsOpen] = useState(false);

  // Store initial data for dirty checking
  const [initialFormData, setInitialFormData] = useState<typeof formData>(null);

  // Initialize form when data loads
  useEffect(() => {
    if (experience && !formData) {
      // Parse searchConfig and ensure autocomplete has defaults
      const parsedSearchConfig = JSON.parse(JSON.stringify(experience.searchConfig)) as typeof formData.searchConfig;
      if (!parsedSearchConfig.autocomplete) {
        parsedSearchConfig.autocomplete = {
          enabled: false,
          minLength: 2,
          maxSuggestions: 8,
          debounceMs: 150,
        };
      }

      const initialData = {
        name: experience.name,
        slug: experience.slug,
        description: experience.description || '',
        isActive: experience.isActive,
        telemetryDetailLevel: experience.telemetryDetailLevel ?? 'off',
        searchConfig: parsedSearchConfig,
        aiConfig: JSON.parse(JSON.stringify(experience.aiConfig)) as typeof formData.aiConfig,
        toolsConfig: JSON.parse(JSON.stringify(experience.toolsConfig)) as typeof formData.toolsConfig,
        allowedOrigins: [...(experience.allowedOrigins || [])],
        displayConfig: experience.displayConfig ? JSON.parse(JSON.stringify(experience.displayConfig)) as SearchExperienceDisplayConfig : null,
      };
      setFormData(initialData);
      setInitialFormData(JSON.parse(JSON.stringify(initialData))); // Deep clone for comparison
    }
  }, [experience, formData]);

  // Check if form has changes (dirty check)
  const isDirty = useCallback(() => {
    if (!formData || !initialFormData) return false;
    return JSON.stringify(formData) !== JSON.stringify(initialFormData);
  }, [formData, initialFormData]);

  // Determine if connected indexes use native hybrid (e.g., Azure) vs custom hybrid (e.g., Elasticsearch)
  const NATIVE_HYBRID_PROVIDERS = ['azure-ai-search'];
  const { hasCustomHybridProvider, allNativeHybrid } = useMemo(() => {
    if (!experience?.indexes?.length) return { hasCustomHybridProvider: true, allNativeHybrid: false };

    const providers = experience.indexes.map(
      (idx) => (idx.searchIndex as { searchProvider?: string })?.searchProvider || 'elasticsearch'
    );
    const hasCustom = providers.some(p => !NATIVE_HYBRID_PROVIDERS.includes(p));
    const allNative = providers.every(p => NATIVE_HYBRID_PROVIDERS.includes(p));

    return { hasCustomHybridProvider: hasCustom, allNativeHybrid: allNative };
  }, [experience?.indexes]);

  // Slug availability check
  const { isAvailable: slugAvailable, isChecking: isCheckingSlug } = useSlugAvailability(
    formData?.slug || '',
    id,
    { enabled: !!formData && formData.slug !== experience?.slug && formData.slug.length >= 3 }
  );

  // Fetch AI providers
  const { data: providersData } = useQuery({
    queryKey: ['ai-providers'],
    queryFn: async () => {
      const response = await fetch('/api/ai-service/providers');
      const data = await response.json();
      return data.data || data;
    },
    enabled: !!formData,
  });

  const providers = providersData?.providers || [];
  const selectedProvider = providers.find((p: { id: string }) => p.id === formData?.aiConfig.providerId);
  // Update helpers
  const updateField = useCallback(<K extends keyof NonNullable<typeof formData>>(
    field: K,
    value: NonNullable<typeof formData>[K]
  ) => {
    setFormData((prev) => (prev ? { ...prev, [field]: value } : null));
  }, []);

  const updateSearchConfig = useCallback(
    <K extends keyof NonNullable<typeof formData>['searchConfig']>(
      field: K,
      value: NonNullable<typeof formData>['searchConfig'][K]
    ) => {
      setFormData((prev) =>
        prev ? { ...prev, searchConfig: { ...prev.searchConfig, [field]: value } } : null
      );
    },
    []
  );

  const updateAIConfig = useCallback(
    <K extends keyof NonNullable<typeof formData>['aiConfig']>(
      field: K,
      value: NonNullable<typeof formData>['aiConfig'][K]
    ) => {
      setFormData((prev) =>
        prev ? { ...prev, aiConfig: { ...prev.aiConfig, [field]: value } } : null
      );
    },
    []
  );

  const updateSummaryConfig = useCallback(
    <K extends keyof NonNullable<typeof formData>['aiConfig']['summary']>(
      field: K,
      value: NonNullable<typeof formData>['aiConfig']['summary'][K]
    ) => {
      setFormData((prev) =>
        prev
          ? {
              ...prev,
              aiConfig: { ...prev.aiConfig, summary: { ...prev.aiConfig.summary, [field]: value } },
            }
          : null
      );
    },
    []
  );

  const updateAutocompleteConfig = useCallback(
    <K extends keyof NonNullable<typeof formData>['searchConfig']['autocomplete']>(
      field: K,
      value: NonNullable<typeof formData>['searchConfig']['autocomplete'][K]
    ) => {
      setFormData((prev) =>
        prev
          ? {
              ...prev,
              searchConfig: {
                ...prev.searchConfig,
                autocomplete: { ...prev.searchConfig.autocomplete, [field]: value },
              },
            }
          : null
      );
    },
    []
  );

  const updateHybridConfig = useCallback(
    <K extends keyof NonNullable<NonNullable<typeof formData>['searchConfig']['hybridConfig']>>(
      field: K,
      value: NonNullable<NonNullable<typeof formData>['searchConfig']['hybridConfig']>[K]
    ) => {
      setFormData((prev) =>
        prev
          ? {
              ...prev,
              searchConfig: {
                ...prev.searchConfig,
                hybridConfig: { ...prev.searchConfig.hybridConfig, [field]: value },
              },
            }
          : null
      );
    },
    []
  );

  const toggleTool = useCallback((tool: string, enabled: boolean) => {
    setFormData((prev) => {
      if (!prev) return null;
      const newEnabled = enabled
        ? [...prev.toolsConfig.enabled, tool]
        : prev.toolsConfig.enabled.filter((t) => t !== tool);
      return { ...prev, toolsConfig: { ...prev.toolsConfig, enabled: newEnabled } };
    });
  }, []);

  const handleAddOrigin = useCallback(() => {
    const origin = newOrigin.trim();
    if (!origin || !formData) return;
    try {
      new URL(origin);
    } catch {
      return;
    }
    if (!formData.allowedOrigins.includes(origin)) {
      updateField('allowedOrigins', [...formData.allowedOrigins, origin]);
    }
    setNewOrigin('');
  }, [newOrigin, formData, updateField]);

  const handleRemoveOrigin = useCallback(
    (origin: string) => {
      if (!formData) return;
      updateField(
        'allowedOrigins',
        formData.allowedOrigins.filter((o) => o !== origin)
      );
    },
    [formData, updateField]
  );

  // Handle save
  const handleSave = async () => {
    if (!formData) return;

    // Check if there are any changes
    if (!isDirty()) {
      toast.info('No changes to save');
      return;
    }

    setIsSaving(true);
    try {
      const updateData: UpdateSearchExperienceDTO = {
        name: formData.name,
        slug: formData.slug !== experience?.slug ? formData.slug : undefined,
        description: formData.description || null,
        isActive: formData.isActive,
        telemetryDetailLevel: formData.telemetryDetailLevel,
        searchConfig: formData.searchConfig,
        aiConfig: formData.aiConfig,
        toolsConfig: formData.toolsConfig,
        allowedOrigins: formData.allowedOrigins,
        displayConfig: formData.displayConfig,
      };

      await updateExperience(updateData);
      router.push(`${basePath}/${id}`);
    } catch (error) {
      // Error handled by hook
    } finally {
      setIsSaving(false);
    }
  };

  // Loading state
  if (isLoading || !formData) {
    return <EditSkeleton />;
  }

  // Error state
  if (isError || !experience) {
    return (
      <div className="flex-1 p-6 lg:p-8">
        <div className="text-center py-16">
          <div className="flex size-20 items-center justify-center rounded-2xl bg-destructive/10 mx-auto mb-6">
            <AlertCircle className="size-10 text-destructive/70" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Failed to load experience</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            The search experience could not be loaded. Please try again.
          </p>
          <Button variant="outline" className="mt-6 rounded-xl" onClick={() => router.push(listHref)}>
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back to list
          </Button>
        </div>
      </div>
    );
  }

  const hasChanges = isDirty();
  const canSave = hasChanges && formData.name.length > 0 && formData.slug.length >= 3 && slugAvailable !== false;

  return (
    <div className="flex-1 space-y-8 p-6 lg:p-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href={listHref} className="hover:text-foreground transition-colors">
          Experiences
        </Link>
        <ChevronLeft className="h-4 w-4 rotate-180" />
        <Link href={`${basePath}/${id}`} className="hover:text-foreground transition-colors">
          {experience.name}
        </Link>
        <ChevronLeft className="h-4 w-4 rotate-180" />
        <span className="text-foreground font-medium">Edit</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="relative">
            <div className={`flex size-14 items-center justify-center rounded-xl shadow-sm ${
              formData.isActive
                ? 'bg-gradient-to-br from-primary/20 via-primary/10 to-transparent ring-1 ring-primary/30'
                : 'bg-muted/50 ring-1 ring-border/50'
            }`}>
              <Compass className={`size-7 ${formData.isActive ? 'text-primary' : 'text-muted-foreground'}`} />
            </div>
            {formData.isActive && (
              <div className="absolute -right-0.5 -bottom-0.5 flex items-center justify-center size-5 rounded-full bg-emerald-500 ring-2 ring-background">
                <Zap className="size-3 text-white fill-white" />
              </div>
            )}
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Edit Experience</h1>
            <p className="text-base text-muted-foreground mt-1">Update configuration for {experience.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="rounded-xl" onClick={() => router.push(`${basePath}/${id}`)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!canSave || isSaving}
            variant={hasChanges ? 'default' : 'outline'}
            className="rounded-xl"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                {hasChanges ? 'Save Changes' : 'No Changes'}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Form Tabs */}
      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="h-auto p-1.5 bg-muted/40 backdrop-blur-sm border border-border/50 rounded-2xl gap-1 flex-wrap">
          <TabsTrigger
            value="general"
            className="rounded-xl px-4 py-2.5 text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:border-border/60 data-[state=inactive]:hover:bg-muted/60 gap-2"
          >
            <Settings className="size-4" />
            <span>General</span>
          </TabsTrigger>
          <TabsTrigger
            value="search"
            className="rounded-xl px-4 py-2.5 text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:border-border/60 data-[state=inactive]:hover:bg-muted/60 gap-2"
          >
            <Search className="size-4" />
            <span>Search</span>
          </TabsTrigger>
          <TabsTrigger
            value="ai"
            className="rounded-xl px-4 py-2.5 text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:border-border/60 data-[state=inactive]:hover:bg-muted/60 gap-2"
          >
            <Brain className="size-4" />
            <span>AI</span>
          </TabsTrigger>
          <TabsTrigger
            value="display"
            className="rounded-xl px-4 py-2.5 text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:border-border/60 data-[state=inactive]:hover:bg-muted/60 gap-2"
          >
            <Layout className="size-4" />
            <span>Display</span>
          </TabsTrigger>
          <TabsTrigger
            value="security"
            className="rounded-xl px-4 py-2.5 text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:border-border/60 data-[state=inactive]:hover:bg-muted/60 gap-2"
          >
            <Shield className="size-4" />
            <span>Security</span>
          </TabsTrigger>
        </TabsList>

        {/* General Tab */}
        <TabsContent value="general" className="space-y-6">
          <Card className="border-border/60 shadow-sm rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Settings className="h-4 w-4 text-blue-500" />
                Basic Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
                <div>
                  <Label className="text-sm font-medium">Status</Label>
                  <p className="text-xs text-muted-foreground">Enable or disable this experience</p>
                </div>
                <Switch
                  checked={formData.isActive}
                  onCheckedChange={(checked) => updateField('isActive', checked)}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
                <div>
                  <Label className="text-sm font-medium">Telemetry</Label>
                  <p className="text-xs text-muted-foreground">Control what data is recorded in traces</p>
                </div>
                <select
                  className="rounded-lg border bg-background px-3 py-1.5 text-sm"
                  value={formData.telemetryDetailLevel}
                  onChange={(e) => updateField('telemetryDetailLevel', e.target.value as 'off' | 'metadata' | 'full')}
                >
                  <option value="off">Off</option>
                  <option value="metadata">Metadata only</option>
                  <option value="full">Full (includes messages)</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium">Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  className="rounded-lg"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug" className="text-sm font-medium">Slug</Label>
                <Input
                  id="slug"
                  value={formData.slug}
                  onChange={(e) => updateField('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  className="font-mono rounded-lg"
                />
                {slugAvailable === false && (
                  <p className="text-sm text-destructive">This slug is already in use</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description" className="text-sm font-medium">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => updateField('description', e.target.value)}
                  rows={3}
                  className="rounded-lg"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Search Tab */}
        <TabsContent value="search" className="space-y-6">
          <Card className="border-border/60 shadow-sm rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 font-semibold">
                <Search className="h-4 w-4 text-blue-500" />
                Pagination
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Default Page Size</Label>
                  <Input
                    type="number"
                    value={formData.searchConfig.defaultPageSize}
                    onChange={(e) => updateSearchConfig('defaultPageSize', parseInt(e.target.value) || 10)}
                    className="rounded-lg"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Max Page Size</Label>
                  <Input
                    type="number"
                    value={formData.searchConfig.maxPageSize}
                    onChange={(e) => updateSearchConfig('maxPageSize', parseInt(e.target.value) || 100)}
                    className="rounded-lg"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-sm rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 font-semibold">
                <Highlighter className="h-4 w-4 text-amber-500" />
                Features
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
                <div>
                  <Label className="text-sm font-medium">Highlighting</Label>
                  <p className="text-xs text-muted-foreground">Highlight matching terms</p>
                </div>
                <Switch
                  checked={formData.searchConfig.enableHighlighting}
                  onCheckedChange={(checked) => updateSearchConfig('enableHighlighting', checked)}
                />
              </div>
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
                <div>
                  <Label className="text-sm font-medium">Facets</Label>
                  <p className="text-xs text-muted-foreground">Enable faceted search</p>
                </div>
                <Switch
                  checked={formData.searchConfig.enableFacets}
                  onCheckedChange={(checked) => updateSearchConfig('enableFacets', checked)}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-sm rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 font-semibold">
                <Layers className="h-4 w-4 text-violet-500" />
                Multi-Index
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Search Strategy</Label>
                <Select
                  value={formData.searchConfig.multiIndexStrategy}
                  onValueChange={(value: MultiIndexStrategy) => updateSearchConfig('multiIndexStrategy', value)}
                >
                  <SelectTrigger className="rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {Object.entries(MULTI_INDEX_STRATEGY_INFO).map(([key, info]) => (
                      <SelectItem key={key} value={key} className="rounded-lg">{info.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Merge Strategy</Label>
                <Select
                  value={formData.searchConfig.resultMergeStrategy}
                  onValueChange={(value: ResultMergeStrategy) => updateSearchConfig('resultMergeStrategy', value)}
                >
                  <SelectTrigger className="rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {Object.entries(RESULT_MERGE_STRATEGY_INFO).map(([key, info]) => (
                      <SelectItem key={key} value={key} className="rounded-lg">{info.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-sm rounded-2xl">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2 font-semibold">
                  <Sparkles className="h-4 w-4 text-pink-500" />
                  Autocomplete
                </CardTitle>
                <Switch
                  checked={formData.searchConfig.autocomplete?.enabled ?? false}
                  onCheckedChange={(checked) => updateAutocompleteConfig('enabled', checked)}
                />
              </div>
              <CardDescription>
                Enable type-ahead suggestions for faster search
              </CardDescription>
            </CardHeader>
            {formData.searchConfig.autocomplete?.enabled && (
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Min Characters</Label>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={formData.searchConfig.autocomplete.minLength}
                      onChange={(e) => updateAutocompleteConfig('minLength', parseInt(e.target.value) || 2)}
                      className="rounded-lg"
                    />
                    <p className="text-xs text-muted-foreground">Start suggesting after</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Max Suggestions</Label>
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={formData.searchConfig.autocomplete.maxSuggestions}
                      onChange={(e) => updateAutocompleteConfig('maxSuggestions', parseInt(e.target.value) || 8)}
                      className="rounded-lg"
                    />
                    <p className="text-xs text-muted-foreground">Results to show</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Debounce (ms)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={1000}
                      step={50}
                      value={formData.searchConfig.autocomplete.debounceMs}
                      onChange={(e) => updateAutocompleteConfig('debounceMs', parseInt(e.target.value) || 150)}
                      className="rounded-lg"
                    />
                    <p className="text-xs text-muted-foreground">Delay before request</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-xl">
                  Note: Autocomplete requires fields marked as &quot;Autocomplete&quot; in your search index configuration.
                </p>
              </CardContent>
            )}
          </Card>

          {/* Hybrid Search Tuning */}
          <Card className="border-border/60 shadow-sm rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 font-semibold">
                <Blend className="h-4 w-4 text-indigo-500" />
                Hybrid Search Tuning
                {!formData.searchConfig.hybridConfig && (
                  <span className="text-xs font-normal text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full">
                    Using Global Defaults
                  </span>
                )}
              </CardTitle>
              <CardDescription>
                Fine-tune the balance between lexical (keyword) and semantic (vector) search.
                Leave unchanged to use global defaults.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Search Type Override */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Search Type</Label>
                <Select
                  value={formData.searchConfig.defaultSearchType ?? 'auto'}
                  onValueChange={(value: 'lexical' | 'semantic' | 'hybrid' | 'auto') =>
                    updateSearchConfig('defaultSearchType', value === 'auto' ? undefined : value)
                  }
                >
                  <SelectTrigger className="rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="auto" className="rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Auto</span>
                        <span className="text-muted-foreground text-xs">Use index default</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="hybrid" className="rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Hybrid</span>
                        <span className="text-muted-foreground text-xs">Keyword + Semantic</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="lexical" className="rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Lexical Only</span>
                        <span className="text-muted-foreground text-xs">Exact keywords only</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="semantic" className="rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Semantic Only</span>
                        <span className="text-muted-foreground text-xs">Meaning-based only</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Override search type. &quot;Lexical Only&quot; returns 0 results if no documents contain the search terms.
                  Semantic/Hybrid require an index with embeddings.
                </p>
              </div>

              {/* Hybrid-specific settings - only show when hybrid or auto is selected */}
              {(!formData.searchConfig.defaultSearchType || formData.searchConfig.defaultSearchType === 'auto' || formData.searchConfig.defaultSearchType === 'hybrid') ? (
                <>
                  {/* Native hybrid provider info (e.g., Azure AI Search) */}
                  {allNativeHybrid && (
                    <div className="flex items-start gap-3 text-sm text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 border border-blue-200 dark:border-blue-800">
                      <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium mb-1">Native Hybrid Search</p>
                        <p className="text-xs">
                          Your connected indexes use a provider with built-in hybrid search fusion.
                          Weight and RRF tuning are handled internally by the provider and cannot be customized here.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Show weight/RRF controls only when at least one index uses custom hybrid (e.g., Elasticsearch) */}
                  {hasCustomHybridProvider && (
                    <>
                      {/* Weight Sliders */}
                      <div className="space-y-4">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label className="text-sm font-medium flex items-center gap-2">
                              Lexical Weight
                              {!formData.searchConfig.hybridConfig?.lexicalWeight && (
                                <span className="text-[10px] text-muted-foreground">(global)</span>
                              )}
                            </Label>
                            <span className="text-sm font-mono text-muted-foreground">
                              {formData.searchConfig.hybridConfig?.lexicalWeight?.toFixed(1) ?? '1.0'}
                            </span>
                          </div>
                          <Slider
                            value={[formData.searchConfig.hybridConfig?.lexicalWeight ?? 1.0]}
                            onValueChange={([value]) => updateHybridConfig('lexicalWeight', value)}
                            min={0.1}
                            max={3.0}
                            step={0.1}
                            className="w-full"
                          />
                          <p className="text-xs text-muted-foreground">
                            Higher values favor exact keyword matches
                          </p>
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label className="text-sm font-medium flex items-center gap-2">
                              Semantic Weight
                              {!formData.searchConfig.hybridConfig?.semanticWeight && (
                                <span className="text-[10px] text-muted-foreground">(global)</span>
                              )}
                            </Label>
                            <span className="text-sm font-mono text-muted-foreground">
                              {formData.searchConfig.hybridConfig?.semanticWeight?.toFixed(1) ?? '1.0'}
                            </span>
                          </div>
                          <Slider
                            value={[formData.searchConfig.hybridConfig?.semanticWeight ?? 1.0]}
                            onValueChange={([value]) => updateHybridConfig('semanticWeight', value)}
                            min={0.1}
                            max={3.0}
                            step={0.1}
                            className="w-full"
                          />
                          <p className="text-xs text-muted-foreground">
                            Higher values favor conceptual/meaning similarity
                          </p>
                        </div>
                      </div>

                      {/* RRF Parameters */}
                      <div className="grid grid-cols-2 gap-4 pt-2">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium flex items-center gap-2">
                            RRF Rank Constant
                            {!formData.searchConfig.hybridConfig?.rrfRankConstant && (
                              <span className="text-[10px] text-muted-foreground">(global)</span>
                            )}
                          </Label>
                          <Input
                            type="number"
                            min={1}
                            max={1000}
                            placeholder="60"
                            value={formData.searchConfig.hybridConfig?.rrfRankConstant ?? ''}
                            onChange={(e) => updateHybridConfig('rrfRankConstant', e.target.value ? parseInt(e.target.value) : undefined)}
                            className="rounded-lg font-mono"
                          />
                          <p className="text-xs text-muted-foreground">
                            Higher values reduce top-ranking impact (global default: 60)
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium flex items-center gap-2">
                            RRF Window Size
                            {!formData.searchConfig.hybridConfig?.rrfWindowSize && (
                              <span className="text-[10px] text-muted-foreground">(global)</span>
                            )}
                          </Label>
                          <Input
                            type="number"
                            min={10}
                            max={500}
                            placeholder="100"
                            value={formData.searchConfig.hybridConfig?.rrfWindowSize ?? ''}
                            onChange={(e) => updateHybridConfig('rrfWindowSize', e.target.value ? parseInt(e.target.value) : undefined)}
                            className="rounded-lg font-mono"
                          />
                          <p className="text-xs text-muted-foreground">
                            Results considered from each search type (global default: 100)
                          </p>
                        </div>
                      </div>

                      <p className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-xl">
                        <strong>Tip:</strong> If you want more exact matches, increase lexical weight.
                        For better conceptual understanding, increase semantic weight.
                      </p>
                    </>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 p-3 rounded-xl">
                  <strong>Note:</strong> Weight and RRF settings only apply to Hybrid search mode.
                  You&apos;ve selected {formData.searchConfig.defaultSearchType === 'lexical' ? 'Lexical Only' : 'Semantic Only'} mode.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Tab */}
        <TabsContent value="ai" className="space-y-6">
          <Card className="border-border/60 shadow-sm rounded-2xl">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-violet-500/15 shadow-sm">
                    <Brain className="size-5 text-violet-500" />
                  </div>
                  <div>
                    <Label className="text-base font-medium">Enable AI Features</Label>
                    <p className="text-sm text-muted-foreground">AI summaries</p>
                  </div>
                </div>
                <Switch
                  checked={formData.aiConfig.enabled}
                  onCheckedChange={(checked) => updateAIConfig('enabled', checked)}
                />
              </div>
            </CardContent>
          </Card>

          {formData.aiConfig.enabled && (
            <>
              <Card className="border-border/60 shadow-sm rounded-2xl">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2 font-semibold">
                      <Brain className="h-4 w-4 text-violet-500" />
                      AI Summary
                    </CardTitle>
                    <Switch
                      checked={formData.aiConfig.summary.enabled}
                      onCheckedChange={(checked) => updateSummaryConfig('enabled', checked)}
                    />
                  </div>
                </CardHeader>
                {formData.aiConfig.summary.enabled && (
                  <CardContent className="space-y-6">
                    {/* Parameters Section */}
                    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
                      <div className="flex items-center gap-2">
                        <div className="flex size-8 items-center justify-center rounded-lg bg-blue-500/15">
                          <Layers className="size-4 text-blue-500" />
                        </div>
                        <div>
                          <Label className="text-sm font-semibold">Summary Parameters</Label>
                          <p className="text-xs text-muted-foreground">Control summary generation limits</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="rounded-lg border border-border/50 bg-background p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Search Results</Label>
                            <span className="text-xs text-muted-foreground/60">context</span>
                          </div>
                          <Input
                            type="number"
                            min={1}
                            max={50}
                            value={formData.aiConfig.summary.maxResultsForContext}
                            onChange={(e) => updateSummaryConfig('maxResultsForContext', parseInt(e.target.value) || 10)}
                            className="h-9 rounded-md border-0 bg-muted/50 font-mono text-lg font-semibold"
                          />
                        </div>
                        <div className="rounded-lg border border-border/50 bg-background p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Max Tokens</Label>
                            <span className="text-xs text-muted-foreground/60">response</span>
                          </div>
                          <Input
                            type="number"
                            min={50}
                            max={4000}
                            value={formData.aiConfig.summary.maxTokens || 500}
                            onChange={(e) => updateSummaryConfig('maxTokens', parseInt(e.target.value) || 500)}
                            className="h-9 rounded-md border-0 bg-muted/50 font-mono text-lg font-semibold"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Custom Instructions Section - Collapsible */}
                    <Collapsible open={summaryInstructionsOpen} onOpenChange={setSummaryInstructionsOpen}>
                      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <CollapsibleTrigger asChild>
                            <button type="button" className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer">
                              <div className="flex size-8 items-center justify-center rounded-lg bg-violet-500/15">
                                <Brain className="size-4 text-violet-500" />
                              </div>
                              <div className="text-left">
                                <div className="flex items-center gap-2">
                                  <Label className="text-sm font-semibold cursor-pointer">Custom Instructions</Label>
                                  {formData.aiConfig.summary.customInstructions && (
                                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">configured</Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground">Optional summary behavior customization</p>
                              </div>
                              {summaryInstructionsOpen ? (
                                <ChevronUp className="size-4 text-muted-foreground ml-2" />
                              ) : (
                                <ChevronDown className="size-4 text-muted-foreground ml-2" />
                              )}
                            </button>
                          </CollapsibleTrigger>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setShowSummaryGenerator(true)}
                            disabled={!experience?.indexes?.length}
                            className="gap-1.5 text-xs"
                          >
                            <Sparkles className="size-3.5" />
                            Generate with AI
                          </Button>
                        </div>
                        <CollapsibleContent className="space-y-3">
                          <Textarea
                            value={formData.aiConfig.summary.customInstructions || ''}
                            onChange={(e) => updateSummaryConfig('customInstructions', e.target.value || undefined)}
                            placeholder="Add custom instructions for summary generation (e.g., tone, focus areas)..."
                            rows={4}
                            className="rounded-lg border-border/50 bg-background focus:bg-background"
                          />
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  </CardContent>
                )}
              </Card>

            </>
          )}
        </TabsContent>

        {/* Display Tab */}
        <TabsContent value="display" className="space-y-6">
          <DisplayConfigTab
            experience={experience}
            displayConfig={formData.displayConfig}
            onDisplayConfigChange={(config) => updateField('displayConfig', config)}
          />
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-6">
          <Card className="border-border/60 shadow-sm rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 font-semibold">
                <Shield className="h-4 w-4 text-cyan-500" />
                Allowed Origins (CORS)
              </CardTitle>
              <CardDescription>
                Domains that can access this API. Empty allows all.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {formData.allowedOrigins.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {formData.allowedOrigins.map((origin) => (
                    <Badge key={origin} variant="outline" className="font-mono text-xs py-1.5 px-2.5 rounded-lg bg-muted/30">
                      {origin}
                      <button onClick={() => handleRemoveOrigin(origin)} className="ml-2 hover:text-destructive transition-colors">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  value={newOrigin}
                  onChange={(e) => setNewOrigin(e.target.value)}
                  placeholder="https://example.com"
                  className="font-mono rounded-lg"
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddOrigin())}
                />
                <Button variant="outline" onClick={handleAddOrigin} disabled={!newOrigin.trim()} className="rounded-lg">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Custom Instructions Generator Modals */}
      {experience && (
        <>
          <CustomInstructionsGenerator
            open={showSummaryGenerator}
            onOpenChange={setShowSummaryGenerator}
            experienceName={formData?.name || experience.name}
            experienceDescription={formData?.description || experience.description || undefined}
            indexIds={experience.indexes.map((idx) => idx.searchIndexId)}
            type="summary"
            currentInstructions={formData?.aiConfig.summary.customInstructions}
            onApply={(instructions) => updateSummaryConfig('customInstructions', instructions)}
          />
        </>
      )}
    </div>
  );
}
