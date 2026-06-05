// @ts-check
// Minimal Docusaurus config for the public docs site.
//
// The Markdown source of truth stays at backend/src/content/docs (also served
// in-app). The Pages workflow copies it into docs-site/docs before building, so
// this config renders that folder as a docs-only site at the Pages root.

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Interakt Docs',
  tagline: 'AI-powered search & chat platform',
  url: 'https://alphasolutionsrepo.github.io',
  // Project Pages live under /<repo>/. Use '/' for a user/org site or custom domain.
  baseUrl: '/interakt/',
  organizationName: 'alphasolutionsrepo',
  projectName: 'interakt',

  // Don't fail the build on a stray relative link in the authored docs.
  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          path: 'docs',
          // Serve docs at the site root (docs-only site).
          routeBasePath: '/',
          sidebarPath: require.resolve('./sidebars.js'),
        },
        blog: false,
        pages: false,
        theme: {},
      }),
    ],
  ],

  themeConfig: /** @type {import('@docusaurus/preset-classic').ThemeConfig} */ ({
    navbar: {
      title: 'Interakt',
      items: [],
    },
    colorMode: { respectPrefersColorScheme: true },
  }),
};

module.exports = config;
