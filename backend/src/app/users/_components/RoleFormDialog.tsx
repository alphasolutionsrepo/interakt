// app/users/_components/RoleFormDialog.tsx

'use client';

import { useEffect, useState } from 'react';

import { rolePermissionsToSave, unmetNeeds, viewGroups } from '../_lib/permission-view';
import type { RoleResponse } from '../_lib/roles-api';

import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { effectivePermissions, PERMISSION_GROUPS, type Permission } from '@/features/access/permissions';
import type { CreateRoleInput } from '@/features/access/roles.validations';
import type { Area } from '@/features/feature-switches/areas';
import { AreaOffNote, areaLabel, rolesKeepDetail } from '@/shared/access/AreaOffNote';
import { useAccess } from '@/shared/access/useAccess';
import { useInlineError } from '@/shared/activity/useInlineError';
import { DialogFormFooter } from '@/shared/ui/custom/DialogFormFooter';


interface RoleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role?: RoleResponse;
  /** Rejects when the save fails; the dialog then shows why */
  onSubmit: (data: CreateRoleInput) => Promise<void>;
  isSubmitting?: boolean;
}

export function RoleFormDialog({ open, onOpenChange, role, onSubmit, isSubmitting }: RoleFormDialogProps) {
  const inline = useInlineError();
  const clearInlineError = inline.clear;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [permissions, setPermissions] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    clearInlineError();
    setName(role?.name ?? '');
    setDescription(role?.description ?? '');
    setPermissions(new Set(role?.permissions ?? []));
  }, [open, role, clearInlineError]);

  const toggle = (p: string, on: boolean) =>
    setPermissions((prev) => {
      const next = new Set(prev);
      if (on) next.add(p);
      else next.delete(p);
      return next;
    });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    inline.clear();
    try {
      await onSubmit({ name: name.trim(), description: description.trim() || null, permissions: rolePermissionsToSave(permissions) });
    } catch (err) {
      inline.capture(role ? 'Save role' : 'Create role', err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">{role ? `Edit ${role.name}` : 'New role'}</DialogTitle>
          <DialogDescription>Choose what users with this role can see and do.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="role-name">Name *</Label>
            <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={64} required className="h-11 rounded-lg" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role-description">Description</Label>
            <Textarea id="role-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={2} />
          </div>
          <RolePermissionFields permissions={permissions} onToggle={toggle} />
          <DialogFormFooter inline={inline} onCancel={() => onOpenChange(false)} submitLabel={role ? 'Save role' : 'Create role'} isSubmitting={isSubmitting} submitDisabled={!name.trim()} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Why a ticked permission grants nothing yet: "needs 2 more permissions to take effect", and
 * the ones in a turned-off area apart. With nothing left to tick there is no count of "more":
 * "needs 3 permissions in Chat to take effect, turned off for this installation".
 */
export function unmetNote(needs: { tickable: readonly unknown[]; blocked: readonly unknown[]; blockedAreas: readonly Area[] }, label: (area: Area) => string): string {
  const plural = (n: number) => (n === 1 ? 'permission' : 'permissions');
  const t = needs.tickable.length;
  const b = needs.blocked.length;
  const areas = needs.blockedAreas.map(label).join(' and ');
  if (b === 0) return `needs ${t} more ${plural(t)} to take effect`;
  if (t === 0) return `needs ${b} ${plural(b)} in ${areas} to take effect, turned off for this installation`;
  return `needs ${t} more ${plural(t)} to take effect, and ${b} in ${areas}, turned off for this installation`;
}

/**
 * The permission checkboxes. A permission whose feature area is off stays listed and keeps its
 * ticked state, but can't be changed; its group says why. Saving sends every ticked permission
 * as it is, so nothing of an off area is dropped or added.
 */
export function RolePermissionFields({ permissions, onToggle }: { permissions: ReadonlySet<string>; onToggle: (permission: string, on: boolean) => void }) {
  const { areaOn } = useAccess();
  // What the ticked permissions actually grant: implied ones added, unmet ones left out
  const effective = new Set<string>(effectivePermissions([...permissions] as Permission[]));
  return (
    <div className="space-y-4">
      {viewGroups(PERMISSION_GROUPS, areaOn, permissions).map((group) => (
        <fieldset key={group.id} className="space-y-2">
          <legend className="text-sm font-semibold">{group.label}</legend>
          {group.offNotes.map((areas) => (
            <AreaOffNote key={areas.join(',')} areas={areas} detail={rolesKeepDetail(areas)} />
          ))}
          {group.rows.map((p) => {
            const ticked = p.held;
            const included = !ticked && effective.has(p.id);
            const unmet = ticked && !effective.has(p.id);
            const needs = unmet ? unmetNeeds([...permissions], p.id, areaOn) : null;
            return (
              <label key={p.id} className={`flex items-center gap-2 text-sm ${p.disabled ? 'text-muted-foreground' : ''}`}>
                <Checkbox
                  checked={ticked || included}
                  disabled={included || p.disabled}
                  onCheckedChange={(v) => onToggle(p.id, v === true)}
                />
                <span>
                  {p.label}
                  {included && <span className="text-muted-foreground"> (included by another permission)</span>}
                  {needs && (
                    <span className="text-destructive">
                      {' '}({unmetNote(needs, areaLabel)})
                    </span>
                  )}
                </span>
              </label>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}
