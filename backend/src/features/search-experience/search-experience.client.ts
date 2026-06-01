// src/features/search-experience/search-experience.client.ts

/**
 * Search Experience - Client-Safe Exports
 *
 * This file exports only types, constants, and schemas that are safe
 * to import in client components (no server-only dependencies).
 *
 * Use this import in 'use client' components:
 *   import { ... } from '@/features/search-experience/search-experience.client';
 *
 * For server components or API routes, use the main index:
 *   import { ... } from '@/features/search-experience';
 */

// Types (all safe for client)
export * from './search-experience.types';

// Wizard Schemas (Zod schemas for frontend forms)
export {
  wizardStep1Schema,
  wizardStep2Schema,
  wizardStep3Schema,
  wizardStep4Schema,
  displayFieldRoleSchema,
  WIZARD_DEFAULT_VALUES,
  SLUG_REGEX,
  SLUG_MIN_LENGTH,
  SLUG_MAX_LENGTH,
  generateSlugFromName,
  type WizardFormData,
  type WizardStep1Data,
  type WizardStep2Data,
  type WizardStep3Data,
  type WizardStep4Data,
} from './search-experience.wizard-schemas';

// Schema types (inferred types only, not the Zod schemas that may have server deps)
export type {
  CreateSearchExperienceDTO,
  UpdateSearchExperienceDTO,
  AddIndexDTO,
  UpdateIndexDTO,
  ListSearchExperiencesQueryDTO,
} from './search-experience.schemas';
