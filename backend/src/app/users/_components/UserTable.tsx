// app/users/_components/UserTable.tsx

'use client';

import { formatDistanceToNow } from 'date-fns';
import { MoreVertical, Edit, Key, UserCheck, UserX, Mail, Calendar } from 'lucide-react';

import type { UserResponse } from '../_lib/api-client';
import { userGates, type RoleInfo, type RolesState } from '../_lib/user-gates';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ActionMenuItem } from '@/shared/access/ActionControls';
import { useAccess } from '@/shared/access/useAccess';

interface UserTableProps {
  users: UserResponse[];
  onEdit: (user: UserResponse) => void;
  onChangePassword: (user: UserResponse) => void;
  onActivate: (user: UserResponse) => void;
  onDeactivate: (user: UserResponse) => void;
  isActivating?: boolean;
  isDeactivating?: boolean;
  /** Every role with its permissions, to tell whose accounts the signed-in user may manage */
  roles: RoleInfo[];
  rolesState?: RolesState;
}

export function UserTable({
  users,
  onEdit,
  onChangePassword,
  onActivate,
  onDeactivate,
  isActivating,
  isDeactivating,
  roles,
  rolesState,
}: UserTableProps) {
  if (users.length === 0) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-12 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-muted">
            <UserX className="size-8 text-muted-foreground" />
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-1">No users found</h3>
            <p className="text-sm text-muted-foreground">
              Try adjusting your search or filter criteria
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card shadow-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-b border-border/60">
            <TableHead className="font-bold">User</TableHead>
            <TableHead className="font-bold">Role</TableHead>
            <TableHead className="font-bold">Status</TableHead>
            <TableHead className="font-bold">Created</TableHead>
            <TableHead className="text-right font-bold">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow
              key={user.id}
              className="hover:bg-muted/50 border-b border-border/40 last:border-0"
            >
              {/* User Info */}
              <TableCell>
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 font-semibold text-primary">
                    {user.firstName?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold">
                      {user.firstName && user.lastName
                        ? `${user.firstName} ${user.lastName}`
                        : 'No name'}
                    </p>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Mail className="size-3" />
                      {user.email}
                    </div>
                  </div>
                </div>
              </TableCell>

              {/* Role */}
              <TableCell>
                <RoleBadge role={user.role} />
              </TableCell>

              {/* Status */}
              <TableCell>
                <StatusBadge isActive={user.isActive} />
              </TableCell>

              {/* Created */}
              <TableCell>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Calendar className="size-3.5" />
                  {formatDistanceToNow(new Date(user.createdAt), { addSuffix: true })}
                </div>
              </TableCell>

              {/* Actions */}
              <TableCell className="text-right">
                <UserRowActions
                  user={user}
                  onEdit={onEdit}
                  onChangePassword={onChangePassword}
                  onActivate={onActivate}
                  onDeactivate={onDeactivate}
                  isActivating={isActivating}
                  isDeactivating={isDeactivating}
                  roles={roles}
                  rolesState={rolesState}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// Role Badge Component
/** One user's menu: each action locked, with the reason, when the signed-in user may not take it. */
function UserRowActions({
  user,
  onEdit,
  onChangePassword,
  onActivate,
  onDeactivate,
  isActivating,
  isDeactivating,
  roles,
  rolesState,
}: Omit<UserTableProps, 'users'> & { user: UserResponse }) {
  const { access, isAdmin, isLoading } = useAccess();
  const gates = userGates({ isLoading, isAdmin, userId: access?.userId, permissions: access?.permissions ?? [] }, user, roles, rolesState);
  return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 rounded-lg"
          >
            <MoreVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <ActionMenuItem gate={gates.manage} icon={Edit} onClick={() => onEdit(user)}>
            Edit User
          </ActionMenuItem>
          <ActionMenuItem gate={gates.manage} icon={Key} onClick={() => onChangePassword(user)}>
            Change Password
          </ActionMenuItem>
          <DropdownMenuSeparator />
          {user.isActive ? (
            <ActionMenuItem
              gate={gates.activation}
              icon={UserX}
              onClick={() => onDeactivate(user)}
              disabled={isDeactivating}
              className="text-destructive focus:text-destructive"
            >
              Deactivate
            </ActionMenuItem>
          ) : (
            <ActionMenuItem
              gate={gates.activation}
              icon={UserCheck}
              onClick={() => onActivate(user)}
              disabled={isActivating}
              className="text-emerald-600 focus:text-emerald-600"
            >
              Activate
            </ActionMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
  );
}

function RoleBadge({ role }: { role?: { name: string; isBuiltIn: boolean } }) {
  const className = role?.isBuiltIn
    ? 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-400'
    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400';
  return (
    <Badge variant="secondary" className={`font-semibold ${className}`}>
      {role?.name ?? 'Unknown'}
    </Badge>
  );
}

// Status Badge Component
function StatusBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 font-semibold">
      <div className="size-1.5 rounded-full bg-emerald-500 mr-1.5" />
      Active
    </Badge>
  ) : (
    <Badge variant="secondary" className="bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 font-semibold">
      <div className="size-1.5 rounded-full bg-slate-400 mr-1.5" />
      Inactive
    </Badge>
  );
}
