// ABOUTME: Verifies the MarkItDown skill documents safe non-interactive conversion workflows.
// ABOUTME: Keeps extension-derived agent guidance aligned with the CLI integration.

import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

describe("markitdown document conversion skill", () => {
  test("documents safe non-interactive MarkItDown usage", async () => {
    const content = await readFile(new URL("../skills/shared/markitdown-document-conversion/SKILL.md", import.meta.url), "utf8");

    expect(content).toContain("markitdown input.pdf -o output.md");
    expect(content).toContain("command -v markitdown");
    expect(content).toContain("drwn extensions setup markitdown --install");
    expect(content).toContain("--list-plugins");
    expect(content).toContain("Do not run with sudo");
  });
});
