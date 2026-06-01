// app/ai-providers/page.tsx

'use client';

import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Plus,
  RefreshCw,
  Settings2,
  Search,
  Shield,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  useAIProviders,
  useCreateProvider,
  useSystemDefaults,
} from './_lib/hooks/useAIProviders';
import { aiProvidersApi } from './_lib/api-client';
import {
  ProviderFormDialog,
  SystemDefaultsCard,
  ManageModelsDialog,
  ProviderStatsBar,
  ProviderTable,
} from './_components';
import { DeleteConfirmDialog } from '@/shared/ui/custom/DeleteConfirmDialog';
import { PageHeader } from '@/shared/ui/custom/PageHeader';
import type { AIProviderWithModelsResponse, CreateAIProviderInput, UpdateAIProviderInput } from '@/features/ai-providers';

// ============================================================================
// Page Skeleton
// ============================================================================

function AIProvidersPageSkeleton() {
  return (
    <div className="flex-1 space-y-8 p-6 lg:p-8">
      {/* Header Skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-5 w-96" />
      </div>

      {/* Stats Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="rounded-2xl border border-border/60 p-6">
            <Skeleton className="h-12 w-12 rounded-xl mb-4" />
            <Skeleton className="h-8 w-16 mb-2" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>

      {/* Table Skeleton */}
      <div className="space-y-4">
        <div className="flex gap-4">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="rounded-2xl border border-border/60 p-6 space-y-4">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function AIProvidersPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [formDialog, setFormDialog] = useState<{
    open: boolean;
    mode: 'create' | 'edit';
    provider?: AIProviderWithModelsResponse;
  }>({ open: false, mode: 'create' });
  const [manageModelsDialog, setManageModelsDialog] = useState<{
    open: boolean;
    provider?: AIProviderWithModelsResponse;
  }>({ open: false });
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    provider?: AIProviderWithModelsResponse;
  }>({ open: false });

  // Data hooks
  const {
    providers,
    isLoading: providersLoading,
    refetch: refetchProviders,
    enableProvider,
    disableProvider,
    deleteProvider,
    isEnabling,
    isDisabling,
  } = useAIProviders();

  const createProvider = useCreateProvider();

  const {
    defaults,
    isLoading: defaultsLoading,
    setDefaultForPurpose,
    isUpdating: isUpdatingDefaults,
  } = useSystemDefaults();

  // Testing/discovering state
  const [testingId, setTestingId] = useState<string | null>(null);
  const [discoveringId, setDiscoveringId] = useState<string | null>(null);

  // Sync manageModelsDialog.provider with latest providers data
  // This ensures the dialog shows updated data after model changes
  useEffect(() => {
    if (manageModelsDialog.open && manageModelsDialog.provider && providers.length > 0) {
      const updatedProvider = providers.find(p => p.id === manageModelsDialog.provider?.id);
      if (updatedProvider && updatedProvider !== manageModelsDialog.provider) {
        setManageModelsDialog(prev => ({ ...prev, provider: updatedProvider }));
      }
    }
  }, [providers, manageModelsDialog.open, manageModelsDialog.provider]);

  // Filter providers
  const filteredProviders = useMemo(() => {
    if (!providers) return [];

    return providers.filter(provider => {
      // Search filter
      const matchesSearch = searchQuery === '' ||
        provider.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        provider.providerKey.toLowerCase().includes(searchQuery.toLowerCase());

      // Type filter
      const matchesType = typeFilter === 'all' || provider.providerType === typeFilter;

      // Status filter
      const matchesStatus = statusFilter === 'all' ||
        (statusFilter === 'enabled' && provider.isEnabled) ||
        (statusFilter === 'disabled' && !provider.isEnabled);

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [providers, searchQuery, typeFilter, statusFilter]);

  // Handlers
  const handleToggleEnabled = async (provider: AIProviderWithModelsResponse) => {
    if (provider.isEnabled) {
      await disableProvider(provider.id);
    } else {
      await enableProvider(provider.id);
    }
  };

  const handleTestConnection = async (provider: AIProviderWithModelsResponse) => {
    setTestingId(provider.id);
    try {
      const result = await aiProvidersApi.testConnection(provider.id);
      if (result.success) {
        toast.success(`Connected in ${result.responseTimeMs}ms`);
      } else {
        toast.error(result.message || 'Connection failed');
      }
      refetchProviders();
    } catch (error) {
      toast.error('Connection test failed');
    } finally {
      setTestingId(null);
    }
  };

  const handleDiscoverModels = async (provider: AIProviderWithModelsResponse) => {
    setDiscoveringId(provider.id);
    try {
      const result = await aiProvidersApi.discoverModels(provider.id);
      if (result.success) {
        toast.success(`Found ${result.modelsFound} models (${result.modelsAdded} new)`);
      } else {
        toast.warning(`Completed with ${result.errors.length} errors`);
      }
      refetchProviders();
    } catch (error) {
      toast.error('Model discovery failed');
    } finally {
      setDiscoveringId(null);
    }
  };

  const handleEditProvider = (provider: AIProviderWithModelsResponse) => {
    setFormDialog({ open: true, mode: 'edit', provider });
  };

  const handleCreateProvider = () => {
    setFormDialog({ open: true, mode: 'create', provider: undefined });
  };

  const handleManageModels = (provider: AIProviderWithModelsResponse) => {
    setManageModelsDialog({ open: true, provider });
  };

  const handleFormSubmit = async (data: CreateAIProviderInput | UpdateAIProviderInput) => {
    if (formDialog.mode === 'create') {
      await createProvider.mutateAsync(data as CreateAIProviderInput);
    } else if (formDialog.provider) {
      await aiProvidersApi.update(formDialog.provider.id, data as UpdateAIProviderInput);
      toast.success('Provider updated');
      refetchProviders();
    }
    setFormDialog({ open: false, mode: 'create' });
  };

  const handleDeleteProvider = (provider: AIProviderWithModelsResponse) => {
    setDeleteDialog({ open: true, provider });
  };

  const handleConfirmDelete = async () => {
    if (deleteDialog.provider) {
      await deleteProvider(deleteDialog.provider.id);
      setDeleteDialog({ open: false });
    }
  };

  const handleSaveDefault = async (
    purpose: 'text' | 'embedding' | 'chat',
    providerId: string | null,
    modelId: number | null
  ) => {
    await setDefaultForPurpose({ purpose, providerId, modelId });
  };

  // Loading state
  if (providersLoading) {
    return <AIProvidersPageSkeleton />;
  }

  // Error state
  if (!providers) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-destructive/15">
          <RefreshCw className="size-8 text-destructive" />
        </div>
        <h2 className="text-xl font-semibold">Failed to load providers</h2>
        <p className="max-w-md text-center text-muted-foreground">
          An error occurred while loading AI providers
        </p>
        <Button onClick={() => refetchProviders()} className="rounded-xl">
          <RefreshCw className="mr-2 size-4" />
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-8 p-6 lg:p-8">
      {/* Header */}
      <PageHeader
        variant="settings"
        title="AI Providers"
        description="Manage provider connections and configure default models"
        icon={Shield}
        iconBg="bg-primary/10"
        iconColor="text-primary"
        breadcrumb={
          <>
            <Settings2 className="size-4" />
            <span className="font-medium">Settings</span>
          </>
        }
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => refetchProviders()}
              className="rounded-xl"
            >
              <RefreshCw className="mr-2 size-4" />
              Refresh
            </Button>
            <Button
              onClick={handleCreateProvider}
              className="rounded-xl shadow-lg"
            >
              <Plus className="mr-2 size-4" />
              Add Provider
            </Button>
          </>
        }
      />

      {/* Stats */}
      <ProviderStatsBar providers={providers} />

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Providers Section */}
        <div className="lg:col-span-2 space-y-6">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search providers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-12 rounded-xl border-border/60"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-40 h-12 rounded-xl border-border/60">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="cloud">Cloud</SelectItem>
                <SelectItem value="local">Local</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40 h-12 rounded-xl border-border/60">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="enabled">Enabled</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Providers Table */}
          <ProviderTable
            providers={filteredProviders}
            onEdit={handleEditProvider}
            onDelete={handleDeleteProvider}
            onManageModels={handleManageModels}
            onTestConnection={handleTestConnection}
            onDiscoverModels={handleDiscoverModels}
            onToggleEnabled={handleToggleEnabled}
            isEnabling={isEnabling}
            isDisabling={isDisabling}
            isTesting={!!testingId}
          />
        </div>

        {/* System Defaults Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Shield className="size-4" />
            <span className="font-medium">System Configuration</span>
          </div>
          <SystemDefaultsCard
            defaults={defaults}
            providers={providers}
            onSave={handleSaveDefault}
            isLoading={defaultsLoading}
            isSaving={isUpdatingDefaults}
          />
        </div>
      </div>

      {/* Provider Form Dialog */}
      <ProviderFormDialog
        open={formDialog.open}
        onOpenChange={(open) => setFormDialog(prev => ({ ...prev, open }))}
        provider={formDialog.provider}
        mode={formDialog.mode}
        onSubmit={handleFormSubmit}
        isSubmitting={createProvider.isPending}
      />

      {/* Manage Models Dialog */}
      {manageModelsDialog.provider && (
        <ManageModelsDialog
          open={manageModelsDialog.open}
          onOpenChange={(open) => setManageModelsDialog(prev => ({ ...prev, open }))}
          provider={manageModelsDialog.provider}
          onModelsChanged={refetchProviders}
          onDiscoverModels={
            manageModelsDialog.provider.providerKey === 'ollama'
              ? () => handleDiscoverModels(manageModelsDialog.provider!)
              : undefined
          }
          isDiscovering={discoveringId === manageModelsDialog.provider.id}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog(prev => ({ ...prev, open }))}
        itemName={deleteDialog.provider?.displayName}
        title="Delete Provider"
        description={
          deleteDialog.provider
            ? `This will permanently delete "${deleteDialog.provider.displayName}" and all ${deleteDialog.provider.models?.length || 0} associated models. This action cannot be undone.`
            : undefined
        }
        onConfirm={handleConfirmDelete}
        confirmText="Delete Provider"
      />
    </div>
  );
}
