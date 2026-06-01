// src/shared/seeders/docs/docs-steps.ts
//
// Client-safe step metadata for the docs (Help Assistant) seeder. Kept separate
// from docs.seeder.ts (which is server-only) so UI components can import the
// step list and the progress-event type without pulling in server modules.

export const DOCS_SEED_STEPS = [
  { id: 'datasource', label: 'Docs data source' },
  { id: 'ingest', label: 'Ingest & embed docs' },
  { id: 'tool', label: 'Search tool' },
  { id: 'experience', label: 'Help Assistant' },
] as const;

export type DocsStepId = (typeof DOCS_SEED_STEPS)[number]['id'];

export interface DocsSeedProgressEvent {
  step: DocsStepId;
  status: 'start' | 'done';
  detail?: string;
}
