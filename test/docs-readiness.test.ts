// ABOUTME: Verifies user-facing documentation covers the implemented CLI surface and key future-facing release topics.
// ABOUTME: Protects operator docs from drifting behind the actual command surface and distribution plans.

import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

describe("documentation readiness", () => {
  test("README, usage guide, and Homebrew checklist cover key scenarios", async () => {
    const [
      readme,
      quickref,
      usageGuide,
      projectGuide,
      bundleGuide,
      brewGuide,
      knowledgeReadme,
      maintainerReadme,
      publishingGuide,
      releaseProcess,
      ...docsDocusaurusFiles
    ] = await Promise.all([
      readFile(new URL("../README.md", import.meta.url), "utf8"),
      readFile(new URL("../docs/cli-quickref.md", import.meta.url), "utf8"),
      readFile(new URL("../.ai/knowledges/01_agents-cli-usage-guide.md", import.meta.url), "utf8"),
      readFile(new URL("../.ai/knowledges/02_per-project-config-guide.md", import.meta.url), "utf8"),
      readFile(new URL("../.ai/knowledges/03_npm-skill-bundles-guide.md", import.meta.url), "utf8"),
      readFile(new URL("../.ai/knowledges/04_homebrew-release-checklist.md", import.meta.url), "utf8"),
      readFile(new URL("../.ai/knowledges/README.md", import.meta.url), "utf8"),
      readFile(new URL("../docs/maintainers/README.md", import.meta.url), "utf8"),
      readFile(new URL("../docs/maintainers/publishing.md", import.meta.url), "utf8"),
      readFile(new URL("../docs/release-process.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/getting-started/paths/author-and-publish-card.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/getting-started/paths/use-team-harness.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/concepts/cards.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/concepts/local-store.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/concepts/mcp-servers.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/guides/authoring-multi-skill-cards.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/guides/sharing-with-a-team.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/reference/cli/card.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/reference/cli/library.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/reference/cli/store.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/reference/cli/extensions.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/reference/cli/status.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-docusaurus/docs/reference/cli/write.md", import.meta.url), "utf8"),
    ]);
    const docsDocusaurus = docsDocusaurusFiles.join("\n");
    const repoOperatorDocs = quickref + "\n" + usageGuide;

    // Usage-pattern coverage: every operator-facing detail must appear in
    // the in-repo operator docs (cli-quickref + agents CLI usage guide).
    for (const doc of [quickref, usageGuide]) {
      expect(doc).toContain("bun link");
      expect(doc).toContain("uv tool install --python 3.12 'markitdown[all]'");
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
      "drwn card catalog publish",
    ]) {
      expect(quickref).toContain(command);
    }

    expect(brewGuide).toContain("Homebrew");
    expect(brewGuide).toContain("tagged release");
    expect(brewGuide).toContain("drwn");
    expect(brewGuide).toContain("darwinian-minds");

    // Slim README: brand identity, pitch, install, first run, doc pointers,
    // contributing. Deep content (Disciplines, Safety model, "What it
    // harnesses", "Why this exists") lives in the docs site; the README links
    // to the corresponding concepts pages.
    expect(readme).toContain("local meta-harness");
    expect(readme).toContain("The package is `darwinian`. The command is `drwn`.");
    expect(readme).toContain("<img src=\"./docs/assets/darwinian-minds-logo.png\"");
    expect(readme).toContain("Install");
    expect(readme).toContain("First run");
    expect(readme).toContain("Documentation");
    expect(readme).toContain("Contributing");
    expect(readme).toContain("docs-docusaurus");
    expect(readme).toContain("docs/cli-quickref.md");
    expect(readme).toContain("bun run docs:build");
    expect(readme).toContain("drwn write");
    expect(readme).toContain("drwn status");
    expect(readme).toContain("concepts/disciplines");
    expect(readme).toContain("concepts/safety-model");

    // cli-quickref carries the usage-pattern content the slim README points to.
    expect(quickref).toContain("Usage modes");
    expect(quickref).toContain("Command reference");
    expect(quickref).toContain("Per-project configuration");
    expect(quickref).toContain("Extension skill bundles");
    expect(quickref).toContain("Optional extensions");
    expect(quickref).toContain("How write works");
    expect(quickref).toContain("How export works");
    expect(quickref).toContain("drwn library defaults remove skill");
    expect(quickref).toContain("drwn library defaults remove mcp");
    expect(quickref).toContain("--mode direct");
    expect(quickref).toContain("https://github.com/curation-labs/dm-cards-catalog-v1.git");
    expect(quickref).toContain("@community");
    expect(quickref).toContain("registry/config.json");
    expect(quickref).toContain("registry/mcp-servers.json");
    expect(quickref).toContain("drwn apply");

    expect(repoOperatorDocs).toContain("drwn apply");
    expect(usageGuide).toContain("<project>/.agents/drwn/config.json");
    expect(usageGuide).toContain("~/.agents/drwn/machine.json");
    expect(usageGuide).toContain("~/.agents/drwn/mcp-servers");
    expect(usageGuide).toContain("~/.agents/drwn/skills");
    expect(usageGuide).toContain("drwn store migrate");
    expect(usageGuide).toContain("drwn write --force");
    expect(usageGuide).toContain("drwn status --why");
    expect(usageGuide).toContain("drwn library defaults add");
    expect(usageGuide).toContain("drwn card catalog publish");
    expect(usageGuide).toContain("library catalog refresh");
    expect(usageGuide).toContain("https://github.com/curation-labs/dm-cards-catalog-v1.git");
    expect(usageGuide).toContain("repo-native and installed package-backed skills");
    expect(usageGuide).toContain("darwinian-minds");
    expect(usageGuide).toContain("local harness");
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
    expect(docsDocusaurus).toContain("drwn card catalog publish");
    expect(docsDocusaurus).toContain("https://github.com/curation-labs/dm-cards-catalog-v1.git");
    expect(docsDocusaurus).toContain("@community");
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
      expect(readme + quickref + usageGuide + docsDocusaurus).toContain(command);
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
    expect(releaseProcess).toContain("Releasing a new CLI version");
    expect(releaseProcess).toContain("bun run verify:release");
    expect(releaseProcess).toContain("git tag -a v");
    expect(releaseProcess).toContain("npm-publish");
    expect(releaseProcess).toContain("npm view darwinian@");
  });
});
