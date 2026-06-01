// app/users/page.tsx

'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Plus,
  RefreshCw,
  Shield,
  Search,
} from 'lucide-react';
import { useUsers } from './_lib/hooks/useUsers';
import { UserTable, UserFormDialog, ChangePasswordDialog, UserStatsBar } from './_components';
import { DeleteConfirmDialog } from '@/shared/ui/custom/DeleteConfirmDialog';
import { PageHeader } from '@/shared/ui/custom/PageHeader';
import type { UserResponse } from './_lib/api-client';
import type { CreateUserDTO, UpdateUserDTO } from '@/features/auth/auth.validations';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ============================================================================
// Page Skeleton
// ============================================================================

function UsersPageSkeleton() {
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
// Main Page Component
// ============================================================================

export default function UsersPage() {
  const {
    users,
    isLoading,
    isError,
    error,
    refetch,
    createUser,
    isCreating,
    updateUser,
    isUpdating,
    activateUser,
    isActivating,
    deactivateUser,
    isDeactivating,
    changePassword,
    isChangingPassword,
  } = useUsers();

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserResponse | null>(null);
  const [passwordUser, setPasswordUser] = useState<UserResponse | null>(null);
  const [userToDeactivate, setUserToDeactivate] = useState<UserResponse | null>(null);

  // Filter users
  const filteredUsers = useMemo(() => {
    if (!users) return [];

    return users.filter(user => {
      // Search filter
      const matchesSearch = searchQuery === '' ||
        user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.firstName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.lastName?.toLowerCase().includes(searchQuery.toLowerCase());

      // Role filter
      const matchesRole = roleFilter === 'all' || user.role === roleFilter;

      // Status filter
      const matchesStatus = statusFilter === 'all' ||
        (statusFilter === 'active' && user.isActive) ||
        (statusFilter === 'inactive' && !user.isActive);

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, searchQuery, roleFilter, statusFilter]);

  // Handlers
  const handleCreateUser = async (data: CreateUserDTO) => {
    createUser(data, {
      onSuccess: () => {
        setIsCreateDialogOpen(false);
      },
    });
  };

  const handleUpdateUser = async (data: UpdateUserDTO) => {
    if (!editingUser) return;
    updateUser(
      { id: editingUser.id, data },
      {
        onSuccess: () => {
          setEditingUser(null);
        },
      }
    );
  };

  const handleActivateUser = (user: UserResponse) => {
    activateUser(user.id);
  };

  const handleDeactivateUser = () => {
    if (!userToDeactivate) return;
    deactivateUser(userToDeactivate.id, {
      onSuccess: () => {
        setUserToDeactivate(null);
      },
    });
  };

  // Loading state
  if (isLoading) {
    return <UsersPageSkeleton />;
  }

  // Error state
  if (isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-destructive/15">
          <RefreshCw className="size-8 text-destructive" />
        </div>
        <h2 className="text-xl font-semibold">Failed to load users</h2>
        <p className="max-w-md text-center text-muted-foreground">
          {error instanceof Error ? error.message : 'An error occurred while loading users'}
        </p>
        <Button onClick={() => refetch()} className="rounded-xl">
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
        title="User Management"
        description="Manage users, roles, and permissions for your platform"
        icon={Shield}
        iconBg="bg-primary/10"
        iconColor="text-primary"
        breadcrumb={
          <>
            <Shield className="size-4" />
            <span className="font-medium">Administration</span>
          </>
        }
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => refetch()}
              className="rounded-xl"
            >
              <RefreshCw className="mr-2 size-4" />
              Refresh
            </Button>
            <Button
              onClick={() => setIsCreateDialogOpen(true)}
              className="rounded-xl shadow-lg"
            >
              <Plus className="mr-2 size-4" />
              Add User
            </Button>
          </>
        }
      />

      {/* Stats */}
      <UserStatsBar users={users || []} />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-12 rounded-xl border-border/60"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-full sm:w-40 h-12 rounded-xl border-border/60">
            <SelectValue placeholder="All Roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="moderator">Moderator</SelectItem>
            <SelectItem value="user">User</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40 h-12 rounded-xl border-border/60">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Users Table */}
      <UserTable
        users={filteredUsers}
        onEdit={setEditingUser}
        onChangePassword={setPasswordUser}
        onActivate={handleActivateUser}
        onDeactivate={setUserToDeactivate}
        isActivating={isActivating}
        isDeactivating={isDeactivating}
      />

      {/* Create User Dialog */}
      <UserFormDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSubmit={handleCreateUser}
        isSubmitting={isCreating}
      />

      {/* Edit User Dialog */}
      <UserFormDialog
        open={!!editingUser}
        onOpenChange={(open) => !open && setEditingUser(null)}
        onSubmit={handleUpdateUser}
        user={editingUser || undefined}
        isSubmitting={isUpdating}
      />

      {/* Change Password Dialog */}
      <ChangePasswordDialog
        open={!!passwordUser}
        onOpenChange={(open) => !open && setPasswordUser(null)}
        user={passwordUser || undefined}
        onSubmit={(data) => {
          if (!passwordUser) return;
          changePassword(
            { id: passwordUser.id, data },
            {
              onSuccess: () => {
                setPasswordUser(null);
              },
            }
          );
        }}
        isSubmitting={isChangingPassword}
      />

      {/* Deactivate Confirmation Dialog */}
      <DeleteConfirmDialog
        open={!!userToDeactivate}
        onOpenChange={(open) => !open && setUserToDeactivate(null)}
        onConfirm={handleDeactivateUser}
        title="Deactivate User"
        description={
          userToDeactivate
            ? `Are you sure you want to deactivate ${userToDeactivate.email}? They will no longer be able to access the platform.`
            : ''
        }
        confirmText="Deactivate"
        isLoading={isDeactivating}
      />
    </div>
  );
}
