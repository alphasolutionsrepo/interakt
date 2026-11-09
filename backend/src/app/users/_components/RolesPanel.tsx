// app/users/_components/RolesPanel.tsx

'use client';

import { Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { useRoles } from '../_lib/hooks/useRoles';
import type { RoleResponse } from '../_lib/roles-api';

import { RoleFormDialog } from './RoleFormDialog';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PERMISSION_GROUPS } from '@/features/access/permissions';
import { DeleteConfirmDialog } from '@/shared/ui/custom/DeleteConfirmDialog';
import { ProblemAlert } from '@/shared/ui/custom/ProblemAlert';



const PERMISSION_COUNT = PERMISSION_GROUPS.reduce((n, g) => n + g.permissions.length, 0);

/** The Roles tab: every role, how many users hold it, and create / edit / delete. */
export function RolesPanel({ canHold }: { canHold: (role: Pick<RoleResponse, 'isBuiltIn' | 'permissions'>) => boolean }) {
  const { roles, isLoading, error, retry, createRoleAsync, updateRoleAsync, deleteRole, isSaving, isDeleting } = useRoles();
  const [editing, setEditing] = useState<RoleResponse | null>(null);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<RoleResponse | null>(null);

  if (isLoading) return null;
  if (error) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-2xl border border-border/60 p-6">
        <ProblemAlert error={error} title="Couldn't load the roles" />
        <Button variant="outline" onClick={retry} className="rounded-xl">Try again</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          A role is a set of permissions. Admin is built in and holds every permission. You can give a role
          only permissions your own role has.
        </p>
        <Button onClick={() => setCreating(true)} className="rounded-xl shrink-0">
          <Plus className="mr-2 size-4" />
          Add Role
        </Button>
      </div>

      <div className="rounded-2xl border border-border/60 divide-y divide-border/60">
        {roles.map((role) => {
          const editable = !role.isBuiltIn && canHold(role);
          return (
            <div key={role.id} className="flex items-center gap-4 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{role.name}</span>
                  {role.isBuiltIn && (
                    <Badge variant="secondary" className="gap-1">
                      <Lock className="size-3" /> Built in
                    </Badge>
                  )}
                </div>
                {role.description && <p className="text-sm text-muted-foreground">{role.description}</p>}
              </div>
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                {role.isBuiltIn ? PERMISSION_COUNT : role.permissions.length} of {PERMISSION_COUNT} permissions
              </span>
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                {role.userCount} {role.userCount === 1 ? 'user' : 'users'}
              </span>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" disabled={!editable} onClick={() => setEditing(role)} aria-label={`Edit ${role.name}`}>
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={!editable || role.userCount > 0}
                  title={role.userCount > 0 ? 'Give its users another role first' : undefined}
                  onClick={() => setToDelete(role)}
                  aria-label={`Delete ${role.name}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <RoleFormDialog
        open={creating || !!editing}
        role={editing ?? undefined}
        canHoldPermission={(p) => canHold({ isBuiltIn: false, permissions: [p] })}
        isSubmitting={isSaving}
        onOpenChange={(open) => { if (!open) { setCreating(false); setEditing(null); } }}
        onSubmit={async (data) => {
          if (editing) await updateRoleAsync({ id: editing.id, data });
          else await createRoleAsync(data);
          setCreating(false);
          setEditing(null);
        }}
      />

      <DeleteConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        onConfirm={() => toDelete && deleteRole(toDelete.id, { onSuccess: () => setToDelete(null) })}
        title="Delete role"
        description={toDelete ? `Delete the role "${toDelete.name}"?` : ''}
        confirmText="Delete"
        isLoading={isDeleting}
      />
    </div>
  );
}
