// @ts-check
// Docusaurus config for the public docs site.
//
// Authored guides: the Markdown source of truth stays at backend/src/content/docs
// (also served in-app). The Pages workflow copies it into docs-site/docs before
// building, so this config renders that folder as a docs-only site at the root.
//
// API reference: rendered by Redocusaurus (Redoc) from the public OpenAPI spec at
// static/openapi/interakt-v1.yaml — itself generated from the backend's Zod
// schemas (`npm run openapi:generate` in backend/). Served at /api.

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Interakt Docs',
  tagline: 'AI-powered search & chat platform',
  url: 'https://docs.interakt.app',
  // Served at the root of the custom domain, so baseUrl is '/'.
  // (Was '/interakt/' for project Pages under alphasolutionsrepo.github.io.)
  baseUrl: '/',
  organizationName: 'alphasolutionsrepo',
  projectName: 'interakt',

  // Don't fail the build on a stray relative link in the authored docs.
  onBrokenLinks: 'warn',

  markdown: {
    // Authored guides are all .md → CommonMark, so their literal <angle>
    // placeholders and { braces } stay text and never break the build.
    format: 'md',
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          path: 'docs',
          // Serve the authored guides at the site root (docs-only site).
          routeBasePath: '/',
          sidebarPath: require.resolve('./sidebars.js'),
        },
        blog: false,
        pages: false,
        theme: {},
      }),
    ],
    [
      'redocusaurus',
      /** @type {import('redocusaurus').PresetEntry} */
      ({
        // Render the public OpenAPI spec as an interactive reference at /api.
        // The spec lives under static/ so it's also downloadable at /openapi/.
        specs: [
          {
            id: 'interakt-public-api',
            spec: 'static/openapi/interakt-v1.yaml',
            route: '/api/',
          },
        ],
        theme: {
          // Match the docs primary color; Redoc groups operations by tag.
          primaryColor: '#2e8555',
        },
      }),
    ],
  ],

  themeConfig: /** @type {import('@docusaurus/preset-classic').ThemeConfig} */ ({
    navbar: {
      title: 'Interakt',
      items: [
        { to: '/api/', label: 'API Reference', position: 'left' },
      ],
    },
    colorMode: { respectPrefersColorScheme: true },
  }),
};

module.exports = config;
