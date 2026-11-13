// app/users/_components/RolesPanel.tsx

'use client';

import { Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { useRoles } from '../_lib/hooks/useRoles';
import { permissionCount } from '../_lib/permission-view';
import type { RoleResponse } from '../_lib/roles-api';

import { AccessOverview } from './AccessOverview';
import { RoleFormDialog } from './RoleFormDialog';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ActionButton, useAdminGate } from '@/shared/access/ActionControls';
import { DeleteConfirmDialog } from '@/shared/ui/custom/DeleteConfirmDialog';
import { ProblemAlert } from '@/shared/ui/custom/ProblemAlert';



/**
 * The Roles tab: every role, how many users hold it, and the Access overview. Only an Admin
 * creates, edits and deletes roles (the server refuses everyone else); other user managers
 * see the same screen with those controls locked.
 */
export function RolesPanel() {
  const gate = useAdminGate('add, change or delete roles');
  const isAdmin = gate.state === 'allowed';
  const { roles, isLoading, error, retry, createRoleAsync, updateRoleAsync, setRolePermissions, isSwitching, deleteRole, isSaving, isDeleting } = useRoles();
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
          A role is a set of permissions. Admin is built in and holds every permission. User managers can give
          only roles whose permissions are all in their own.
        </p>
        <ActionButton gate={gate} icon={Plus} onClick={() => setCreating(true)} className="rounded-xl shrink-0">
          Add Role
        </ActionButton>
      </div>

      <div className="rounded-2xl border border-border/60 divide-y divide-border/60">
        {roles.map((role) => (
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
              {permissionCount(role).held} of {permissionCount(role).total} permissions
            </span>
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              {role.userCount} {role.userCount === 1 ? 'user' : 'users'}
            </span>
            {!role.isBuiltIn && (
              <div className="flex gap-1">
                <ActionButton gate={gate} icon={Pencil} iconClassName="size-4" variant="ghost" size="icon" onClick={() => setEditing(role)} aria-label={`Edit ${role.name}`} />
                <ActionButton
                  gate={gate}
                  icon={Trash2}
                  iconClassName="size-4"
                  variant="ghost"
                  size="icon"
                  disabled={role.userCount > 0}
                  title={role.userCount > 0 ? 'Give its users another role first' : undefined}
                  onClick={() => setToDelete(role)}
                  aria-label={`Delete ${role.name}`}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <AccessOverview
        roles={roles}
        editable={isAdmin}
        saving={isSwitching}
        onChange={(role, permissions) => setRolePermissions({ id: role.id, permissions })}
      />

      <RoleFormDialog
        open={creating || !!editing}
        role={editing ?? undefined}
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
