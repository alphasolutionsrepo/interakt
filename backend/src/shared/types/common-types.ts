// src/shared/types/common.types.ts

/**
 * Common types used across the application
 */

// Pagination
export interface Pagination {
    page: number;
    pageSize: number;
    totalPages: number;
    totalItems: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
}

// API Response wrapper
export interface APIResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    pagination?: Pagination;
}

// Sort order
export type SortOrder = 'asc' | 'desc';

// Filter operator
export type FilterOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'in' | 'notIn';

// Generic filter
export interface Filter {
    field: string;
    operator: FilterOperator;
    value: any;
}

// Search params
export interface SearchParams {
    query?: string;
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortOrder?: SortOrder;
    filters?: Filter[];
}

// Timestamps
export interface Timestamps {
    createdAt: Date;
    updatedAt: Date;
}

// Soft delete
export interface SoftDelete {
    deletedAt: Date | null;
    isDeleted: boolean;
}

// Audit fields
export interface AuditFields extends Timestamps {
    createdBy?: string;
    updatedBy?: string;
}