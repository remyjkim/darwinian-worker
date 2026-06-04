import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  tutorialSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Getting Started',
      collapsed: false,
      items: [
        'getting-started/installation',
        'getting-started/first-run',
        {
          type: 'category',
          label: 'Choose Your Path',
          collapsed: true,
          items: [
            'getting-started/paths/overview',
            'getting-started/paths/use-team-harness',
            'getting-started/paths/setup-your-machine',
            'getting-started/paths/override-one-project',
            'getting-started/paths/author-and-publish-card',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Concepts',
      collapsed: false,
      items: [
        'concepts/layered-model',
        'concepts/ownership-and-write-records',
        'concepts/local-store',
        'concepts/skills',
        'concepts/mcp-servers',
        'concepts/extensions-bundles-cards',
        'concepts/cards',
        'concepts/materialization',
        'concepts/diagnostics-model',
      ],
    },
    {
      type: 'category',
      label: 'Guides',
      collapsed: true,
      items: [
        'guides/per-project-patterns',
        'guides/setup-beads',
        'guides/setup-parallel',
        'guides/setup-markitdown',
        'guides/setup-markdownify',
        'guides/authoring-multi-skill-cards',
        'guides/sharing-with-a-team',
        'guides/doctor-in-ci',
        'guides/migrating-hand-edited-configs',
      ],
    },
    {
      type: 'category',
      label: 'Reference',
      collapsed: true,
      items: [
        {
          type: 'category',
          label: 'CLI',
          collapsed: true,
          items: [
            'reference/cli/init',
            'reference/cli/add',
            'reference/cli/search',
            'reference/cli/library',
            'reference/cli/write',
            'reference/cli/scan',
            'reference/cli/skills',
            'reference/cli/mcp',
            'reference/cli/extensions',
            'reference/cli/card',
            'reference/cli/store',
            'reference/cli/status',
            'reference/cli/doctor',
            'reference/cli/export',
            'reference/cli/login',
            'reference/cli/logout',
            'reference/cli/whoami',
            'reference/cli/analyze',
          ],
        },
        {
          type: 'category',
          label: 'Schemas',
          collapsed: true,
          items: [
            'reference/schemas/machine-json',
            'reference/schemas/project-config-json',
            'reference/schemas/card-manifest',
            'reference/schemas/write-record-json',
          ],
        },
        {
          type: 'category',
          label: 'Specs',
          collapsed: true,
          items: [
            'reference/specs/card-spec',
            'reference/specs/extension-spec',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Troubleshooting',
      collapsed: true,
      items: [
        'troubleshooting/reading-doctor',
        'troubleshooting/using-status-why',
        'troubleshooting/common-drift',
        'troubleshooting/stale-symlinks',
        'troubleshooting/ownership-conflicts',
      ],
    },
    'faq',
  ],
};

export default sidebars;
