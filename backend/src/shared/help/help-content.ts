// src/shared/help/help-content.ts
//
// Maps app routes to end-user docs, so a single global help icon (in the
// header) can show the right article for whatever screen you're on. Pages
// with no mapping fall back to a "coming soon" message in the drawer.
//
// Safe to import from client and server (pure functions, no fs access).

/**
 * Slug of the seeded "Help Assistant" chat experience that the Ask tab talks to.
 * Must match HELP_EXPERIENCE_SLUG in src/shared/seeders/docs/docs.seeder.ts.
 */
export const HELP_EXPERIENCE_SLUG = 'help-assistant';

export interface HelpTarget {
  /** Fallback drawer title (the doc's own H1 overrides this once loaded). */
  title: string;
  /** Doc slug under src/content/docs, without the .md extension. */
  doc: string;
}

interface HelpRoute extends HelpTarget {
  /**
   * A string (matched as an exact path or a path-segment prefix) or a RegExp
   * tested against the pathname. Most specific entries come first — first match wins.
   */
  match: string | RegExp;
}

const HELP_ROUTES: HelpRoute[] = [
  // Tools
  { match: '/tools/create', title: 'Creating a tool', doc: 'guides/add-tools-to-your-chat' },
  { match: '/tools', title: 'Tools', doc: 'concepts/tools' },

  // MCP Connections
  { match: '/mcp-connections/create', title: 'Creating an MCP connection', doc: 'concepts/mcp-connections' },
  { match: /^\/mcp-connections\/[^/]+/, title: 'MCP connection', doc: 'concepts/mcp-connections' },
  { match: '/mcp-connections', title: 'MCP Connections', doc: 'concepts/mcp-connections' },

  // Playground — Drop-in Widget
  { match: '/playground/widget', title: 'Drop-in Widget Playground', doc: 'concepts/embed-widgets' },

  // Search indexes — most specific first
  {
    match: /^\/search-indexes\/[^/]+\/upload/,
    title: 'Loading data',
    doc: 'guides/bulk-load-data',
  },
  {
    match: /^\/search-indexes\/[^/]+\/mappings/,
    title: 'Index fields',
    doc: 'concepts/index-fields',
  },
  {
    match: /^\/search-indexes\/[^/]+\/edit/,
    title: 'Editing an index',
    doc: 'concepts/search-indexes',
  },
  { match: '/search-indexes/create', title: 'Creating a search index', doc: 'guides/create-a-search-index' },
  { match: '/search-indexes', title: 'Search indexes', doc: 'concepts/search-indexes' },

  // Data sources
  { match: '/data-sources/create', title: 'Creating a data source', doc: 'concepts/data-sources' },
  { match: '/data-sources', title: 'Data sources', doc: 'concepts/data-sources' },

  // Prompt templates
  { match: '/prompt-templates', title: 'Prompt templates', doc: 'concepts/prompts' },

  // Secrets
  { match: '/secrets', title: 'Secrets', doc: 'concepts/secrets' },

  // Experiences (unified + AI + Search)
  {
    match: /^\/experiences\/search\/[^/]+\/edit/,
    title: 'Editing a search experience',
    doc: 'concepts/search-experiences',
  },
  {
    match: /^\/experiences\/search\/[^/]+/,
    title: 'Search experience',
    doc: 'concepts/search-experiences',
  },
  {
    match: /^\/experiences\/ai\/[^/]+\/edit/,
    title: 'Editing a chat experience',
    doc: 'concepts/chat-experiences',
  },
  {
    match: /^\/experiences\/ai\/[^/]+/,
    title: 'Chat experience',
    doc: 'concepts/chat-experiences',
  },
  { match: '/experiences/create', title: 'Creating an experience', doc: 'concepts/experiences' },
  { match: '/experiences', title: 'Experiences', doc: 'concepts/experiences' },

  // Legacy / standalone experience routes
  { match: '/search-experiences/create', title: 'Creating a search experience', doc: 'guides/create-a-search-experience' },
  { match: '/search-experiences', title: 'Search experiences', doc: 'concepts/search-experiences' },
  { match: '/ai-experiences/create', title: 'Creating a chat experience', doc: 'guides/create-a-chat-experience' },
  { match: '/ai-experiences', title: 'Chat experiences', doc: 'concepts/chat-experiences' },

  // AI providers (now top-level)
  { match: '/ai-providers', title: 'AI providers', doc: 'concepts/ai-providers' },

  // Settings
  { match: '/settings/search', title: 'Search settings', doc: 'concepts/settings' },
  { match: '/settings/cache', title: 'Cache management', doc: 'concepts/settings' },
  { match: '/settings', title: 'Settings', doc: 'concepts/settings' },

  // Playground
  { match: '/playground/ai-service', title: 'AI playground', doc: 'concepts/playground' },
  { match: '/playground/search', title: 'Search playground', doc: 'concepts/playground' },
  { match: '/playground', title: 'Playground', doc: 'concepts/playground' },

  // Analytics
  { match: '/analytics/traces', title: 'Conversations / traces', doc: 'concepts/analytics' },
  { match: '/analytics/chat', title: 'Analytics chat', doc: 'concepts/analytics' },
  { match: '/analytics/overview', title: 'Analytics overview', doc: 'concepts/analytics' },
  { match: '/analytics', title: 'Analytics', doc: 'concepts/analytics' },

  // Administration
  { match: '/setup', title: 'Initial setup', doc: 'getting-started/initial-setup' },
  { match: '/users', title: 'User management', doc: 'concepts/users' },
  { match: '/dashboard', title: 'Dashboard', doc: 'admin-tour/dashboard' },
];

/** Find the doc mapped to a route, or null if the page has no documentation yet. */
export function resolveHelpForPath(pathname: string): HelpTarget | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  for (const route of HELP_ROUTES) {
    const hit =
      typeof route.match === 'string'
        ? path === route.match || path.startsWith(`${route.match}/`)
        : route.match.test(path);
    if (hit) return { title: route.title, doc: route.doc };
  }
  return null;
}

/**
 * Resolve a markdown link href (as written in our docs) to a doc slug,
 * relative to the doc it appears in. Returns null for external links,
 * bare anchors, or anything that escapes the docs tree.
 *
 * Examples (from doc "guides/add-tools-to-your-chat"):
 *   "/concepts/tools"           -> "concepts/tools"
 *   "create-a-chat-experience"  -> "guides/create-a-chat-experience"
 *   "https://example.com"       -> null
 */
export function resolveDocLink(href: string, currentDoc: string): string | null {
  if (!href) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) return null; // external scheme
  const target = href.split('#')[0].split('?')[0].trim().replace(/\.md$/i, '');
  if (!target) return null; // pure anchor/query

  const segments = target.startsWith('/')
    ? target.split('/')
    : [...currentDoc.split('/').slice(0, -1), ...target.split('/')];

  const out: string[] = [];
  for (const seg of segments) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return out.length ? out.join('/') : null;
}
