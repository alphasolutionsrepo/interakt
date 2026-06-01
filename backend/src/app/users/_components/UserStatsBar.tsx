// app/users/_components/UserStatsBar.tsx

'use client';

import { Users, UserCheck, UserX, Shield } from 'lucide-react';
import type { UserResponse } from '../_lib/api-client';

interface UserStatsBarProps {
  users: UserResponse[];
}

export function UserStatsBar({ users }: UserStatsBarProps) {
  const totalUsers = users.length;
  const activeUsers = users.filter(u => u.isActive).length;
  const inactiveUsers = totalUsers - activeUsers;
  const adminUsers = users.filter(u => u.role === 'admin').length;

  const stats = [
    {
      label: 'Total Users',
      value: totalUsers,
      sub: 'Registered',
      icon: Users,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-100 dark:bg-blue-950',
      gradient: 'from-blue-500/20 to-cyan-500/20',
    },
    {
      label: 'Active',
      value: activeUsers,
      sub: 'Enabled users',
      icon: UserCheck,
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-100 dark:bg-emerald-950',
      gradient: 'from-emerald-500/20 to-green-500/20',
    },
    {
      label: 'Inactive',
      value: inactiveUsers,
      sub: 'Disabled users',
      icon: UserX,
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-100 dark:bg-amber-950',
      gradient: 'from-amber-500/20 to-orange-500/20',
    },
    {
      label: 'Administrators',
      value: adminUsers,
      sub: 'Admin access',
      icon: Shield,
      color: 'text-violet-600 dark:text-violet-400',
      bg: 'bg-violet-100 dark:bg-violet-950',
      gradient: 'from-violet-500/20 to-purple-500/20',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <div
            key={stat.label}
            className="relative group"
          >
            {/* Glow effect on hover */}
            <div className={`absolute -inset-0.5 bg-gradient-to-r ${stat.gradient} rounded-2xl blur-lg opacity-0 group-hover:opacity-70 transition-opacity duration-500`} />

            <div className="relative rounded-2xl border border-border/60 bg-card p-6 shadow-lg hover:shadow-xl transition-all duration-300">
              {/* Icon */}
              <div className="relative mb-4">
                <div className={`absolute inset-0 bg-gradient-to-br ${stat.gradient} rounded-xl blur opacity-50`} />
                <div className={`relative ${stat.bg} rounded-xl p-3 w-fit`}>
                  <Icon className={`size-6 ${stat.color}`} />
                </div>
              </div>

              {/* Stats */}
              <div>
                <p className="text-3xl font-bold tracking-tight mb-1">{stat.value}</p>
                <p className="text-sm font-semibold text-muted-foreground">{stat.label}</p>
                <p className="text-xs text-muted-foreground/60 mt-1">{stat.sub}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
