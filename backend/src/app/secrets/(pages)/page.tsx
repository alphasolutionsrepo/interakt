'use client';

import { useState } from 'react';
import { KeyRound, Plus, RefreshCw, Search, ShieldCheck, Clock } from 'lucide-react';
import { PageHeader } from '@/shared/ui/custom/PageHeader';
import { DeleteConfirmDialog } from '@/shared/ui/custom/DeleteConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SecretTable } from '../_components/SecretTable';
import { SecretFormDialog } from '../_components/SecretFormDialog';
import { useSecrets } from '../_lib/hooks/useSecrets';
import type { SecretMetadata } from '../_lib/api-client';

// ============================================================================
// METRIC CARD
// ============================================================================

function MetricCard({
  label,
  value,
  icon,
  iconBg,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  iconBg: string;
}) {
  return (
    <div className="relative rounded-2xl border border-border/60 bg-card shadow-sm">
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2 min-w-0">
            <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
              {label}
            </p>
            <p className="text-3xl font-bold tracking-tight">{value}</p>
          </div>
          <div
            className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${iconBg}`}
          >
            {icon}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// PAGE
// ============================================================================

export default function SecretsPage() {
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingSecret, setEditingSecret] = useState<SecretMetadata | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingSecret, setDeletingSecret] = useState<SecretMetadata | null>(null);

  const { secrets, isLoading, isRefetching, isDeleting, isCreating, isUpdating, createSecret, updateSecret, deleteSecret, refetch } =
    useSecrets(search || undefined);

  function handleCreate() {
    setEditingSecret(null);
    setFormOpen(true);
  }

  function handleEdit(secret: SecretMetadata) {
    setEditingSecret(secret);
    setFormOpen(true);
  }

  function handleDeleteRequest(secret: SecretMetadata) {
    setDeletingSecret(secret);
    setDeleteDialogOpen(true);
  }

  async function handleFormSubmit(data: { name: string; value: string; description?: string }) {
    if (editingSecret) {
      await updateSecret({
        id: editingSecret.id,
        data: {
          value: data.value || undefined,
          description: data.description,
        },
      });
    } else {
      await createSecret(data);
    }
    setFormOpen(false);
  }

  async function handleDelete() {
    if (!deletingSecret) return;
    await deleteSecret(deletingSecret.id);
    setDeleteDialogOpen(false);
    setDeletingSecret(null);
  }

  // Last updated across all secrets
  const lastUpdated =
    secrets.length > 0
      ? new Date(
          Math.max(...secrets.map((s) => new Date(s.updatedAt).getTime()))
        ).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : '—';

  return (
    <div className="flex-1 space-y-8 p-6 lg:p-8">
      {/* Header */}
      <PageHeader
        variant="hero"
        title="Secrets Vault"
        description="Manage encrypted secrets referenced in tool configurations via {{secret:name}} syntax."
        icon={KeyRound}
        iconBg="bg-amber-500/10"
        iconColor="text-amber-500"
        actions={
          <Button onClick={handleCreate} className="rounded-xl gap-2">
            <Plus className="size-4" />
            New Secret
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2">
        <MetricCard
          label="Total Secrets"
          value={isLoading ? '—' : secrets.length}
          icon={<ShieldCheck className="size-5 text-amber-500" />}
          iconBg="bg-amber-500/10"
        />
        <MetricCard
          label="Last Updated"
          value={isLoading ? '—' : lastUpdated}
          icon={<Clock className="size-5 text-blue-500" />}
          iconBg="bg-blue-500/10"
        />
      </div>

      {/* Toolbar */}
      <Card className="border-border/60 shadow-sm rounded-2xl">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search secrets by name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 rounded-xl"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              className="rounded-xl shrink-0"
              onClick={() => refetch()}
              disabled={isRefetching}
            >
              <RefreshCw className={`size-4 ${isRefetching ? 'animate-spin' : ''}`} />
            </Button>
            {secrets.length > 0 && (
              <Badge className="bg-muted text-muted-foreground border-0 text-xs font-medium rounded-lg px-2.5">
                {secrets.length} secret{secrets.length !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <SecretTable
        secrets={secrets}
        onEdit={handleEdit}
        onDelete={handleDeleteRequest}
      />

      {/* Dialogs */}
      <SecretFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        secret={editingSecret}
        onSubmit={handleFormSubmit}
        isLoading={isCreating || isUpdating}
      />
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Secret"
        itemName={deletingSecret?.name}
        description={`Permanently delete the secret "${deletingSecret?.name}". Any tool configs referencing {{secret:${deletingSecret?.name ?? ''}}} will stop working.`}
        onConfirm={handleDelete}
        isLoading={isDeleting}
      />
    </div>
  );
}
