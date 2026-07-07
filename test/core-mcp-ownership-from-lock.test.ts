// ABOUTME: Verifies merge-surface MCP ownership uses active servers without write-record.
// ABOUTME: Guards F3 case-3 fresh-checkout field merge behavior.

import { afterEach, expect, test } from "bun:test";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { createTempRoot, cleanupTempRoots } from "./helpers";

const tempRoots: string[] = [];
afterEach(async () => cleanupTempRoots(tempRoots));

test("mergeCodexTomlText preserves user server on fresh checkout", async () => {
  const root = await createTempRoot("codex-merge-");
  tempRoots.push(root);
  const codexPath = join(root, ".codex");
  await mkdir(codexPath, { recursive: true });
  const initial = `[mcp_servers.mine]
command = "echo"

[mcp_servers.context7]
command = "old"
`;
  await writeFile(join(codexPath, "config.toml"), initial);
  const { mergeCodexTomlText } = await import("../cli/core/mcp");
  const merged = mergeCodexTomlText(initial, {
    context7: {
      description: "Docs",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@upstash/context7-mcp"],
      optional: false,
    },
  }, ["context7"]);
  expect(merged).toContain("[mcp_servers.mine]");
  expect(merged).toContain('command = "npx"');
  expect(merged).not.toContain('command = "old"');
});
