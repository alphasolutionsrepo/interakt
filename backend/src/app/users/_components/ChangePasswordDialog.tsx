// app/users/_components/ChangePasswordDialog.tsx

'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Button } from '@/components/ui/button';
import { Loader2, Key } from 'lucide-react';
import { changePasswordSchema } from '@/features/auth/auth.validations';
import type { ChangePasswordDTO } from '@/features/auth/auth.validations';
import type { UserResponse } from '../_lib/api-client';
import { useInlineError } from '@/shared/activity/useInlineError';
import { ProblemAlert } from '@/shared/ui/custom/ProblemAlert';

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Rejects when the save fails; the dialog then shows why */
  onSubmit: (data: ChangePasswordDTO) => void | Promise<void>;
  user?: UserResponse;
  isSubmitting?: boolean;
}

export function ChangePasswordDialog({
  open,
  onOpenChange,
  onSubmit,
  user,
  isSubmitting,
}: ChangePasswordDialogProps) {
  const inline = useInlineError();
  const clearInlineError = inline.clear;
  const form = useForm<ChangePasswordDTO>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
    },
  });

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      clearInlineError();
      form.reset({
        currentPassword: '',
        newPassword: '',
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
              {user && (
                <DialogDescription className="mt-1">
                  Update password for {user.email}
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
            </div>

            <ProblemAlert error={inline.error} hideFields={inline.hideFields} onDismiss={inline.clear} />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
                className="rounded-lg"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="rounded-lg"
              >
                {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
                Change Password
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
