// ABOUTME: Verifies the dry-run-by-default machine inventory GC command.
// ABOUTME: Protects JSON output and explicit prune semantics.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveStoreMcpServersDir } from "../cli/core/store-paths";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture } from "./helpers";

const roots: string[] = [];
afterEach(async () => cleanupTempRoots(roots.splice(0)));

test("machine inventory gc plans by default and prunes only with --prune", async () => {
  const state = await scaffoldCliFixture();
  roots.push(state.root);
  const mcpRoot = resolveStoreMcpServersDir(state.agentsDir);
  await mkdir(mcpRoot, { recursive: true });
  const temporary = join(mcpRoot, "sample.json.tmp.0123456789abcdef");
  await writeFile(temporary, "partial\n");
  const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
  await utimes(temporary, old, old);

  const planned = await runAgentsCli(["machine", "inventory", "gc", "--json"], envFor(state));
  expect(planned.exitCode).toBe(0);
  expect(JSON.parse(planned.stdout)).toMatchObject({ mode: "dry-run" });
  expect(existsSync(temporary)).toBe(true);

  const pruned = await runAgentsCli(["machine", "inventory", "gc", "--prune", "--json"], envFor(state));
  expect(pruned.exitCode).toBe(0);
  expect(JSON.parse(pruned.stdout)).toMatchObject({ mode: "prune", removed: ["mcp-servers/sample.json.tmp.0123456789abcdef"] });
  expect(existsSync(temporary)).toBe(false);
});
