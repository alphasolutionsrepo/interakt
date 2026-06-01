// src/shared/seeders/docs/index.ts

export { seedDocs, resetDocs, getDocsSeedStatus, HELP_EXPERIENCE_SLUG } from './docs.seeder';
export type { DocsSeedOptions, DocsSeedSummary, DocsResetSummary, DocsSeedStatus } from './docs.seeder';

// NOTE: client components must import docs-steps DIRECTLY (not via this barrel),
// since the barrel re-exports the server-only seeder above.
export { DOCS_SEED_STEPS } from './docs-steps';
export type { DocsStepId, DocsSeedProgressEvent } from './docs-steps';
