'use client'

import React from 'react'
import { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type PageHeaderVariant = 'hero' | 'detail' | 'settings'

interface PageHeaderProps {
  /** Page title */
  title: string
  /** Optional description below title */
  description?: string
  /** Variant determines sizing and layout */
  variant?: PageHeaderVariant
  /** Icon component (for detail/settings variants) - use this OR customIcon */
  icon?: LucideIcon
  /** Custom icon element for complex icon rendering (status indicators, etc.) */
  customIcon?: React.ReactNode
  /** Icon background color class (e.g., "bg-orange-100") */
  iconBg?: string
  /** Icon color class (e.g., "text-orange-600") */
  iconColor?: string
  /** Badge/status element to show next to title */
  badge?: React.ReactNode
  /** Action buttons to show on the right */
  actions?: React.ReactNode
  /** Breadcrumb or context label above title */
  breadcrumb?: React.ReactNode
  /** Additional className for the container */
  className?: string
  /** Children rendered below the header */
  children?: React.ReactNode
}

const variantStyles = {
  hero: {
    title: 'text-2xl font-semibold tracking-tight',
    description: 'text-sm text-muted-foreground max-w-2xl',
    iconSize: 'size-6',
    iconContainer: 'size-11 rounded-xl',
    gap: 'gap-3',
  },
  detail: {
    title: 'text-xl font-semibold tracking-tight',
    description: 'text-sm text-muted-foreground max-w-2xl mt-0.5',
    iconSize: 'size-5',
    iconContainer: 'size-10 rounded-xl',
    gap: 'gap-3',
  },
  settings: {
    title: 'text-xl font-semibold tracking-tight',
    description: 'text-sm text-muted-foreground mt-0.5',
    iconSize: 'size-5',
    iconContainer: 'size-10 rounded-lg',
    gap: 'gap-3',
  },
}

export { variantStyles as pageHeaderStyles }

export function PageHeader({
  title,
  description,
  variant = 'hero',
  icon: Icon,
  customIcon,
  iconBg = 'bg-primary/10',
  iconColor = 'text-primary',
  badge,
  actions,
  breadcrumb,
  className,
  children,
}: PageHeaderProps) {
  const styles = variantStyles[variant]

  return (
    <div className={cn('space-y-4', className)}>
      {/* Breadcrumb */}
      {breadcrumb && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {breadcrumb}
        </div>
      )}

      {/* Main header row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        {/* Left side: Icon + Title + Description */}
        <div className={cn('flex items-start', styles.gap)}>
          {/* Custom Icon (takes precedence) */}
          {customIcon}

          {/* Standard Icon (only if no customIcon) */}
          {!customIcon && Icon && (
            <div
              className={cn(
                'flex items-center justify-center shrink-0',
                styles.iconContainer,
                iconBg
              )}
            >
              <Icon className={cn(styles.iconSize, iconColor)} />
            </div>
          )}

          {/* Title and description */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className={styles.title}>{title}</h1>
              {badge}
            </div>
            {description && (
              <p className={styles.description}>{description}</p>
            )}
          </div>
        </div>

        {/* Right side: Actions */}
        {actions && (
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {actions}
          </div>
        )}
      </div>

      {/* Children */}
      {children}
    </div>
  )
}
