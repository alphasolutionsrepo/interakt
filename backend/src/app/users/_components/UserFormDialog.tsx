// app/users/_components/UserFormDialog.tsx

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';

import type { UserResponse } from '../_lib/api-client';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createUserSchema, updateUserSchema } from '@/features/auth/auth.validations';
import type { CreateUserDTO, UpdateUserDTO } from '@/features/auth/auth.validations';
import { useInlineError } from '@/shared/activity/useInlineError';
import { DialogFormFooter } from '@/shared/ui/custom/DialogFormFooter';

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Rejects when the save fails; the dialog then shows why */
  onSubmit: (data: CreateUserDTO | UpdateUserDTO) => void | Promise<void>;
  user?: UserResponse;
  /** Roles to choose from: the ones the signed-in user may assign */
  roles: Array<{ id: string; name: string }>;
  isSubmitting?: boolean;
}

export function UserFormDialog({
  open,
  onOpenChange,
  onSubmit,
  user,
  roles,
  isSubmitting,
}: UserFormDialogProps) {
  const isEditing = !!user;
  const schema = isEditing ? updateUserSchema : createUserSchema;

  const inline = useInlineError();
  const clearInlineError = inline.clear;
  const form = useForm<CreateUserDTO | UpdateUserDTO>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: '',
      password: '',
      firstName: '',
      lastName: '',
      roleId: '',
      isActive: true,
    },
  });

  // Reset form when user changes or dialog opens/closes
  useEffect(() => {
    if (open) {
      clearInlineError();
      if (isEditing && user) {
        form.reset({
          email: user.email,
          firstName: user.firstName || '',
          lastName: user.lastName || '',
          roleId: user.roleId,
          isActive: user.isActive,
        });
      } else {
        form.reset({
          email: '',
          password: '',
          firstName: '',
          lastName: '',
          roleId: '',
          isActive: true,
        });
      }
    }
  }, [open, user, isEditing, form, clearInlineError]);

  const handleSubmit = form.handleSubmit(async (data) => {
    inline.clear();
    try {
      await onSubmit(data);
    } catch (err) {
      inline.capture(isEditing ? 'Update user' : 'Create user', err, form);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">
            {isEditing ? 'Edit User' : 'Create New User'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update user information and permissions'
              : 'Add a new user to your platform'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              {/* Email */}
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email *</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="user@example.com"
                        {...field}
                        className="h-11 rounded-lg"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Password (only for creation) */}
              {!isEditing && (
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password *</FormLabel>
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
              )}

              {/* First Name */}
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="John"
                        {...field}
                        className="h-11 rounded-lg"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Last Name */}
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Doe"
                        {...field}
                        className="h-11 rounded-lg"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Role */}
              <FormField
                control={form.control}
                name="roleId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role *</FormLabel>
                    <Select onValueChange={field.onChange} value={(field.value as string | undefined) ?? ''}>
                      <FormControl>
                        <SelectTrigger className="h-11 rounded-lg">
                          <SelectValue placeholder="Select a role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {roles.map((r) => (
                          <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription className="text-xs">
                      What this user can see and do. Edit roles on the Roles tab.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFormFooter inline={inline} onCancel={() => onOpenChange(false)} submitLabel={isEditing ? 'Save Changes' : 'Create User'} isSubmitting={isSubmitting} />
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
