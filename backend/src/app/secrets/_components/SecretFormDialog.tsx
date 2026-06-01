'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, KeyRound, Eye, EyeOff } from 'lucide-react';
import type { SecretMetadata } from '../_lib/api-client';

interface SecretFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  secret?: SecretMetadata | null;
  onSubmit: (data: { name: string; value: string; description?: string }) => Promise<void>;
  isLoading?: boolean;
}

export function SecretFormDialog({
  open,
  onOpenChange,
  secret,
  onSubmit,
  isLoading = false,
}: SecretFormDialogProps) {
  const isEdit = !!secret;

  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [description, setDescription] = useState('');
  const [showValue, setShowValue] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setName(secret?.name ?? '');
      setValue('');
      setDescription(secret?.description ?? '');
      setShowValue(false);
      setErrors({});
    }
  }, [open, secret]);

  function validate() {
    const e: Record<string, string> = {};
    if (!isEdit) {
      if (!name.trim()) e.name = 'Name is required';
      else if (!/^[a-z][a-z0-9_]*$/.test(name))
        e.name = 'Must start with a lowercase letter and contain only lowercase letters, numbers, and underscores';
    }
    if (!isEdit && !value.trim()) e.value = 'Value is required';
    if (isEdit && !value.trim() && !description.trim())
      e.value = 'Provide a new value or description to update';
    if (description && description.length > 500)
      e.description = 'Description must be 500 characters or less';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    await onSubmit({
      name,
      value,
      description: description.trim() || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-4 text-amber-500" />
            {isEdit ? 'Update Secret' : 'Create Secret'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the value or description. The name cannot be changed.'
              : 'Store an encrypted secret. Values are never exposed after saving.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="secret-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="secret-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isEdit}
              placeholder="e.g. tavily_api_key"
              className={`font-mono rounded-xl ${errors.name ? 'border-destructive' : ''}`}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name}</p>
            )}
            {!isEdit && (
              <p className="text-xs text-muted-foreground">
                Lowercase letters, numbers, and underscores only. Used as{' '}
                <code className="font-mono text-[11px] bg-muted px-1 py-0.5 rounded">
                  {`{{secret:${name || 'name'}}}`}
                </code>{' '}
                in tool configs.
              </p>
            )}
          </div>

          {/* Value */}
          <div className="space-y-1.5">
            <Label htmlFor="secret-value">
              Value {!isEdit && <span className="text-destructive">*</span>}
            </Label>
            <div className="relative">
              <Input
                id="secret-value"
                type={showValue ? 'text' : 'password'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={isEdit ? 'Leave blank to keep current value' : 'Enter secret value'}
                className={`pr-10 rounded-xl ${errors.value ? 'border-destructive' : ''}`}
              />
              <button
                type="button"
                onClick={() => setShowValue((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showValue ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {errors.value && (
              <p className="text-xs text-destructive">{errors.value}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="secret-description">Description</Label>
            <Textarea
              id="secret-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description of what this secret is used for"
              rows={2}
              className={`rounded-xl resize-none ${errors.description ? 'border-destructive' : ''}`}
            />
            {errors.description && (
              <p className="text-xs text-destructive">{errors.description}</p>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" className="rounded-xl" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  {isEdit ? 'Updating...' : 'Creating...'}
                </>
              ) : isEdit ? (
                'Update Secret'
              ) : (
                'Create Secret'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
