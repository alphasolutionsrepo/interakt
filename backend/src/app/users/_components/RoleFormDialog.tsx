// app/users/_components/RoleFormDialog.tsx

'use client';

import { useEffect, useState } from 'react';

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
import { PERMISSION_GROUPS, type Permission } from '@/features/access/permissions';
import type { CreateRoleInput } from '@/features/access/roles.validations';
import { useInlineError } from '@/shared/activity/useInlineError';
import { DialogFormFooter } from '@/shared/ui/custom/DialogFormFooter';


interface RoleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role?: RoleResponse;
  /** Permissions the signed-in user doesn't hold are shown but can't be ticked */
  canHoldPermission: (permission: Permission) => boolean;
  /** Rejects when the save fails; the dialog then shows why */
  onSubmit: (data: CreateRoleInput) => Promise<void>;
  isSubmitting?: boolean;
}

export function RoleFormDialog({ open, onOpenChange, role, canHoldPermission, onSubmit, isSubmitting }: RoleFormDialogProps) {
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
      await onSubmit({ name: name.trim(), description: description.trim() || null, permissions: [...permissions] as Permission[] });
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
          <div className="space-y-4">
            {PERMISSION_GROUPS.map((group) => (
              <fieldset key={group.id} className="space-y-2">
                <legend className="text-sm font-semibold">{group.label}</legend>
                {group.permissions.map((p) => {
                  const holdable = canHoldPermission(p.id);
                  return (
                    <label key={p.id} className={`flex items-center gap-2 text-sm ${holdable ? '' : 'opacity-50'}`}>
                      <Checkbox
                        checked={permissions.has(p.id)}
                        disabled={!holdable}
                        onCheckedChange={(v) => toggle(p.id, v === true)}
                      />
                      {p.label}
                    </label>
                  );
                })}
              </fieldset>
            ))}
          </div>
          <DialogFormFooter inline={inline} onCancel={() => onOpenChange(false)} submitLabel={role ? 'Save role' : 'Create role'} isSubmitting={isSubmitting} submitDisabled={!name.trim()} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
