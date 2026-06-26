import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Darwinian Mind',
  tagline: 'A local meta-harness for AI agent tools',
  favicon: 'img/favicon.svg',

  future: {
    v4: true,
  },

  url: 'https://docs.darwiniantools.com',
  baseUrl: '/',
  organizationName: 'remyjkim',
  projectName: 'darwinian-mind',

  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'throw',
    },
  },

  themes: ['@docusaurus/theme-mermaid'],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: '/',
          editUrl: 'https://github.com/remyjkim/darwinian-mind/tree/main/docs-docusaurus/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/social-card.png',
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Darwinian Mind',
      logo: {
        alt: 'Darwinian Mind',
        src: 'img/logo.svg',
        srcDark: 'img/logo-dark.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          href: 'https://github.com/remyjkim/darwinian-mind',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            { label: 'Introduction', to: '/' },
            { label: 'Getting Started', to: '/getting-started/installation' },
            { label: 'Concepts', to: '/concepts/layered-model' },
            { label: 'Reference', to: '/reference/cli/status' },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/remyjkim/darwinian-mind',
            },
            {
              label: 'Issues',
              href: 'https://github.com/remyjkim/darwinian-mind/issues',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Darwinian Mind. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'typescript', 'json', 'toml'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
