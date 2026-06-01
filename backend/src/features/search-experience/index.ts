// src/features/search-experience/index.ts

/**
 * Search Experience Feature - Public Exports
 *
 * This feature manages search experience configuration:
 * - Search configuration (filters, facets, pagination)
 * - AI configuration (summary, chat model selection)
 * - Multi-index support with intelligent routing
 * - Access token authentication & CORS middleware
 * - Autocomplete service
 *
 * NOTE: AI chat orchestration (handlers, pipelines, prompts) has been
 * moved to @/features/chat. This feature retains session CRUD, schemas,
 * types, and middleware that the chat feature depends on.
 *
 * Public API: /api/v1/search (access token required)
 * Admin APIs: /api/search-experiences/* (session auth required)
 */

// Types
export * from './search-experience.types';

// Schemas (Zod validation)
export {
  createSearchExperienceSchema,
  updateSearchExperienceSchema,
  addIndexSchema,
  updateIndexSchema,
  listSearchExperiencesQuerySchema,
  publicSearchRequestSchema,
  autocompleteRequestSchema,
  autocompleteConfigSchema,
  type CreateSearchExperienceDTO,
  type UpdateSearchExperienceDTO,
  type AddIndexDTO,
  type UpdateIndexDTO,
  type ListSearchExperiencesQueryDTO,
  type AutocompleteRequestDTO,
} from './search-experience.schemas';

// Service (business logic)
export {
  // CRUD
  createSearchExperience,
  getSearchExperienceById,
  getSearchExperienceWithIndexes,
  getSearchExperienceBySlug,
  getSearchExperienceByAccessToken,
  listSearchExperiences,
  updateSearchExperience,
  deleteSearchExperience,
  regenerateAccessToken,
  // Index management
  addIndex,
  updateIndex,
  removeIndex,
  // Validation helpers
  validateOrigin,
  // Error classes
  SearchExperienceError,
  NotFoundError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
} from './search-experience.service';

// Middleware
export {
  authenticateAccessToken,
  withAccessToken,
  createCorsHeaders,
  handleCorsPreflight,
  handleCorsPreflightWithExperience,
} from './access-token.middleware';

// API Handlers - Public
export { handlePublicSearch, handleAutocomplete } from './search-experience.api.handlers';

// Autocomplete Service
export {
  getAutocompleteSuggestions,
  type AutocompleteRequest,
  type AutocompleteSuggestion,
  type AutocompleteResponse,
} from './autocomplete.service';

// API Handlers - Admin
export {
  handleCreateSearchExperience,
  handleListSearchExperiences,
  handleGetSearchExperience,
  handleUpdateSearchExperience,
  handleDeleteSearchExperience,
  handleRegenerateAccessToken,
  handleAddIndex,
  handleUpdateIndex,
  handleRemoveIndex,
} from './search-experience.admin.handlers';

// Wizard Schemas (for frontend forms)
export {
  wizardStep1Schema,
  wizardStep2Schema,
  wizardStep3Schema,
  WIZARD_DEFAULT_VALUES,
  SLUG_REGEX,
  SLUG_MIN_LENGTH,
  SLUG_MAX_LENGTH,
  generateSlugFromName,
  type WizardFormData,
  type WizardStep1Data,
  type WizardStep2Data,
  type WizardStep3Data,
} from './search-experience.wizard-schemas';

// Cache (for cross-feature invalidation)
export {
  invalidateBySearchIndex as invalidateSearchExperienceCacheBySearchIndex,
} from './search-experience.cache';
