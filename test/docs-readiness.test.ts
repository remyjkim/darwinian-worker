// ABOUTME: Verifies user-facing documentation covers the implemented CLI surface and key future-facing release topics.
// ABOUTME: Protects operator docs from drifting behind the actual command surface and distribution plans.

import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

describe("documentation readiness", () => {
  test("README, usage guide, and Homebrew checklist cover key scenarios", async () => {
    const [
      readme,
      usageGuide,
      projectGuide,
      bundleGuide,
      brewGuide,
      knowledgeReadme,
      maintainerReadme,
      publishingGuide,
      ...docsDocusaurusFiles
    ] = await Promise.all([
      readFile(new URL("../README.md", import.meta.url), "utf8"),
      readFile(new URL("../.ai/knowledges/01_agents-cli-usage-guide.md", import.meta.url), "utf8"),
      readFile(new URL("../.ai/knowledges/02_per-project-config-guide.md", import.meta.url), "utf8"),
      readFile(new URL("../.ai/knowledges/03_npm-skill-bundles-guide.md", import.meta.url), "utf8"),
      readFile(new URL("../.ai/knowledges/04_homebrew-release-checklist.md", import.meta.url), "utf8"),
      readFile(new URL("../.ai/knowledges/README.md", import.meta.url), "utf8"),
      readFile(new URL("../docs/maintainers/README.md", import.meta.url), "utf8"),
      readFile(new URL("../docs/maintainers/publishing.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/getting-started/paths/author-and-publish-card.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/getting-started/paths/use-team-harness.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/concepts/cards.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/concepts/local-store.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/concepts/mcp-servers.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/guides/authoring-multi-skill-cards.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/reference/cli/card.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/reference/cli/store.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/reference/cli/extensions.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/reference/cli/status.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/reference/cli/write.md", import.meta.url), "utf8"),
    ]);
    const docsDocusaurus = docsDocusaurusFiles.join("\n");

    for (const doc of [readme, usageGuide]) {
      expect(doc).toContain("bun link");
      expect(doc).toContain("uv tool install --python 3.12 'markitdown[all]'");
      expect(doc).toContain("markdownify");
      expect(doc).toContain("markitdown");
      expect(doc).toContain("beads");
      expect(doc).toContain("parallel");
    }
    for (const command of [
      "drwn write",
      "drwn scan",
      "drwn doctor",
      "drwn init",
      "drwn extensions",
      "drwn extensions setup parallel",
      "drwn extensions setup markitdown",
      "drwn skills packages",
    ]) {
      expect(readme).toContain(command);
    }

    expect(brewGuide).toContain("Homebrew");
    expect(brewGuide).toContain("tagged release");
    expect(brewGuide).toContain("drwn");
    expect(brewGuide).toContain("darwinian-harness");
    expect(readme).toContain("local meta-harness");
    expect(readme).toContain("The package is `darwinian-harness`. The command is `drwn`.");
    expect(readme).toContain("What It Changes On Disk");
    expect(readme).toContain("<img src=\"./docs/assets/darwinian-harness-logo.png\"");
    expect(readme).toContain("Usage Modes");
    expect(readme).toContain("Documentation Map");
    expect(readme).toContain("Per-Project Configuration");
    expect(readme).toContain("Extension Skill Bundles");
    expect(readme).toContain("Optional Extensions");
    expect(readme).toContain("Documentation Site");
    expect(readme).toContain("[docs-docusaurus](./docs-docusaurus)");
    expect(readme).toContain("bun run build");
    expect(readme).toContain("bun run deploy:pages");
    expect(readme).toContain("drwn library defaults remove skill");
    expect(readme).toContain("drwn library defaults remove mcp");
    expect(readme).toContain("[registry/config.json](./registry/config.json)");
    expect(readme).toContain("[registry/mcp-servers.json](./registry/mcp-servers.json)");
    expect(usageGuide).toContain("<project>/.agents/drwn/config.json");
    expect(usageGuide).toContain("~/.agents/drwn/machine.json");
    expect(usageGuide).toContain("~/.agents/drwn/mcp-servers");
    expect(usageGuide).toContain("~/.agents/drwn/skills");
    expect(usageGuide).toContain("drwn store migrate");
    expect(usageGuide).toContain("drwn write --force");
    expect(usageGuide).toContain("drwn status --why");
    expect(usageGuide).toContain("drwn library defaults add");
    expect(usageGuide).toContain("repo-native and installed package-backed skills");
    expect(usageGuide).toContain("darwinian-harness");
    expect(usageGuide).toContain("local harness");
    expect(readme).toContain("drwn apply");
    expect(usageGuide).toContain("drwn apply");
    expect(projectGuide).toContain("Discovery walks upward");
    expect(projectGuide).toContain("\"version\": 1");
    expect(projectGuide).toContain("skills.include");
    expect(projectGuide).toContain("skills.exclude");
    expect(projectGuide).toContain("extensions.parallel");
    expect(projectGuide).toContain("extensions.beads");
    expect(projectGuide).toContain("extensions.markitdown");
    expect(projectGuide).toContain("markitdown-document-conversion");
    expect(bundleGuide).toContain("bundle.json");
    expect(bundleGuide).toContain("npm pack");
    expect(bundleGuide).toContain("available");
    expect(bundleGuide).toContain("curated");
    expect(bundleGuide).toContain("~/.agents/drwn/skills");
    expect(bundleGuide).toContain("~/.agents/drwn/machine.json");
    expect(brewGuide).toContain("drwn store status --json");
    expect(brewGuide).toContain("drwn card list --json");
    expect(docsDocusaurus).toContain("Cards");
    expect(docsDocusaurus).toContain("Local Store");
    expect(docsDocusaurus).toContain("drwn extensions add");
    expect(docsDocusaurus).toContain("drwn card");
    expect(docsDocusaurus).toContain("drwn store");
    expect(docsDocusaurus).toContain("drwn apply");
    expect(docsDocusaurus).toContain("drwn update");
    expect(docsDocusaurus).toContain("drwn write --force");
    expect(docsDocusaurus).toContain("drwn status --why");
    expect(docsDocusaurus).toContain("~/.agents/drwn/machine.json");
    expect(docsDocusaurus).toContain("~/.agents/drwn/skills");
    expect(docsDocusaurus).toContain("~/.agents/drwn/mcp-servers");
    for (const command of [
      "drwn card source list",
      "drwn card source show",
      "drwn card source doctor",
      "drwn card source add-skill",
      "drwn card source remove-skill",
      "drwn card source set",
      "drwn card source add-mcp",
      "drwn card source remove-mcp",
      "--stability",
      "--last-validated-with",
      "--test-status-badge",
    ]) {
      expect(readme + usageGuide + docsDocusaurus).toContain(command);
    }
    expect(docsDocusaurus).not.toContain("Coming soon");
    expect(docsDocusaurus).not.toContain("drwn add extension");
    expect(docsDocusaurus).not.toContain("Machine-wide active MCP defaults live in `~/.agents/drwn/config.json`");
    expect(docsDocusaurus).not.toContain("package-backed skills and user MCP definitions under `~/.agents/library`");
    expect(knowledgeReadme).toContain("Operator Docs");
    expect(knowledgeReadme).toContain("Distribution And Release Docs");
    expect(maintainerReadme).toContain("publishing.md");
    expect(publishingGuide).toContain("TMP_NPMRC");
    expect(publishingGuide).toContain("--userconfig");
  });
});
