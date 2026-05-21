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
      ...docsAstroFiles
    ] = await Promise.all([
      readFile(new URL("../README.md", import.meta.url), "utf8"),
      readFile(new URL("../.ai/knowledges/01_agents-cli-usage-guide.md", import.meta.url), "utf8"),
      readFile(new URL("../.ai/knowledges/02_per-project-config-guide.md", import.meta.url), "utf8"),
      readFile(new URL("../.ai/knowledges/03_npm-skill-bundles-guide.md", import.meta.url), "utf8"),
      readFile(new URL("../.ai/knowledges/04_homebrew-release-checklist.md", import.meta.url), "utf8"),
      readFile(new URL("../.ai/knowledges/README.md", import.meta.url), "utf8"),
      readFile(new URL("../docs/maintainers/README.md", import.meta.url), "utf8"),
      readFile(new URL("../docs/maintainers/publishing.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-astro/src/content/docs/01-getting-started.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-astro/src/content/docs/02-how-apply-works.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-astro/src/content/docs/03-cli-reference.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-astro/src/content/docs/04-mcp-registry.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-astro/src/content/docs/05-skill-library.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-astro/src/content/docs/06-extensions.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-astro/src/content/docs/07-per-project-config.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-astro/src/content/docs/08-diagnostics.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-astro/src/content/docs/09-harness-engineering.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-astro/src/content/docs/10-harness-cards.md", import.meta.url), "utf8"),
      readFile(new URL("../docs-astro/src/content/docs/11-store-and-migration.md", import.meta.url), "utf8"),
    ]);
    const docsAstro = docsAstroFiles.join("\n");

    for (const doc of [readme, usageGuide]) {
      expect(doc).toContain("bun link");
      expect(doc).toContain("bgng write");
      expect(doc).toContain("bgng scan");
      expect(doc).toContain("bgng doctor");
      expect(doc).toContain("bgng init");
      expect(doc).toContain("bgng extensions");
      expect(doc).toContain("bgng extensions setup parallel");
      expect(doc).toContain("bgng extensions setup markitdown");
      expect(doc).toContain("uv tool install --python 3.12 'markitdown[all]'");
      expect(doc).toContain("bgng skills packages");
      expect(doc).toContain("markdownify");
      expect(doc).toContain("markitdown");
      expect(doc).toContain("beads");
      expect(doc).toContain("parallel");
    }

    expect(brewGuide).toContain("Homebrew");
    expect(brewGuide).toContain("tagged release");
    expect(brewGuide).toContain("bgng");
    expect(brewGuide).toContain("beginning-harness");
    expect(readme).toContain("local meta-harness");
    expect(readme).toContain("The package is `beginning-harness`. The command is `bgng`.");
    expect(readme).toContain("What It Changes On Disk");
    expect(readme).toContain("![The Beginning Harness hero image](./docs/assets/the-beginning-harness.png)");
    expect(readme).toContain("Usage Modes");
    expect(readme).toContain("Documentation Map");
    expect(readme).toContain("Per-Project Configuration");
    expect(readme).toContain("Extension Skill Bundles");
    expect(readme).toContain("Optional Extensions");
    expect(readme).toContain("Documentation Site");
    expect(readme).toContain("[docs-astro](./docs-astro)");
    expect(readme).toContain("bun run build");
    expect(readme).toContain("bun run deploy:pages");
    expect(readme).toContain("bgng library defaults remove skill");
    expect(readme).toContain("bgng library defaults remove mcp");
    expect(readme).toContain("[registry/config.json](./registry/config.json)");
    expect(readme).toContain("[registry/mcp-servers.json](./registry/mcp-servers.json)");
    expect(usageGuide).toContain("<project>/.agents/bgng/config.json");
    expect(usageGuide).toContain("~/.agents/bgng/machine.json");
    expect(usageGuide).toContain("~/.agents/bgng/mcp-servers");
    expect(usageGuide).toContain("~/.agents/bgng/skills");
    expect(usageGuide).toContain("bgng store migrate");
    expect(usageGuide).toContain("bgng write --force");
    expect(usageGuide).toContain("bgng status --why");
    expect(usageGuide).toContain("bgng library defaults add");
    expect(usageGuide).toContain("~/.agents/packages/skills");
    expect(usageGuide).toContain("repo-native and installed package-backed skills");
    expect(usageGuide).toContain("beginning-harness");
    expect(usageGuide).toContain("local harness");
    expect(readme).toContain("bgng apply");
    expect(usageGuide).toContain("bgng apply");
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
    expect(bundleGuide).toContain("~/.agents/bgng/skills");
    expect(bundleGuide).toContain("~/.agents/bgng/machine.json");
    expect(bundleGuide).toContain("~/.agents/packages/skills");
    expect(brewGuide).toContain("bgng store status --json");
    expect(brewGuide).toContain("bgng card list --json");
    expect(docsAstro).toContain("Harness Cards");
    expect(docsAstro).toContain("Store And Migration");
    expect(docsAstro).toContain("bgng extensions add");
    expect(docsAstro).toContain("bgng card");
    expect(docsAstro).toContain("bgng store");
    expect(docsAstro).toContain("bgng apply");
    expect(docsAstro).toContain("bgng update");
    expect(docsAstro).toContain("bgng write --force");
    expect(docsAstro).toContain("bgng status --why");
    expect(docsAstro).toContain("~/.agents/bgng/machine.json");
    expect(docsAstro).toContain("~/.agents/bgng/skills");
    expect(docsAstro).toContain("~/.agents/bgng/mcp-servers");
    expect(docsAstro).not.toContain("bgng add extension");
    expect(docsAstro).not.toContain("Machine-wide active MCP defaults live in `~/.agents/bgng/config.json`");
    expect(docsAstro).not.toContain("bundle is available under `~/.agents/packages/skills`");
    expect(docsAstro).not.toContain("package-backed skills and user MCP definitions under `~/.agents/library`");
    expect(knowledgeReadme).toContain("Operator Docs");
    expect(knowledgeReadme).toContain("Distribution And Release Docs");
    expect(maintainerReadme).toContain("publishing.md");
    expect(publishingGuide).toContain("TMP_NPMRC");
    expect(publishingGuide).toContain("--userconfig");
  });
});
