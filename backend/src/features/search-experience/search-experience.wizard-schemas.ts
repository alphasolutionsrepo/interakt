// src/features/search-experience/search-experience.wizard-schemas.ts

/**
 * Search Experience Wizard Validation Schemas
 *
 * Step-by-step validation for the create wizard.
 */

import { z } from 'zod';
import {
  DEFAULT_SEARCH_CONFIG,
  DEFAULT_AI_CONFIG,
  DEFAULT_TOOLS_CONFIG,
  DEFAULT_AUTOCOMPLETE_CONFIG,
} from './search-experience.types';

// ============================================================================
// SLUG REGEX
// ============================================================================

export const SLUG_REGEX = /^[a-z][a-z0-9-]*[a-z0-9]$/;
export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 100;

// ============================================================================
// STEP 1: BASIC INFO
// ============================================================================

export const wizardStep1Schema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(255, 'Name must be at most 255 characters'),
  slug: z
    .string()
    .min(SLUG_MIN_LENGTH, `Slug must be at least ${SLUG_MIN_LENGTH} characters`)
    .max(SLUG_MAX_LENGTH, `Slug must be at most ${SLUG_MAX_LENGTH} characters`)
    .regex(
      SLUG_REGEX,
      'Slug must start with a letter, contain only lowercase letters, numbers, and hyphens, and end with a letter or number'
    ),
  description: z.string().max(2000).optional(),
  indexes: z
    .array(
      z.object({
        searchIndexId: z.string().uuid('Invalid index ID'),
        role: z.enum(['primary', 'secondary']).default('primary'),
        weight: z.number().min(0.1).max(10).default(1.0),
        sortOrder: z.number().int().min(0).default(0),
        aiDescription: z.string().max(1000).optional(),
      })
    )
    .min(1, 'At least one index is required'),
});

export type WizardStep1Data = z.infer<typeof wizardStep1Schema>;

// ============================================================================
// STEP 2: SEARCH SETTINGS
// ============================================================================

export const wizardStep2Schema = z.object({
  searchConfig: z.object({
    defaultPageSize: z.number().int().min(1).max(100),
    maxPageSize: z.number().int().min(1).max(1000),
    enableHighlighting: z.boolean(),
    enableFacets: z.boolean(),
    multiIndexStrategy: z.enum(['auto', 'all', 'primary_only']),
    resultMergeStrategy: z.enum(['interleave', 'grouped', 'scored']),
    maxIndexesPerQuery: z.number().int().min(1).max(10),
    autocomplete: z.object({
      enabled: z.boolean(),
      minLength: z.number().int().min(1).max(10),
      maxSuggestions: z.number().int().min(1).max(20),
      debounceMs: z.number().int().min(0).max(1000),
    }),
    // Hybrid search tuning (optional - uses index defaults if not set)
    hybridConfig: z.object({
      lexicalWeight: z.number().min(0.1).max(3.0).optional(),
      semanticWeight: z.number().min(0.1).max(3.0).optional(),
      rrfRankConstant: z.number().int().min(1).max(1000).optional(),
      rrfWindowSize: z.number().int().min(10).max(500).optional(),
    }).optional(),
  }),
  allowedOrigins: z.array(z.string().url('Invalid URL')).default([]),
});

export type WizardStep2Data = z.infer<typeof wizardStep2Schema>;

// ============================================================================
// STEP 3: AI CONFIGURATION
// ============================================================================

export const wizardStep3Schema = z.object({
  aiConfig: z.object({
    enabled: z.boolean(),
    providerId: z.string().uuid().nullable(),
    modelId: z.number().int().positive().nullable(),
    summary: z.object({
      enabled: z.boolean(),
      maxResultsForContext: z.number().int().min(1).max(50),
      customInstructions: z.string().max(5000).optional(),
      maxTokens: z.number().int().min(50).max(4000).optional(),
    }),
  }),
  toolsConfig: z.object({
    enabled: z.array(z.string()),
    settings: z.record(z.unknown()),
  }),
});

export type WizardStep3Data = z.infer<typeof wizardStep3Schema>;

// ============================================================================
// STEP 4: DISPLAY CONFIGURATION
// ============================================================================

export const displayFieldRoleSchema = z.enum([
  'title',
  'subtitle',
  'description',
  'image',
  'price',
  'badge',
  'secondary',
  'link',
]);

export const wizardStep4Schema = z.object({
  displayConfig: z.object({
    displayFields: z.array(z.object({
      fieldName: z.string().min(1, 'Field name is required'),
      role: displayFieldRoleSchema,
      label: z.string().max(100).optional(),
      order: z.number().int().min(0),
    })),
    layout: z.object({
      showScore: z.boolean().optional(),
      showHighlights: z.boolean().optional(),
    }).optional(),
  }).optional(),
});

export type WizardStep4Data = z.infer<typeof wizardStep4Schema>;

// ============================================================================
// COMBINED WIZARD DATA
// ============================================================================

export interface WizardFormData {
  // Step 1
  name: string;
  slug: string;
  description: string;
  indexes: Array<{
    searchIndexId: string;
    role: 'primary' | 'secondary';
    weight: number;
    sortOrder: number;
    aiDescription?: string;
  }>;

  // Step 2
  searchConfig: {
    defaultPageSize: number;
    maxPageSize: number;
    enableHighlighting: boolean;
    enableFacets: boolean;
    multiIndexStrategy: 'auto' | 'all' | 'primary_only';
    resultMergeStrategy: 'interleave' | 'grouped' | 'scored';
    maxIndexesPerQuery: number;
    autocomplete: {
      enabled: boolean;
      minLength: number;
      maxSuggestions: number;
      debounceMs: number;
    };
    // Hybrid search tuning (optional)
    hybridConfig?: {
      lexicalWeight?: number;
      semanticWeight?: number;
      rrfRankConstant?: number;
      rrfWindowSize?: number;
    };
    // Search type override (optional) - must be compatible with index capabilities
    defaultSearchType?: 'lexical' | 'semantic' | 'hybrid' | 'auto';
  };
  allowedOrigins: string[];

  // Step 3
  aiConfig: {
    enabled: boolean;
    providerId: string | null;
    modelId: number | null;
    summary: {
      enabled: boolean;
      maxResultsForContext: number;
      customInstructions?: string;
      maxTokens?: number;
    };
  };
  toolsConfig: {
    enabled: string[];
    settings: Record<string, unknown>;
  };
  // Step 4: Display Configuration
  displayConfig?: {
    displayFields: Array<{
      fieldName: string;
      role: 'title' | 'subtitle' | 'description' | 'image' | 'price' | 'badge' | 'secondary' | 'link';
      label?: string;
      order: number;
    }>;
    layout?: {
      showScore?: boolean;
      showHighlights?: boolean;
    };
  };
}

// ============================================================================
// DEFAULT VALUES
// ============================================================================

export const WIZARD_DEFAULT_VALUES: WizardFormData = {
  name: '',
  slug: '',
  description: '',
  indexes: [],
  searchConfig: {
    ...DEFAULT_SEARCH_CONFIG,
    autocomplete: { ...DEFAULT_AUTOCOMPLETE_CONFIG },
    // hybridConfig is intentionally undefined - uses global defaults
    // Only set when user explicitly overrides values
    hybridConfig: undefined,
  },
  allowedOrigins: [],
  aiConfig: {
    enabled: true,
    providerId: null,
    modelId: null,
    summary: {
      enabled: true,
      maxResultsForContext: DEFAULT_AI_CONFIG.summary.maxResultsForContext,
      maxTokens: DEFAULT_AI_CONFIG.summary.maxTokens,
    },
  },
  toolsConfig: { ...DEFAULT_TOOLS_CONFIG },
  // Display config is optional - will be populated in Step 4
  displayConfig: undefined,
};

// ============================================================================
// HELPER: Generate slug from name
// ============================================================================

export function generateSlugFromName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, SLUG_MAX_LENGTH);
}
