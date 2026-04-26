// ABOUTME: Verifies user-facing documentation covers the implemented CLI surface and key future-facing release topics.
// ABOUTME: Protects operator docs from drifting behind the actual command surface and distribution plans.

import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

describe("documentation readiness", () => {
  test("README, usage guide, and Homebrew checklist cover key scenarios", async () => {
    const [readme, usageGuide, projectGuide, bundleGuide, brewGuide, knowledgeReadme, maintainerReadme, publishingGuide] = await Promise.all([
      readFile(new URL("../README.md", import.meta.url), "utf8"),
      readFile(new URL("../.ai/knowledges/01_agents-cli-usage-guide.md", import.meta.url), "utf8"),
      readFile(new URL("../.ai/knowledges/02_per-project-config-guide.md", import.meta.url), "utf8"),
      readFile(new URL("../.ai/knowledges/03_npm-skill-bundles-guide.md", import.meta.url), "utf8"),
      readFile(new URL("../.ai/knowledges/04_homebrew-release-checklist.md", import.meta.url), "utf8"),
      readFile(new URL("../.ai/knowledges/README.md", import.meta.url), "utf8"),
      readFile(new URL("../docs/maintainers/README.md", import.meta.url), "utf8"),
      readFile(new URL("../docs/maintainers/publishing.md", import.meta.url), "utf8"),
    ]);

    for (const doc of [readme, usageGuide]) {
      expect(doc).toContain("bun link");
      expect(doc).toContain("bgng sync");
      expect(doc).toContain("bgng doctor");
      expect(doc).toContain("bgng init");
      expect(doc).toContain("bgng skills packages");
      expect(doc).toContain("markdownify");
      expect(doc).toContain("parallel");
      expect(doc).toContain("sync-mcp.ts");
    }

    expect(brewGuide).toContain("Homebrew");
    expect(brewGuide).toContain("tagged release");
    expect(brewGuide).toContain("bgng");
    expect(brewGuide).toContain("beginning-agents");
    expect(readme).toContain("What It Changes On Disk");
    expect(readme).toContain("Usage Modes");
    expect(readme).toContain("Documentation Map");
    expect(readme).toContain("Per-Project Configuration");
    expect(readme).toContain("Extension Skill Bundles");
    expect(usageGuide).toContain("<project>/.agents/bgng/config.json");
    expect(usageGuide).toContain("~/.agents/packages/skills");
    expect(usageGuide).toContain("repo-native skills only");
    expect(projectGuide).toContain("Discovery walks upward");
    expect(projectGuide).toContain("\"version\": 1");
    expect(projectGuide).toContain("skills.include");
    expect(projectGuide).toContain("skills.exclude");
    expect(bundleGuide).toContain("bundle.json");
    expect(bundleGuide).toContain("npm pack");
    expect(bundleGuide).toContain("available");
    expect(bundleGuide).toContain("curated");
    expect(bundleGuide).toContain("~/.agents/packages/skills");
    expect(knowledgeReadme).toContain("Operator Docs");
    expect(knowledgeReadme).toContain("Distribution And Release Docs");
    expect(maintainerReadme).toContain("publishing.md");
    expect(publishingGuide).toContain("TMP_NPMRC");
    expect(publishingGuide).toContain("--userconfig");
  });
});
