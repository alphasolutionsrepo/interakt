'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChevronLeft,
  Edit2,
  Trash2,
  Compass,
  Database,
  Brain,
  Key,
  Copy,
  Check,
  RefreshCw,
  Layers,
  Clock,
  Power,
  PowerOff,
  Search,
  Shield,
  Zap,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useSearchExperience } from '../_lib/hooks';
import { CollapsibleCard } from '@/shared/ui/custom/CollapsibleCard';
import { DeleteConfirmDialog } from '@/shared/ui/custom/DeleteConfirmDialog';
import { PageHeader } from '@/shared/ui/custom/PageHeader';
import { SearchWidgetCard } from './SearchWidgetCard';
import {
  MULTI_INDEX_STRATEGY_INFO,
  RESULT_MERGE_STRATEGY_INFO,
  INDEX_ROLE_INFO,
  type MultiIndexStrategy,
  type ResultMergeStrategy,
  type IndexRole,
} from '@/features/search-experience/search-experience.client';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success(label ? `${label} copied` : 'Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 px-2">
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-600" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </Button>
  );
}

// ============================================================================
// SKELETON COMPONENT
// ============================================================================

function DetailSkeleton() {
  return (
    <div className="p-6 space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-9" />
        </div>
      </div>

      {/* Stats skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="border-slate-200">
            <CardContent className="pt-4 pb-4">
              <Skeleton className="h-16 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Content skeleton */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="border-slate-200">
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ============================================================================
// PROPS
// ============================================================================

interface SearchExperienceDetailProps {
  id: string;
  basePath?: string;
  listPath?: string;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function SearchExperienceDetail({ id, basePath = '/search-experiences', listPath }: SearchExperienceDetailProps) {
  const listHref = listPath ?? basePath;
  const router = useRouter();

  // State
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Data fetching
  const {
    experience,
    isLoading,
    isError,
    deleteExperience,
    isDeleting,
    updateExperience,
    isUpdating,
    regenerateToken,
    isRegeneratingToken,
  } = useSearchExperience(id);

  // Handle delete
  const handleDelete = async () => {
    await deleteExperience();
    router.push(listHref);
  };

  // Handle toggle active
  const handleToggleActive = async () => {
    if (!experience) return;
    await updateExperience({ isActive: !experience.isActive });
  };

  // Handle regenerate token
  const handleRegenerateToken = async () => {
    await regenerateToken();
    toast.success('New access token generated', {
      description: 'Make sure to update your client applications.',
    });
  };

  // Loading state
  if (isLoading) {
    return <DetailSkeleton />;
  }

  // Error state
  if (isError || !experience) {
    return (
      <div className="flex-1 p-6 lg:p-8">
        <div className="text-center py-16">
          <div className="flex size-20 items-center justify-center rounded-2xl bg-muted/50 mx-auto mb-6">
            <Compass className="size-10 text-muted-foreground/50" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Search experience not found</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            The search experience you&apos;re looking for doesn&apos;t exist or has been deleted.
          </p>
          <Button variant="outline" className="mt-6 rounded-xl" onClick={() => router.push(listHref)}>
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back to list
          </Button>
        </div>
      </div>
    );
  }

  const aiConfig = experience.aiConfig;
  const searchConfig = experience.searchConfig;

  return (
    <div className="flex-1 space-y-8 p-6 lg:p-8">
      {/* Header */}
      <PageHeader
        variant="detail"
        title={experience.name}
        description={experience.description}
        breadcrumb={
          <nav className="flex items-center gap-2">
            <Link href={listHref} className="hover:text-foreground transition-colors">
              Experiences
            </Link>
            <ChevronLeft className="h-4 w-4 rotate-180" />
            <span className="text-foreground font-medium">{experience.name}</span>
          </nav>
        }
        customIcon={
          <div className="relative">
            <div className={`flex size-12 items-center justify-center rounded-xl shadow-sm ${
              experience.isActive
                ? 'bg-gradient-to-br from-primary/20 via-primary/10 to-transparent ring-1 ring-primary/30'
                : 'bg-muted/50 ring-1 ring-border/50'
            }`}>
              <Compass className={`size-6 ${experience.isActive ? 'text-primary' : 'text-muted-foreground'}`} />
            </div>
            {experience.isActive && (
              <div className="absolute -right-0.5 -bottom-0.5 flex items-center justify-center size-5 rounded-full bg-emerald-500 ring-2 ring-background">
                <Zap className="size-3 text-white fill-white" />
              </div>
            )}
          </div>
        }
        actions={
          <>
            <Button
              variant={experience.isActive ? 'outline' : 'default'}
              className={`rounded-xl ${experience.isActive ? '' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}
              onClick={handleToggleActive}
              disabled={isUpdating}
            >
              {experience.isActive ? (
                <>
                  <PowerOff className="h-4 w-4 mr-2" />
                  Deactivate
                </>
              ) : (
                <>
                  <Power className="h-4 w-4 mr-2" />
                  Activate
                </>
              )}
            </Button>
            <Button variant="outline" className="rounded-xl" onClick={() => router.push(`${basePath}/${id}/edit`)}>
              <Edit2 className="h-4 w-4 mr-2" />
              Edit
            </Button>
          </>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card className="border-border/60 shadow-sm rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Indexes</p>
                <p className="text-3xl font-bold tracking-tight">{experience.indexes.length}</p>
              </div>
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 shadow-sm">
                <Layers className="size-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">AI Summary</p>
                <p className="text-3xl font-bold tracking-tight">
                  {aiConfig.summary.enabled ? 'On' : 'Off'}
                </p>
              </div>
              <div className={`flex size-12 shrink-0 items-center justify-center rounded-xl shadow-sm ${aiConfig.summary.enabled ? 'bg-violet-500/15' : 'bg-muted/50'}`}>
                <Brain className={`size-6 ${aiConfig.summary.enabled ? 'text-violet-500' : 'text-muted-foreground'}`} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Created</p>
                <p className="text-lg font-bold tracking-tight">
                  {format(new Date(experience.createdAt), 'MMM d, yyyy')}
                </p>
              </div>
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 shadow-sm">
                <Clock className="size-6 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Configuration — all collapsible, closed by default. */}
      <div className="grid md:grid-cols-2 gap-6">
        <CollapsibleCard
          icon={<Search className="h-4 w-4 text-blue-500" />}
          title="Search Configuration"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-muted/30 rounded-xl">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Page Size</p>
              <p className="text-sm font-semibold mt-1">
                {searchConfig.defaultPageSize} <span className="text-muted-foreground font-normal">(max {searchConfig.maxPageSize})</span>
              </p>
            </div>
            <div className="p-3 bg-muted/30 rounded-xl">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Highlighting</p>
              <p className="text-sm font-semibold mt-1">
                {searchConfig.enableHighlighting ? 'Enabled' : 'Disabled'}
              </p>
            </div>
            <div className="p-3 bg-muted/30 rounded-xl">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Multi-Index</p>
              <p className="text-sm font-semibold mt-1">
                {MULTI_INDEX_STRATEGY_INFO[searchConfig.multiIndexStrategy as MultiIndexStrategy]?.label}
              </p>
            </div>
            <div className="p-3 bg-muted/30 rounded-xl">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Merge Strategy</p>
              <p className="text-sm font-semibold mt-1">
                {RESULT_MERGE_STRATEGY_INFO[searchConfig.resultMergeStrategy as ResultMergeStrategy]?.label}
              </p>
            </div>
          </div>
        </CollapsibleCard>

        <CollapsibleCard
          icon={<Brain className="h-4 w-4 text-violet-500" />}
          title="AI Configuration"
        >
          {!aiConfig.enabled ? (
            <p className="text-sm text-muted-foreground">AI features are disabled</p>
          ) : (
            <div className="space-y-3">
              <div className="p-3 bg-muted/30 rounded-xl">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Summary</p>
                <p className="text-sm font-semibold mt-1">
                  {aiConfig.summary.enabled
                    ? `Up to ${aiConfig.summary.maxResultsForContext} results, ${aiConfig.summary.maxTokens ?? 500} tokens`
                    : 'Disabled'}
                </p>
              </div>
            </div>
          )}
        </CollapsibleCard>
      </div>

      <CollapsibleCard
        icon={<Database className="h-4 w-4 text-emerald-500" />}
        title="Connected Indexes"
        description="Search indexes linked to this experience."
        headerExtras={
          <Badge variant="outline" className="rounded-lg text-xs font-mono shrink-0">
            {experience.indexes.length}
          </Badge>
        }
      >
        {experience.indexes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No indexes connected</p>
        ) : (
          <div className="space-y-3">
            {experience.indexes.map((idx) => (
              <div
                key={idx.id}
                className="flex items-center justify-between p-4 bg-muted/30 rounded-xl border border-border/50"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-background border border-border/50 shadow-sm">
                    <Database className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium">{idx.searchIndex.displayName}</p>
                    <p className="text-xs text-muted-foreground font-mono">{idx.searchIndex.name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                      idx.role === 'primary'
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {INDEX_ROLE_INFO[idx.role as IndexRole]?.label}
                  </Badge>
                  {idx.weight !== 1 && (
                    <span className="text-xs text-muted-foreground font-medium">x{idx.weight}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CollapsibleCard>

      {experience.allowedOrigins && experience.allowedOrigins.length > 0 && (
        <CollapsibleCard
          icon={<Shield className="h-4 w-4 text-cyan-500" />}
          title="Allowed Origins (CORS)"
        >
          <div className="flex flex-wrap gap-2">
            {experience.allowedOrigins.map((origin, i) => (
              <Badge key={i} variant="outline" className="font-mono text-xs rounded-lg px-2.5 py-1 bg-muted/30">
                {origin}
              </Badge>
            ))}
          </div>
        </CollapsibleCard>
      )}

      {/* ──────────────────────────────────────────────────────────────────
          Distribution — how to actually use this search experience. Access
          token + drop-in widget configurator sit at the bottom so
          configuration reads top-down: what it does → how it's reached.
          ────────────────────────────────────────────────────────────────── */}
      <div className="pt-4 space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border/60" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Distribution
          </span>
          <div className="h-px flex-1 bg-border/60" />
        </div>

        {/* Access Token — keep as a full card here since it has the Regenerate action */}
        <CollapsibleCard
          icon={<Key className="h-4 w-4 text-amber-500" />}
          title="Access Token"
          description={<>Use this token in the <code className="text-xs bg-muted px-1.5 py-0.5 rounded-md font-mono">X-Access-Token</code> header.</>}
          headerExtras={
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={handleRegenerateToken}
              disabled={isRegeneratingToken}
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-2 ${isRegeneratingToken ? 'animate-spin' : ''}`} />
              Regenerate
            </Button>
          }
        >
          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-xl font-mono text-sm border border-border/50">
            <code className="flex-1 text-foreground/80 truncate">{experience.accessToken}</code>
            <CopyButton text={experience.accessToken} label="Access token" />
          </div>
        </CollapsibleCard>

        {/* Search Widget — UI-only drop-in configurator */}
        <SearchWidgetCard
          accessToken={experience.accessToken}
          defaultContainerId="interakt-search"
        />
      </div>

      {/* Danger Zone */}
      <CollapsibleCard
        className="border-destructive/30"
        icon={<Trash2 className="h-4 w-4 text-destructive" />}
        title={<span className="text-destructive">Danger Zone</span>}
        description="Irreversible actions that permanently affect this search experience."
      >
        <div className="flex items-center justify-between p-4 bg-destructive/5 rounded-xl border border-destructive/20">
          <div>
            <p className="font-medium text-sm">Delete this search experience</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              This will permanently delete the experience.
            </p>
          </div>
          <Button
            variant="destructive"
            className="rounded-xl"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      </CollapsibleCard>

      {/* Delete Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        itemName={experience.name}
        title="Delete Search Experience"
        description="This will permanently delete the search experience. This action cannot be undone."
        onConfirm={handleDelete}
        isLoading={isDeleting}
      />
    </div>
  );
}
