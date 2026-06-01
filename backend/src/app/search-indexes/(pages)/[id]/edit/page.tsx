// app/search-indexes/(pages)/[id]/edit/page.tsx

'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
  Loader2,
  Save,
  AlertCircle,
  AlertTriangle,
  X,
  Plus,
  Settings,
  Languages,
  Database,
  Brain,
  Server,
  Sparkles,
  Lock,
  RefreshCw,
  Zap,
  Search,
  FileText,
  Braces,
  Gauge,
  Copy,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchIndex, searchIndexKeys } from '../../../_lib/hooks/useSearchIndexes';
import { searchIndexesApi } from '../../../_lib/api-client';
import { ChangeAIConfigDialog } from '../../../_components/ChangeAIConfigDialog';
import {
  updateSearchIndexSchema,
  INDEXING_STRATEGY_INFO,
  VECTOR_SIMILARITY_INFO,
  SEARCH_TYPE_INFO,
  ES_LANGUAGES,
  REFRESH_INTERVALS,
  FIELDS_REQUIRING_REINDEX,
  requiresAIConfiguration,
  type UpdateSearchIndexDTO,
  type IndexingStrategy,
  type VectorSimilarity,
  type SearchType,
} from '@/features/search-index';
import { getProviderUI } from '../../../_components/providers/provider-registry';
import '../../../_components/providers'; // ensure all providers are registered

// ============================================================================
// TYPES
// ============================================================================

type SearchTypeColors = {
  iconBg: string;
  ring: string;
  icon: string;
};

// ============================================================================
// HELPERS
// ============================================================================

function getSearchTypeColor(type: SearchType): SearchTypeColors {
  switch (type) {
    case 'lexical':
      return {
        iconBg: 'from-blue-500/20 via-blue-500/10 to-transparent',
        ring: 'ring-blue-500/30',
        icon: 'text-blue-500',
      };
    case 'semantic':
      return {
        iconBg: 'from-violet-500/20 via-violet-500/10 to-transparent',
        ring: 'ring-violet-500/30',
        icon: 'text-violet-500',
      };
    case 'hybrid':
      return {
        iconBg: 'from-amber-500/20 via-amber-500/10 to-transparent',
        ring: 'ring-amber-500/30',
        icon: 'text-amber-500',
      };
    default:
      return {
        iconBg: 'from-muted/50 via-muted/30 to-transparent',
        ring: 'ring-border/50',
        icon: 'text-muted-foreground',
      };
  }
}

function getSearchTypeIcon(type: SearchType, className: string = 'size-5') {
  switch (type) {
    case 'lexical':
      return <FileText className={className} />;
    case 'semantic':
      return <Brain className={className} />;
    case 'hybrid':
      return <Braces className={className} />;
    default:
      return <Search className={className} />;
  }
}

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
      <Skeleton className="h-10 w-80 rounded-xl" />

      {/* Content skeleton */}
      <div className="space-y-4">
        <Skeleton className="h-64 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    </div>
  );
}

// ============================================================================
// COPY BUTTON
// ============================================================================

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 w-8 p-0 rounded-lg hover:bg-muted"
      onClick={handleCopy}
      title={`Copy ${label}`}
    >
      {copied ? (
        <Check className="h-4 w-4 text-emerald-500" />
      ) : (
        <Copy className="h-4 w-4 text-muted-foreground" />
      )}
    </Button>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function EditSearchIndexPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const indexId = params.id as string;

  const [newSynonym, setNewSynonym] = useState('');
  const [newStopWord, setNewStopWord] = useState('');
  const [isChangeAIConfigOpen, setIsChangeAIConfigOpen] = useState(false);
  const [localProviderSettings, setLocalProviderSettings] = useState<Record<string, unknown>>({});
  const [isProviderSettingsDirty, setIsProviderSettingsDirty] = useState(false);

  const handleProviderSettingsChange = (settings: Record<string, unknown>) => {
    setLocalProviderSettings(settings);
    setIsProviderSettingsDirty(true);
  };

  // Fetch existing index
  const {
    searchIndex,
    isLoading,
    updateIndex,
    isUpdating,
  } = useSearchIndex(indexId);

  // Handler for changing AI config
  const handleChangeAIConfig = async (config: {
    aiProviderId: string;
    aiModelId: number;
    embeddingDimensions: number;
    vectorSimilarity?: 'cosine' | 'euclidean' | 'dot_product';
    confirmText: 'CONFIRM';
  }) => {
    const result = await searchIndexesApi.changeAIConfig(indexId, config);

    // Cancel any in-flight queries to prevent race conditions
    await queryClient.cancelQueries({ queryKey: searchIndexKeys.detail(indexId) });
    await queryClient.cancelQueries({ queryKey: searchIndexKeys.stats(indexId) });

    // Update the cache with the new data from the API response
    if (result.searchIndex) {
      queryClient.setQueryData(searchIndexKeys.detail(indexId), result.searchIndex);
    }

    // Force refetch stats since index was deleted and recreated
    await queryClient.refetchQueries({ queryKey: searchIndexKeys.stats(indexId) });

    // Invalidate lists since document count may appear there
    queryClient.invalidateQueries({ queryKey: searchIndexKeys.lists() });

    toast.success('AI configuration updated successfully');
    return result;
  };

  // Check if AI is enabled (for display purposes only)
  const isAIEnabled = searchIndex ? requiresAIConfiguration(searchIndex.searchType as SearchType) : false;

  // Form setup - only fields that are in updateSearchIndexSchema
  const form = useForm<UpdateSearchIndexDTO>({
    resolver: zodResolver(updateSearchIndexSchema),
    defaultValues: {
      displayName: '',
      description: '',
      indexingStrategy: 'on_upload',
      language: 'english',
      synonyms: [],
      stopWords: [],
      numberOfReplicas: 0,
      refreshInterval: '1s',
    },
  });

  const { register, watch, setValue, handleSubmit, reset, formState: { errors, isDirty, dirtyFields } } = form;

  // Watch fields that ARE in the schema
  const language = watch('language');
  const indexingStrategy = watch('indexingStrategy');
  const synonyms = watch('synonyms') || [];
  const stopWords = watch('stopWords') || [];

  // Check if any dirty fields require reindexing
  const requiresReindex = useMemo(() => {
    const dirtyFieldNames = Object.keys(dirtyFields);
    return dirtyFieldNames.some(field =>
      FIELDS_REQUIRING_REINDEX.includes(field as typeof FIELDS_REQUIRING_REINDEX[number])
    );
  }, [dirtyFields]);

  // Populate form when data loads
  useEffect(() => {
    if (searchIndex) {
      reset({
        displayName: searchIndex.displayName,
        description: searchIndex.description || '',
        indexingStrategy: (searchIndex.indexingStrategy as IndexingStrategy) || 'on_upload',
        language: searchIndex.language || 'english',
        synonyms: searchIndex.synonyms || [],
        stopWords: searchIndex.stopWords || [],
        numberOfReplicas: searchIndex.numberOfReplicas || 0,
        refreshInterval: searchIndex.refreshInterval || '1s',
      });
      // Populate local provider settings from saved data, falling back to deprecated fields
      setLocalProviderSettings({
        numberOfShards: searchIndex.numberOfShards,
        numberOfReplicas: searchIndex.numberOfReplicas,
        refreshInterval: searchIndex.refreshInterval,
        ...(searchIndex.providerSettings ?? {}),
      });
    }
  }, [searchIndex, reset]);

  // Synonym handlers
  const handleAddSynonym = () => {
    if (newSynonym.trim()) {
      const current = synonyms || [];
      setValue('synonyms', [...current, newSynonym.trim()], { shouldDirty: true });
      setNewSynonym('');
    }
  };

  const handleRemoveSynonym = (index: number) => {
    const current = synonyms || [];
    setValue('synonyms', current.filter((_, i) => i !== index), { shouldDirty: true });
  };

  // Stop word handlers
  const handleAddStopWord = () => {
    if (newStopWord.trim()) {
      const current = stopWords || [];
      const words = newStopWord.split(',').map(w => w.trim().toLowerCase()).filter(Boolean);
      setValue('stopWords', [...current, ...words], { shouldDirty: true });
      setNewStopWord('');
    }
  };

  const handleRemoveStopWord = (index: number) => {
    const current = stopWords || [];
    setValue('stopWords', current.filter((_, i) => i !== index), { shouldDirty: true });
  };

  // Form submit
  const onSubmit = async (data: UpdateSearchIndexDTO) => {
    try {
      const submitData: UpdateSearchIndexDTO = { ...data };
      // For non-Elasticsearch providers, pass providerSettings from local state
      if (searchIndex && searchIndex.searchProvider !== 'elasticsearch') {
        submitData.providerSettings = localProviderSettings;
      }
      await updateIndex(submitData);
      router.push(`/search-indexes/${indexId}`);
    } catch (error) {
      // Error handled by mutation
      console.error('Failed to update:', error);
    }
  };

  // Loading state
  if (isLoading) {
    return <EditSkeleton />;
  }

  // Not found state
  if (!searchIndex) {
    return (
      <div className="flex-1 p-6 lg:p-8">
        <div className="text-center py-16">
          <div className="flex size-20 items-center justify-center rounded-2xl bg-destructive/10 mx-auto mb-6">
            <AlertCircle className="size-10 text-destructive/70" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Search Index Not Found</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            The search index could not be found. It may have been deleted.
          </p>
          <Button variant="outline" className="mt-6 rounded-xl" onClick={() => router.push('/search-indexes')}>
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back to Search Indexes
          </Button>
        </div>
      </div>
    );
  }

  // Get display info for locked fields
  const searchTypeInfo = SEARCH_TYPE_INFO[searchIndex.searchType as SearchType];
  const similarityInfo = searchIndex.vectorSimilarity
    ? VECTOR_SIMILARITY_INFO[searchIndex.vectorSimilarity as VectorSimilarity]
    : null;
  const typeColors = getSearchTypeColor(searchIndex.searchType as SearchType);

  // Provider UI from registry
  const providerUI = getProviderUI(searchIndex.searchProvider);
  const providerLabel = providerUI?.label ?? searchIndex.searchProvider ?? 'Provider';
  const isElasticsearch = searchIndex.searchProvider === 'elasticsearch';

  const canSave = isDirty || isProviderSettingsDirty;

  return (
    <div className="flex-1 space-y-8 p-6 lg:p-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/search-indexes" className="hover:text-foreground transition-colors">
          Search Indexes
        </Link>
        <ChevronLeft className="h-4 w-4 rotate-180" />
        <Link href={`/search-indexes/${indexId}`} className="hover:text-foreground transition-colors">
          {searchIndex.displayName}
        </Link>
        <ChevronLeft className="h-4 w-4 rotate-180" />
        <span className="text-foreground font-medium">Edit</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="relative">
            <div className={`flex size-14 items-center justify-center rounded-xl shadow-sm bg-gradient-to-br ${typeColors.iconBg} ring-1 ${typeColors.ring}`}>
              <span className={typeColors.icon}>
                {getSearchTypeIcon(searchIndex.searchType as SearchType, 'size-7')}
              </span>
            </div>
            {searchIndex.isActive && searchIndex.status === 'ready' && (
              <div className="absolute -right-0.5 -bottom-0.5 flex items-center justify-center size-5 rounded-full bg-emerald-500 ring-2 ring-background">
                <Zap className="size-3 text-white fill-white" />
              </div>
            )}
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Edit Index</h1>
            <p className="text-base text-muted-foreground mt-1">Update configuration for {searchIndex.displayName}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="rounded-xl" onClick={() => router.push(`/search-indexes/${indexId}`)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit(onSubmit)}
            disabled={!canSave || isUpdating}
            variant={isDirty ? 'default' : 'outline'}
            className="rounded-xl"
          >
            {isUpdating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Reindex Warning Banner */}
      {requiresReindex && (
        <Card className="border-amber-300/50 bg-amber-50/50 dark:bg-amber-950/20 shadow-sm rounded-2xl">
          <CardContent className="p-4 flex items-start gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-amber-500/15 flex-shrink-0">
              <AlertTriangle className="size-5 text-amber-600" />
            </div>
            <div>
              <p className="font-semibold text-amber-800 dark:text-amber-200">Reindexing Required</p>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-0.5">
                You have modified text analysis settings (language, synonyms, or stop words).
                These changes will require a full reindex of all documents to take effect.
                You can trigger a reindex after saving from the index details page.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Form Tabs */}
      <form onSubmit={handleSubmit(onSubmit)}>
        <Tabs defaultValue="general" className="space-y-6">
          <TabsList className="h-auto p-1.5 bg-muted/40 backdrop-blur-sm border border-border/50 rounded-2xl gap-1 flex-wrap">
            <TabsTrigger
              value="general"
              className="rounded-xl px-4 py-2.5 text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:border-border/60 data-[state=inactive]:hover:bg-muted/60 gap-2"
            >
              <Database className="size-4" />
              <span>General</span>
            </TabsTrigger>
            <TabsTrigger
              value="text-analysis"
              className="rounded-xl px-4 py-2.5 text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:border-border/60 data-[state=inactive]:hover:bg-muted/60 gap-2"
            >
              <Languages className="size-4" />
              <span>Text Analysis</span>
              {requiresReindex && (
                <Badge variant="outline" className="ml-1 text-amber-600 border-amber-300 text-[10px] px-1.5 py-0 rounded-md">
                  modified
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="provider-settings"
              className="rounded-xl px-4 py-2.5 text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:border-border/60 data-[state=inactive]:hover:bg-muted/60 gap-2"
            >
              <Settings className="size-4" />
              <span>{providerLabel}</span>
            </TabsTrigger>
            {isAIEnabled && (
              <TabsTrigger
                value="ai"
                className="rounded-xl px-4 py-2.5 text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:border-border/60 data-[state=inactive]:hover:bg-muted/60 gap-2"
              >
                <Brain className="size-4" />
                <span>AI Config</span>
              </TabsTrigger>
            )}
          </TabsList>

          {/* General Tab */}
          <TabsContent value="general" className="space-y-6">
            <Card className="border-border/60 shadow-sm rounded-2xl">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Database className="h-4 w-4 text-blue-500" />
                  Basic Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Display Name */}
                <div className="space-y-2">
                  <Label htmlFor="displayName" className="text-sm font-medium">Display Name</Label>
                  <Input
                    id="displayName"
                    {...register('displayName')}
                    className={`rounded-lg ${errors.displayName ? 'border-destructive' : ''}`}
                  />
                  {errors.displayName && (
                    <p className="text-sm text-destructive">{errors.displayName.message}</p>
                  )}
                </div>

                {/* Index Name - Read-only */}
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-medium flex items-center gap-2">
                    Index Name
                    <Lock className="h-3 w-3 text-muted-foreground" />
                  </Label>
                  <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-xl font-mono text-sm border border-border/50">
                    <code className="flex-1 text-foreground/80 truncate">{searchIndex.name}</code>
                    <CopyButton text={searchIndex.name} label="Index name" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Index name cannot be changed after creation
                  </p>
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="description" className="text-sm font-medium">Description</Label>
                  <Textarea
                    id="description"
                    rows={3}
                    {...register('description')}
                    className="rounded-lg"
                  />
                </div>

                {/* Indexing Strategy */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 text-muted-foreground" />
                    Indexing Strategy
                  </Label>
                  <Select
                    value={indexingStrategy}
                    onValueChange={(value) => setValue('indexingStrategy', value as IndexingStrategy, { shouldDirty: true })}
                  >
                    <SelectTrigger className="rounded-lg">
                      <SelectValue>
                        {indexingStrategy && INDEXING_STRATEGY_INFO[indexingStrategy]?.label}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {Object.entries(INDEXING_STRATEGY_INFO).map(([value, info]) => (
                        <SelectItem key={value} value={value} className="rounded-lg py-2">
                          <div className="flex flex-col">
                            <span className="font-medium">{info.label}</span>
                            <span className="text-xs text-muted-foreground">{info.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Locked Settings Card */}
            <Card className="border-border/60 bg-muted/20 shadow-sm rounded-2xl">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-muted-foreground font-medium flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  Locked Settings
                </CardTitle>
                <CardDescription className="text-xs">
                  These settings cannot be changed after index creation
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="p-3 bg-background rounded-xl border border-border/50">
                    <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Search Type</label>
                    <div className="mt-2">
                      <Badge className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                        searchIndex.searchType === 'lexical' ? 'bg-blue-500/15 text-blue-700 dark:text-blue-400' :
                        searchIndex.searchType === 'semantic' ? 'bg-violet-500/15 text-violet-700 dark:text-violet-400' :
                        'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                      }`}>
                        {searchTypeInfo?.label || searchIndex.searchType}
                      </Badge>
                    </div>
                  </div>
                  <div className="p-3 bg-background rounded-xl border border-border/50">
                    <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Data Template</label>
                    <div className="mt-2">
                      <Badge variant="outline" className="rounded-lg px-2.5 py-1 text-xs font-medium">
                        {searchIndex.dataTemplate?.name || 'Unknown'}
                      </Badge>
                    </div>
                  </div>
                  <div className="p-3 bg-background rounded-xl border border-border/50">
                    <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Search Provider</label>
                    <div className="mt-2">
                      <Badge variant="outline" className="rounded-lg px-2.5 py-1 text-xs font-medium">
                        {providerLabel}
                      </Badge>
                    </div>
                  </div>
                  {isElasticsearch && (
                    <div className="p-3 bg-background rounded-xl border border-border/50">
                      <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Shards</label>
                      <p className="text-lg font-bold mt-1.5">
                        {searchIndex.numberOfShards || 1}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Text Analysis Tab */}
          <TabsContent value="text-analysis" className="space-y-6">
            {/* Warning banner */}
            <Card className="border-amber-300/30 bg-amber-50/30 dark:bg-amber-950/10 shadow-sm rounded-2xl">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/15 flex-shrink-0">
                  <AlertTriangle className="size-4 text-amber-600" />
                </div>
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Changes to text analysis settings require a full reindex of all documents to take effect.
                </p>
              </CardContent>
            </Card>

            <Card className="border-border/60 shadow-sm rounded-2xl">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 font-semibold">
                  <Languages className="h-4 w-4 text-blue-500" />
                  Language Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    Language
                    {dirtyFields.language && (
                      <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px] px-1.5 py-0 rounded-md">
                        modified
                      </Badge>
                    )}
                  </Label>
                  <Select
                    value={language}
                    onValueChange={(value) => setValue('language', value, { shouldDirty: true })}
                  >
                    <SelectTrigger className="rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl max-h-64">
                      {ES_LANGUAGES.map((lang) => (
                        <SelectItem key={lang.value} value={lang.value} className="rounded-lg">
                          {lang.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Determines stemming, stop words, and text analysis for this language
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60 shadow-sm rounded-2xl">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 font-semibold">
                  <Sparkles className="h-4 w-4 text-violet-500" />
                  Synonyms
                  {dirtyFields.synonyms && (
                    <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px] px-1.5 py-0 rounded-md">
                      modified
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  Define word equivalents for better search matching
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder='e.g., "laptop, notebook" or "usa => united states"'
                    value={newSynonym}
                    onChange={(e) => setNewSynonym(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddSynonym();
                      }
                    }}
                    className="rounded-lg"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAddSynonym}
                    disabled={!newSynonym.trim()}
                    className="rounded-lg"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {synonyms.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {synonyms.map((syn, i) => (
                      <Badge key={i} variant="secondary" className="pl-3 pr-1.5 py-1.5 rounded-lg bg-muted/50">
                        <span className="text-xs font-medium">{syn}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveSynonym(i)}
                          className="ml-2 hover:bg-destructive/20 rounded p-0.5 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                {synonyms.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4 bg-muted/30 rounded-xl">
                    No synonyms configured
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/60 shadow-sm rounded-2xl">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 font-semibold">
                  <X className="h-4 w-4 text-red-500" />
                  Custom Stop Words
                  {dirtyFields.stopWords && (
                    <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px] px-1.5 py-0 rounded-md">
                      modified
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  Words to ignore during search (comma-separated)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g., the, a, an"
                    value={newStopWord}
                    onChange={(e) => setNewStopWord(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddStopWord();
                      }
                    }}
                    className="rounded-lg"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAddStopWord}
                    disabled={!newStopWord.trim()}
                    className="rounded-lg"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {stopWords.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {stopWords.map((word, i) => (
                      <Badge key={i} variant="outline" className="pl-3 pr-1.5 py-1.5 rounded-lg">
                        <span className="text-xs font-medium">{word}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveStopWord(i)}
                          className="ml-2 hover:bg-destructive/20 rounded p-0.5 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                {stopWords.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4 bg-muted/30 rounded-xl">
                    No custom stop words configured
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Provider Settings Tab */}
          <TabsContent value="provider-settings" className="space-y-6">
            <Card className="border-border/60 shadow-sm rounded-2xl">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 font-semibold">
                  <Settings className="h-4 w-4 text-blue-500" />
                  {providerLabel} Settings
                </CardTitle>
                <CardDescription>
                  Provider-specific index configuration
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {isElasticsearch ? (
                  // Elasticsearch: keep form-bound controls for backward compat
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="numberOfReplicas" className="text-sm font-medium">Number of Replicas</Label>
                        <Input
                          id="numberOfReplicas"
                          type="number"
                          min={0}
                          max={10}
                          {...register('numberOfReplicas', { valueAsNumber: true })}
                          className="rounded-lg"
                        />
                        <p className="text-xs text-muted-foreground">
                          Can be changed anytime. Higher values improve availability.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="refreshInterval" className="text-sm font-medium">Refresh Interval</Label>
                        <Select
                          value={watch('refreshInterval') || '1s'}
                          onValueChange={(value) => setValue('refreshInterval', value, { shouldDirty: true })}
                        >
                          <SelectTrigger className="rounded-lg">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl">
                            {REFRESH_INTERVALS.map((interval) => (
                              <SelectItem key={interval.value} value={interval.value} className="rounded-lg">
                                {interval.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          How often changes become visible in search
                        </p>
                      </div>
                    </div>
                    <Card className="border-blue-300/30 bg-blue-50/30 dark:bg-blue-950/10 shadow-sm rounded-xl">
                      <CardContent className="p-4 flex items-center gap-3">
                        <div className="flex size-8 items-center justify-center rounded-lg bg-blue-500/15 shrink-0">
                          <AlertCircle className="size-4 text-blue-600" />
                        </div>
                        <p className="text-sm text-blue-700 dark:text-blue-300">
                          Number of shards ({searchIndex.numberOfShards || 1}) cannot be changed after index creation.
                        </p>
                      </CardContent>
                    </Card>
                  </>
                ) : providerUI?.SettingsForm ? (
                  // Other providers: use registry SettingsForm with local state
                  <providerUI.SettingsForm
                    value={localProviderSettings}
                    onChange={handleProviderSettingsChange}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No configurable settings for this provider.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* AI Tab */}
          {isAIEnabled && (
            <TabsContent value="ai" className="space-y-6">
              <Card className="border-border/60 shadow-sm rounded-2xl">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2 font-semibold">
                        <Brain className="h-4 w-4 text-violet-500" />
                        AI Configuration
                      </CardTitle>
                      <CardDescription>
                        Embedding provider and model settings
                      </CardDescription>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsChangeAIConfigOpen(true)}
                      className="rounded-lg"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Change Configuration
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Provider */}
                    <div className="p-4 bg-muted/30 rounded-xl border border-border/50">
                      <div className="flex items-center gap-2 mb-3">
                        <Server className="h-4 w-4 text-muted-foreground" />
                        <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">AI Provider</label>
                      </div>
                      <Badge className="bg-violet-500/15 text-violet-700 dark:text-violet-400 rounded-lg px-2.5 py-1">
                        <Sparkles className="h-3 w-3 mr-1.5" />
                        {searchIndex.aiProvider?.displayName || 'Not configured'}
                      </Badge>
                    </div>

                    {/* Model */}
                    <div className="p-4 bg-muted/30 rounded-xl border border-border/50">
                      <div className="flex items-center gap-2 mb-3">
                        <Brain className="h-4 w-4 text-muted-foreground" />
                        <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Embedding Model</label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="rounded-lg px-2.5 py-1">
                          {searchIndex.aiModel?.displayName || 'Not configured'}
                        </Badge>
                        {searchIndex.embeddingDimensions && (
                          <span className="text-xs text-muted-foreground">
                            {searchIndex.embeddingDimensions}d
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Vector Similarity */}
                    <div className="p-4 bg-muted/30 rounded-xl border border-border/50">
                      <div className="flex items-center gap-2 mb-3">
                        <Gauge className="h-4 w-4 text-muted-foreground" />
                        <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Vector Similarity</label>
                      </div>
                      <Badge variant="outline" className="rounded-lg px-2.5 py-1">
                        {similarityInfo?.label || searchIndex.vectorSimilarity || 'Cosine'}
                      </Badge>
                    </div>
                  </div>

                  {/* Warning card */}
                  <Card className="border-amber-300/50 bg-amber-50/50 dark:bg-amber-950/20 shadow-sm rounded-xl">
                    <CardContent className="p-4 flex items-start gap-3">
                      <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/15 flex-shrink-0">
                        <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div className="text-sm text-amber-700 dark:text-amber-300">
                        <p className="font-medium mb-1">Changing AI configuration is a destructive operation</p>
                        <p className="text-amber-600 dark:text-amber-400">
                          Switching to a different provider or model will delete all indexed documents
                          and require you to re-upload your data to generate new embeddings.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </CardContent>
              </Card>

              {/* Note: Hybrid RRF Settings have been moved to Search Experience level */}
              {/* Configure hybrid search tuning in your Search Experience settings */}
            </TabsContent>
          )}

          {/* Change AI Config Dialog */}
          {searchIndex && isAIEnabled && (
            <ChangeAIConfigDialog
              open={isChangeAIConfigOpen}
              onOpenChange={setIsChangeAIConfigOpen}
              searchIndexId={indexId}
              indexDisplayName={searchIndex.displayName}
              currentDocumentCount={searchIndex.documentCount || 0}
              currentProviderId={searchIndex.aiProviderId}
              currentModelId={searchIndex.aiModelId}
              currentDimensions={searchIndex.embeddingDimensions}
              currentVectorSimilarity={searchIndex.vectorSimilarity as 'cosine' | 'euclidean' | 'dot_product' | undefined}
              onChangeConfig={handleChangeAIConfig}
              onSuccess={() => setIsChangeAIConfigOpen(false)}
            />
          )}
        </Tabs>
      </form>
    </div>
  );
}
