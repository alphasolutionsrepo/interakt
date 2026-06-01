// app/search-experiences/_components/CreateWizard/StepSearchSettings.tsx

/**
 * Step 2: Search Settings
 *
 * - Pagination settings
 * - Highlighting and facets
 * - Multi-index strategy
 * - Result merge strategy
 * - Allowed origins (CORS)
 */

'use client';

import { useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Settings,
  Layers,
  Shield,
  Plus,
  X,
  Highlighter,
  Sparkles,
  Blend,
  Info,
} from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { useQuery } from '@tanstack/react-query';
import {
  MULTI_INDEX_STRATEGY_INFO,
  RESULT_MERGE_STRATEGY_INFO,
  type WizardFormData,
  type MultiIndexStrategy,
  type ResultMergeStrategy,
} from '@/features/search-experience/search-experience.client';

/**
 * Providers with native hybrid search (e.g., Azure AI Search) don't need
 * custom RRF tuning — their hybrid fusion is handled internally.
 * Only providers like Elasticsearch that use custom RRF need these settings.
 */
const NATIVE_HYBRID_PROVIDERS = ['azure-ai-search'];

// ============================================================================
// TYPES
// ============================================================================

interface StepSearchSettingsProps {
  formData: WizardFormData;
  errors: Record<string, string>;
  updateField: <K extends keyof WizardFormData>(field: K, value: WizardFormData[K]) => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function StepSearchSettings({
  formData,
  errors,
  updateField,
}: StepSearchSettingsProps) {
  const [newOrigin, setNewOrigin] = useState('');

  const { searchConfig, allowedOrigins } = formData;

  // Fetch available indexes (cached from Step 1 via React Query)
  const { data: indexesData } = useQuery({
    queryKey: ['search-indexes', 'all-active'],
    queryFn: async () => {
      const response = await fetch('/api/search-indexes?isActive=true&pageSize=100');
      const data = await response.json();
      return data.data?.items || [];
    },
  });

  // Determine if any selected index uses a provider with custom (non-native) hybrid
  const { hasCustomHybridProvider, allNativeHybrid, selectedProviders } = useMemo(() => {
    const availableIndexes: Array<{ id: string; searchProvider: string }> = indexesData || [];
    const selectedIds = new Set(formData.indexes.map(i => i.searchIndexId));
    const providers = new Set<string>();

    for (const idx of availableIndexes) {
      if (selectedIds.has(idx.id)) {
        providers.add(idx.searchProvider || 'elasticsearch');
      }
    }

    const providerArray = Array.from(providers);
    const hasCustom = providerArray.some(p => !NATIVE_HYBRID_PROVIDERS.includes(p));
    const allNative = providerArray.length > 0 && providerArray.every(p => NATIVE_HYBRID_PROVIDERS.includes(p));

    return {
      hasCustomHybridProvider: hasCustom,
      allNativeHybrid: allNative,
      selectedProviders: providerArray,
    };
  }, [indexesData, formData.indexes]);

  // Update search config field
  const updateSearchConfig = useCallback(
    <K extends keyof WizardFormData['searchConfig']>(
      field: K,
      value: WizardFormData['searchConfig'][K]
    ) => {
      updateField('searchConfig', { ...searchConfig, [field]: value });
    },
    [searchConfig, updateField]
  );

  // Add allowed origin
  const handleAddOrigin = useCallback(() => {
    const origin = newOrigin.trim();
    if (!origin) return;

    // Validate URL
    try {
      new URL(origin);
    } catch {
      return;
    }

    if (!allowedOrigins.includes(origin)) {
      updateField('allowedOrigins', [...allowedOrigins, origin]);
    }
    setNewOrigin('');
  }, [newOrigin, allowedOrigins, updateField]);

  // Remove allowed origin
  const handleRemoveOrigin = useCallback(
    (origin: string) => {
      updateField(
        'allowedOrigins',
        allowedOrigins.filter((o) => o !== origin)
      );
    },
    [allowedOrigins, updateField]
  );

  return (
    <div className="space-y-6">
      {/* Pagination Settings */}
      <Card className="border-border/60 rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Pagination
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="defaultPageSize">Default Page Size</Label>
              <Input
                id="defaultPageSize"
                type="number"
                min={1}
                max={100}
                value={searchConfig.defaultPageSize}
                onChange={(e) => updateSearchConfig('defaultPageSize', parseInt(e.target.value) || 10)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxPageSize">Maximum Page Size</Label>
              <Input
                id="maxPageSize"
                type="number"
                min={1}
                max={1000}
                value={searchConfig.maxPageSize}
                onChange={(e) => updateSearchConfig('maxPageSize', parseInt(e.target.value) || 100)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search Features */}
      <Card className="border-border/60 rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Highlighter className="h-4 w-4" />
            Search Features
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="enableHighlighting">Result Highlighting</Label>
              <p className="text-xs text-muted-foreground">
                Highlight matching terms in search results
              </p>
            </div>
            <Switch
              id="enableHighlighting"
              checked={searchConfig.enableHighlighting}
              onCheckedChange={(checked) => updateSearchConfig('enableHighlighting', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="enableFacets">Faceted Search</Label>
              <p className="text-xs text-muted-foreground">
                Enable facet aggregations for filtering
              </p>
            </div>
            <Switch
              id="enableFacets"
              checked={searchConfig.enableFacets}
              onCheckedChange={(checked) => updateSearchConfig('enableFacets', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Autocomplete Settings */}
      <Card className="border-border/60 rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Autocomplete
          </CardTitle>
          <CardDescription>
            Configure type-ahead suggestions for search queries
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="autocompleteEnabled">Enable Autocomplete</Label>
              <p className="text-xs text-muted-foreground">
                Show suggestions as users type
              </p>
            </div>
            <Switch
              id="autocompleteEnabled"
              checked={searchConfig.autocomplete?.enabled ?? true}
              onCheckedChange={(checked) =>
                updateSearchConfig('autocomplete', {
                  ...searchConfig.autocomplete,
                  enabled: checked,
                })
              }
            />
          </div>

          {searchConfig.autocomplete?.enabled !== false && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="autocompleteMinLength">Min Characters</Label>
                  <Input
                    id="autocompleteMinLength"
                    type="number"
                    min={1}
                    max={10}
                    value={searchConfig.autocomplete?.minLength ?? 2}
                    onChange={(e) =>
                      updateSearchConfig('autocomplete', {
                        ...searchConfig.autocomplete,
                        minLength: parseInt(e.target.value) || 2,
                      })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Characters before showing suggestions
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="autocompleteMaxSuggestions">Max Suggestions</Label>
                  <Input
                    id="autocompleteMaxSuggestions"
                    type="number"
                    min={1}
                    max={20}
                    value={searchConfig.autocomplete?.maxSuggestions ?? 8}
                    onChange={(e) =>
                      updateSearchConfig('autocomplete', {
                        ...searchConfig.autocomplete,
                        maxSuggestions: parseInt(e.target.value) || 8,
                      })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum suggestions to show
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="autocompleteDebounce">Debounce (ms)</Label>
                <Input
                  id="autocompleteDebounce"
                  type="number"
                  min={0}
                  max={1000}
                  step={50}
                  value={searchConfig.autocomplete?.debounceMs ?? 150}
                  onChange={(e) =>
                    updateSearchConfig('autocomplete', {
                      ...searchConfig.autocomplete,
                      debounceMs: parseInt(e.target.value) || 150,
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Delay before fetching suggestions (reduces API calls)
                </p>
              </div>
            </>
          )}

          <div className="text-xs text-muted-foreground bg-muted/30 rounded-xl p-3 border border-border/50">
            <p className="font-medium mb-1">Note:</p>
            <p>
              Autocomplete uses fields marked with &quot;Autocomplete&quot; enabled in your search indexes.
              Make sure to enable autocomplete on relevant text fields.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Multi-Index Settings */}
      <Card className="border-border/60 rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Multi-Index Settings
          </CardTitle>
          <CardDescription>
            Configure how multiple indexes are searched and merged
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="multiIndexStrategy">Search Strategy</Label>
            <Select
              value={searchConfig.multiIndexStrategy}
              onValueChange={(value: MultiIndexStrategy) =>
                updateSearchConfig('multiIndexStrategy', value)
              }
            >
              <SelectTrigger id="multiIndexStrategy">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(MULTI_INDEX_STRATEGY_INFO).map(([key, info]) => (
                  <SelectItem key={key} value={key}>
                    <div>
                      <span className="font-medium">{info.label}</span>
                      <span className="text-muted-foreground ml-2 text-xs">{info.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="resultMergeStrategy">Result Merge Strategy</Label>
            <Select
              value={searchConfig.resultMergeStrategy}
              onValueChange={(value: ResultMergeStrategy) =>
                updateSearchConfig('resultMergeStrategy', value)
              }
            >
              <SelectTrigger id="resultMergeStrategy">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(RESULT_MERGE_STRATEGY_INFO).map(([key, info]) => (
                  <SelectItem key={key} value={key}>
                    <div>
                      <span className="font-medium">{info.label}</span>
                      <span className="text-muted-foreground ml-2 text-xs">{info.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="maxIndexesPerQuery">Max Indexes Per Query</Label>
            <Input
              id="maxIndexesPerQuery"
              type="number"
              min={1}
              max={10}
              value={searchConfig.maxIndexesPerQuery}
              onChange={(e) => updateSearchConfig('maxIndexesPerQuery', parseInt(e.target.value) || 5)}
            />
            <p className="text-xs text-muted-foreground">
              Maximum number of indexes to search in a single query
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Hybrid Search Tuning */}
      <Card className="border-border/60 rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Blend className="h-4 w-4" />
            Hybrid Search Tuning
            {!searchConfig.hybridConfig && (
              <span className="text-xs font-normal text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                Using Global Defaults
              </span>
            )}
          </CardTitle>
          <CardDescription>
            Fine-tune how lexical (keyword) and semantic (meaning) search results are combined.
            Leave unchanged to use global defaults.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Search Type Override */}
          <div className="space-y-2">
            <Label htmlFor="defaultSearchType">Search Type</Label>
            <Select
              value={searchConfig.defaultSearchType ?? 'auto'}
              onValueChange={(value: 'lexical' | 'semantic' | 'hybrid' | 'auto') =>
                updateSearchConfig('defaultSearchType', value === 'auto' ? undefined : value)
              }
            >
              <SelectTrigger id="defaultSearchType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">
                  <div>
                    <span className="font-medium">Auto</span>
                    <span className="text-muted-foreground ml-2 text-xs">Use index default (recommended)</span>
                  </div>
                </SelectItem>
                <SelectItem value="hybrid">
                  <div>
                    <span className="font-medium">Hybrid</span>
                    <span className="text-muted-foreground ml-2 text-xs">Combine keyword + semantic search</span>
                  </div>
                </SelectItem>
                <SelectItem value="lexical">
                  <div>
                    <span className="font-medium">Lexical Only</span>
                    <span className="text-muted-foreground ml-2 text-xs">Exact keyword matching only</span>
                  </div>
                </SelectItem>
                <SelectItem value="semantic">
                  <div>
                    <span className="font-medium">Semantic Only</span>
                    <span className="text-muted-foreground ml-2 text-xs">Meaning-based search only</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Override the search type for this experience. &quot;Lexical Only&quot; returns only exact keyword matches
              (0 results if no documents contain the search terms). Semantic/Hybrid require an index with embeddings.
            </p>
          </div>

          {/* Hybrid-specific settings: Weight sliders and RRF parameters */}
          {(!searchConfig.defaultSearchType || searchConfig.defaultSearchType === 'hybrid') ? (
            <>
              {/* Native hybrid provider info (e.g., Azure AI Search) */}
              {allNativeHybrid && (
                <div className="flex items-start gap-3 text-sm text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 border border-blue-200 dark:border-blue-800">
                  <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium mb-1">Native Hybrid Search</p>
                    <p className="text-xs">
                      Your selected indexes use a provider with built-in hybrid search fusion.
                      Weight and RRF tuning are handled internally by the provider and cannot be customized here.
                    </p>
                  </div>
                </div>
              )}

              {/* Show weight/RRF controls only when at least one index uses custom hybrid (e.g., Elasticsearch) */}
              {hasCustomHybridProvider && (
                <>
                  {/* Lexical vs Semantic Weight */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="lexicalWeight" className="flex items-center gap-2">
                          Lexical Weight
                          {!searchConfig.hybridConfig?.lexicalWeight && (
                            <span className="text-[10px] text-muted-foreground/70">(global)</span>
                          )}
                        </Label>
                        <span className="text-sm font-mono text-muted-foreground">
                          {searchConfig.hybridConfig?.lexicalWeight?.toFixed(1) ?? '1.0'}
                        </span>
                      </div>
                      <Slider
                        id="lexicalWeight"
                        min={0.1}
                        max={3.0}
                        step={0.1}
                        value={[searchConfig.hybridConfig?.lexicalWeight ?? 1.0]}
                        onValueChange={([value]) =>
                          updateSearchConfig('hybridConfig', {
                            ...searchConfig.hybridConfig,
                            lexicalWeight: value,
                          })
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Higher values favor exact keyword matches. Increase for more literal results.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="semanticWeight" className="flex items-center gap-2">
                          Semantic Weight
                          {!searchConfig.hybridConfig?.semanticWeight && (
                            <span className="text-[10px] text-muted-foreground/70">(global)</span>
                          )}
                        </Label>
                        <span className="text-sm font-mono text-muted-foreground">
                          {searchConfig.hybridConfig?.semanticWeight?.toFixed(1) ?? '1.0'}
                        </span>
                      </div>
                      <Slider
                        id="semanticWeight"
                        min={0.1}
                        max={3.0}
                        step={0.1}
                        value={[searchConfig.hybridConfig?.semanticWeight ?? 1.0]}
                        onValueChange={([value]) =>
                          updateSearchConfig('hybridConfig', {
                            ...searchConfig.hybridConfig,
                            semanticWeight: value,
                          })
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Higher values favor conceptually similar results. Increase for more &quot;understanding&quot;-based results.
                      </p>
                    </div>
                  </div>

                  {/* Advanced RRF Settings */}
                  <div className="border-t pt-4">
                    <p className="text-sm font-medium mb-3">Advanced Settings</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="rrfRankConstant" className="flex items-center gap-2">
                          RRF Rank Constant (k)
                          {!searchConfig.hybridConfig?.rrfRankConstant && (
                            <span className="text-[10px] text-muted-foreground/70">(global)</span>
                          )}
                        </Label>
                        <Input
                          id="rrfRankConstant"
                          type="number"
                          min={1}
                          max={1000}
                          placeholder="60"
                          value={searchConfig.hybridConfig?.rrfRankConstant ?? ''}
                          onChange={(e) =>
                            updateSearchConfig('hybridConfig', {
                              ...searchConfig.hybridConfig,
                              rrfRankConstant: e.target.value ? parseInt(e.target.value) : undefined,
                            })
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          Higher values reduce impact of top-ranked docs (global default: 60)
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="rrfWindowSize" className="flex items-center gap-2">
                          Window Size
                          {!searchConfig.hybridConfig?.rrfWindowSize && (
                            <span className="text-[10px] text-muted-foreground/70">(global)</span>
                          )}
                        </Label>
                        <Input
                          id="rrfWindowSize"
                          type="number"
                          min={10}
                          max={500}
                          placeholder="100"
                          value={searchConfig.hybridConfig?.rrfWindowSize ?? ''}
                          onChange={(e) =>
                            updateSearchConfig('hybridConfig', {
                              ...searchConfig.hybridConfig,
                              rrfWindowSize: e.target.value ? parseInt(e.target.value) : undefined,
                            })
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          Results to consider from each search type (global default: 100)
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground bg-muted/30 rounded-xl p-3 border border-border/50">
                    <p className="font-medium mb-1">Tip:</p>
                    <p>
                      For product searches where exact terms matter (like &quot;blue shirts&quot;), increase lexical weight.
                      For conceptual searches (like &quot;something for a beach vacation&quot;), increase semantic weight.
                    </p>
                  </div>
                </>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground bg-muted/30 rounded-xl p-3 border border-border/50">
              <strong>Note:</strong> Weight and RRF settings only apply to Hybrid search mode.
              You&apos;ve selected {searchConfig.defaultSearchType === 'lexical' ? 'Lexical Only' : 'Semantic Only'} mode.
            </p>
          )}
        </CardContent>
      </Card>

      {/* CORS / Allowed Origins */}
      <Card className="border-border/60 rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Allowed Origins (CORS)
          </CardTitle>
          <CardDescription>
            Restrict which domains can access the API. Leave empty to allow all origins.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Existing origins */}
          {allowedOrigins.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {allowedOrigins.map((origin) => (
                <Badge
                  key={origin}
                  variant="outline"
                  className="font-mono text-xs flex items-center gap-1 py-1"
                >
                  {origin}
                  <button
                    type="button"
                    onClick={() => handleRemoveOrigin(origin)}
                    className="ml-1 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          {/* Add origin input */}
          <div className="flex gap-2">
            <Input
              value={newOrigin}
              onChange={(e) => setNewOrigin(e.target.value)}
              placeholder="https://example.com"
              className="flex-1 font-mono text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddOrigin();
                }
              }}
            />
            <Button
              variant="outline"
              onClick={handleAddOrigin}
              disabled={!newOrigin.trim()}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {allowedOrigins.length === 0 && (
            <p className="text-xs text-amber-600">
              ⚠️ No origins configured - API will accept requests from any domain
            </p>
          )}

          {errors['allowedOrigins'] && (
            <p className="text-sm text-destructive font-medium">{errors['allowedOrigins']}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
