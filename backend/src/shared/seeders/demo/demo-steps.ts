// src/shared/seeders/demo/demo-steps.ts
//
// The canonical, ordered list of demo-setup steps — shared between the server
// seeder (which emits progress events keyed by `id`) and the client setup page
// (which renders the live stepper from this same list, so the two never drift).
//
// IMPORTANT: this module must stay free of `server-only` and any server-only
// imports — the client page imports it directly.

export type DemoStepId =
  | 'provider'
  | 'index'
  | 'fields'
  | 'documents'
  | 'tools'
  | 'search'
  | 'chat'
  | 'warmup';

export interface DemoStep {
  id: DemoStepId;
  /** Short label shown under the stepper node. */
  label: string;
  /** One-line explanation of what this step creates. */
  description: string;
  /** Steps that take noticeably longer — the UI keeps them from looking frozen. */
  longRunning?: boolean;
  /** Only runs when the analytics/traces warm-up is enabled. */
  warmupOnly?: boolean;
}

export const DEMO_SEED_STEPS: DemoStep[] = [
  {
    id: 'provider',
    label: 'OpenAI',
    description: 'Attach your OpenAI key and set it as the default for chat, text, and embeddings.',
  },
  {
    id: 'index',
    label: 'Index',
    description: 'Create the fashion-catalog Elasticsearch index (hybrid lexical + semantic search).',
  },
  {
    id: 'fields',
    label: 'Fields',
    description: 'Apply the 35 field mappings — what is searchable, facetable, and embedded.',
  },
  {
    id: 'documents',
    label: 'Products',
    description: 'Bulk-load 200 products and generate their vector embeddings.',
    longRunning: true,
  },
  {
    id: 'tools',
    label: 'Tools',
    description: 'Wrap the index in a data source and scaffold the search / lookup / enumerate tools.',
  },
  {
    id: 'search',
    label: 'Search',
    description: 'Publish the search experience — the public, AI-summarized search widget.',
  },
  {
    id: 'chat',
    label: 'Chat',
    description: 'Publish the chat experience — the deterministic product-assistant widget.',
  },
  {
    id: 'warmup',
    label: 'Warm-up',
    description: 'Replay the demo-script queries so Analytics, Chat Analytics, and Traces are populated.',
    longRunning: true,
    warmupOnly: true,
  },
];

/** A single progress update emitted by the seeder over SSE. */
export interface SeedProgressEvent {
  step: DemoStepId;
  status: 'start' | 'done';
  /** Optional human-readable detail, e.g. "200 products · 200 embeddings". */
  detail?: string;
}
