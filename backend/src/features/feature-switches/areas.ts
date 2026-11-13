// src/features/feature-switches/areas.ts

/**
 * The feature switches: the areas of Interakt an installation can turn off. One catalogue,
 * the only owner of area ids. The route table (route-areas.ts), the server check (gate.ts),
 * the settings API and later the admin UI all read it. Safe to import from client code.
 *
 * Areas are grouped by what someone uses, not by permissions (tools:* also covers MCP,
 * prompts:* the knowledge base, playground:use every Test button), so they are their own
 * dimension. Everything not listed here is always on: AI providers, data sources, users and
 * roles, settings, jobs, health and the docs pages.
 *
 * Turning an area off hides it and refuses its routes; its data is kept, so turning it back
 * on restores everything as it was.
 */

export const AREAS = [
  {
    id: 'search',
    label: 'Search',
    description: 'Search experiences, public search, autocomplete, documents and the search widget.',
  },
  {
    id: 'ai-summaries',
    label: 'AI summaries',
    description: 'Summaries and query understanding on search experiences, and the summarize routes.',
    needsAnyOf: ['search'],
  },
  {
    id: 'chat',
    label: 'Chat',
    description: 'Chat experiences and the chat widget, with tools, MCP connections, prompt templates, making user memories and the knowledge base. Stored memories stay reachable for an Admin.',
  },
  {
    id: 'managed-indexes',
    label: 'Managed indexes',
    description: 'Indexes Interakt hosts, their documents and uploads, ingestion keys, domain knowledge and the search provider health.',
  },
  {
    id: 'analytics',
    label: 'Analytics',
    description: 'Analytics pages, Ask, traces and the nightly insights job.',
  },
  {
    id: 'playground',
    label: 'Playground',
    description: 'The Test pages and every Test button elsewhere.',
    needsAnyOf: ['search', 'chat'],
  },
  {
    id: 'help-assistant',
    label: 'Help assistant',
    description: 'The Help drawer (docs search and Ask), its setup and the docs build at start-up. Keeps working when Chat is off.',
  },
] as const satisfies ReadonlyArray<{ id: string; label: string; description: string; needsAnyOf?: readonly string[] }>;

export type Area = (typeof AREAS)[number]['id'];

export const AREA_IDS: readonly Area[] = AREAS.map((a) => a.id);

export function isArea(value: unknown): value is Area {
  return typeof value === 'string' && (AREA_IDS as readonly string[]).includes(value);
}

/** The areas of which at least one must be on for this one to work (none: it stands alone). */
export function needsOf(area: Area): readonly Area[] {
  const entry = AREAS.find((a) => a.id === area);
  return entry && 'needsAnyOf' in entry ? entry.needsAnyOf : [];
}

/** What a request to a turned-off area is told (404, so a widget treats the area as absent). */
export const TURNED_OFF_MESSAGE = 'This feature is turned off for this installation.';
export const TURNED_OFF_CODE = 'FEATURE_OFF';

/** What the admin is told about an area the deployment settings turn off. */
export const PINNED_OFF_MESSAGE = 'Turned off for this installation by its deployment settings.';

/** The deployment setting that turns areas off for good: INTERAKT_FEATURES_OFF=chat,analytics */
export const FEATURES_OFF_ENV = 'INTERAKT_FEATURES_OFF';
