// src/features/auth/components/ChangePasswordDialog.tsx

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Key } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';


import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { changePasswordSchema } from '@/features/auth/auth.validations';
import type { ChangePasswordDTO } from '@/features/auth/auth.validations';
import { useInlineError } from '@/shared/activity/useInlineError';
import { DialogFormFooter } from '@/shared/ui/custom/DialogFormFooter';

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Rejects when the save fails; the dialog then shows why */
  onSubmit: (data: ChangePasswordDTO) => void | Promise<void>;
  /** Whose password, shown in the dialog */
  email?: string;
  isSubmitting?: boolean;
}

export function ChangePasswordDialog({
  open,
  onOpenChange,
  onSubmit,
  email,
  isSubmitting,
}: ChangePasswordDialogProps) {
  const inline = useInlineError();
  const clearInlineError = inline.clear;
  const form = useForm<ChangePasswordDTO>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      clearInlineError();
      form.reset({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    }
  }, [open, form, clearInlineError]);

  const handleSubmit = form.handleSubmit(async (data) => {
    inline.clear();
    try {
      await onSubmit(data);
    } catch (err) {
      inline.capture('Change password', err, form);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
              <Key className="size-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-2xl font-bold">Change Password</DialogTitle>
              {email && (
                <DialogDescription className="mt-1">
                  Update password for {email}
                </DialogDescription>
              )}
            </div>
          </div>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              {/* Current Password */}
              <FormField
                control={form.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current Password *</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        {...field}
                        className="h-11 rounded-lg"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* New Password */}
              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Password *</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        {...field}
                        className="h-11 rounded-lg"
                      />
                    </FormControl>
                    <FormDescription className="text-xs">
                      Min 8 characters, with uppercase, lowercase, and number
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Confirm New Password: the schema checks it matches */}
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm New Password *</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} className="h-11 rounded-lg" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFormFooter inline={inline} onCancel={() => onOpenChange(false)} submitLabel="Change Password" isSubmitting={isSubmitting} />
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
