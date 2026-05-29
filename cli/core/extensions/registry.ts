// ABOUTME: Provides the built-in extension definitions known to drwn.
// ABOUTME: Models capability families such as Beads and Parallel without hard-coding command behavior.

import type { ExtensionDefinition } from "./types";

const extensions: ExtensionDefinition[] = [
  {
    id: "beads",
    displayName: "Beads",
    description: "Project-scoped issue tracking and agent memory through the bd CLI.",
    scopes: ["project"],
    defaultModes: ["cli", "skills", "hooks"],
    commands: [
      {
        name: "bd",
        required: true,
        installHints: [
          "brew install beads",
          "npm install -g @beads/bd",
          "curl -fsSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash",
        ],
      },
      {
        name: "beads-mcp",
        required: false,
        installHints: ["Install beads-mcp only if an MCP-only client needs Beads access."],
      },
    ],
    skills: [{ name: "beads-task-tracking", source: "repo", defaultIncluded: false }],
    mcpServers: [{ name: "beads", defaultEnabled: false, scope: "project" }],
    docs: [
      { label: "Beads docs", url: "https://gastownhall.github.io/beads/" },
      { label: "Beads IDE setup", url: "https://gastownhall.github.io/beads/getting-started/ide-setup" },
      { label: "Beads MCP", url: "https://gastownhall.github.io/beads/integrations/mcp-server" },
    ],
  },
  {
    id: "parallel",
    displayName: "Parallel",
    description: "Web search, extraction, research, and enrichment through Parallel CLI-backed skills.",
    scopes: ["global", "project"],
    defaultModes: ["cli", "skills"],
    commands: [
      {
        name: "parallel-cli",
        required: true,
        installHints: ["curl -fsSL https://parallel.ai/install.sh | bash", "parallel-cli login"],
      },
    ],
    skills: [
      { name: "parallel-web-search", source: "repo", defaultIncluded: true },
      { name: "parallel-web-extract", source: "repo", defaultIncluded: true },
      { name: "parallel-deep-research", source: "repo", defaultIncluded: true },
      { name: "parallel-data-enrichment", source: "repo", defaultIncluded: true },
    ],
    mcpServers: [
      { name: "parallel-search", defaultEnabled: false, scope: "global" },
      { name: "parallel-task", defaultEnabled: false, scope: "global" },
    ],
    docs: [
      { label: "Parallel developer quickstart", url: "https://docs.parallel.ai/integrations/developer-quickstart" },
      { label: "Parallel CLI", url: "https://docs.parallel.ai/integrations/cli" },
      { label: "Parallel MCP", url: "https://docs.parallel.ai/integrations/mcp/quickstart" },
    ],
  },
  {
    id: "markitdown",
    displayName: "MarkItDown",
    description: "Document-to-Markdown conversion through Microsoft's markitdown CLI.",
    scopes: ["global", "project"],
    defaultModes: ["cli", "skills"],
    commands: [
      {
        name: "markitdown",
        required: true,
        purpose: "runtime",
        installHints: ["uv tool install --python 3.12 'markitdown[all]'"],
      },
      {
        name: "uv",
        required: false,
        purpose: "installer",
        installHints: ["brew install uv", "curl -LsSf https://astral.sh/uv/install.sh | sh"],
      },
    ],
    skills: [{ name: "markitdown-document-conversion", source: "repo", defaultIncluded: true }],
    mcpServers: [],
    docs: [
      { label: "MarkItDown README", url: "https://github.com/microsoft/markitdown" },
      { label: "MarkItDown PyPI", url: "https://pypi.org/project/markitdown/" },
      { label: "uv tools", url: "https://docs.astral.sh/uv/concepts/tools/" },
    ],
  },
];

export function listExtensions() {
  return [...extensions];
}

export function getExtension(id: string) {
  return extensions.find((extension) => extension.id === id) ?? null;
}
