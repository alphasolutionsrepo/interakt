// src/shared/types/ui.types.ts

/**
 * Shared UI Component Types
 * Types used across multiple components (not feature-specific)
 */

import type React from 'react';

/**
 * Generic paginated response
 */
export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalItems: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

/**
 * Table column definition for reusable data tables
 */
export interface TableColumn<T> {
  key: keyof T | string;
  label: string;
  sortable?: boolean;
  render?: (value: any, row: T) => React.ReactNode;
  className?: string;
  width?: string;
}

/**
 * Stats card configuration
 */
export interface StatCard {
  label: string;
  value: number | string;
  icon?: React.ComponentType<{ className?: string }>;
  trend?: {
    value: number | string;
    isPositive: boolean;
    label?: string;
  };
  description?: string;
  color?: string;
  href?: string;
}

/**
 * Navigation item
 */
export interface NavItem {
  title: string;
  url: string;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: string | number;
  subItems?: NavItem[];
  active?: boolean;
  disabled?: boolean;
}

/**
 * Breadcrumb item
 */
export interface BreadcrumbItem {
  label: string;
  href?: string;
  active?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
}

/**
 * Generic form state
 */
export interface FormState<T> {
  data: T;
  errors: Partial<Record<keyof T, string>>;
  isSubmitting: boolean;
  isDirty: boolean;
  touched: Partial<Record<keyof T, boolean>>;
}

/**
 * Loading states
 */
export type LoadingState = 'idle' | 'loading' | 'success' | 'error';

/**
 * Action states
 */
export interface ActionState {
  loading: boolean;
  error: string | null;
  success: boolean;
  message?: string;
}

/**
 * Sort configuration
 */
export interface SortConfig<T> {
  field: keyof T;
  direction: 'asc' | 'desc';
}

/**
 * Filter configuration
 */
export interface FilterConfig {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'startsWith' | 'endsWith';
  value: any;
}

/**
 * Common props for list components
 */
export interface ListComponentProps<T> {
  items: T[];
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  emptyMessage?: string;
  emptyAction?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * Common props for form components
 */
export interface FormComponentProps<T> {
  initialData?: T;
  onSubmit: (data: T) => Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
  submitLabel?: string;
  cancelLabel?: string;
}

/**
 * Common props for modal components
 */
export interface ModalComponentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
}