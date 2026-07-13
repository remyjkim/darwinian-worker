// ABOUTME: Verifies record-scoped standalone MCP persistence and removal.
// ABOUTME: Ensures one MCP lifecycle operation never rewrites or deletes sibling records.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createMcpLibraryRecord,
  loadMcpLibrary,
  removeMcpLibraryRecord,
  updateMcpLibraryRecord,
} from "../cli/core/mcp-library";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const roots: string[] = [];
afterEach(async () => cleanupTempRoots(roots.splice(0)));

const alpha = { description: "Alpha", transport: "http" as const, url: "https://alpha.test/mcp", optional: true };
const beta = { description: "Beta", transport: "stdio" as const, command: "beta", optional: true };

describe("standalone MCP record persistence", () => {
  test("adds, updates, and removes one record without changing siblings", async () => {
    const root = await createTempRoot("mcp-records-");
    roots.push(root);
    const agentsDir = join(root, ".agents");
    await createMcpLibraryRecord(agentsDir, "alpha", alpha);
    await createMcpLibraryRecord(agentsDir, "beta", beta);
    const betaPath = join(agentsDir, "drwn", "mcp-servers", "beta.json");
    const betaBefore = await readFile(betaPath, "utf8");

    await updateMcpLibraryRecord(agentsDir, "alpha", { ...alpha, description: "Alpha updated" });
    expect((await loadMcpLibrary(agentsDir)).servers.alpha?.description).toBe("Alpha updated");
    expect(await readFile(betaPath, "utf8")).toBe(betaBefore);

    await removeMcpLibraryRecord(agentsDir, "alpha");
    expect(existsSync(join(agentsDir, "drwn", "mcp-servers", "alpha.json"))).toBe(false);
    expect(await readFile(betaPath, "utf8")).toBe(betaBefore);
  });

  test("uses separate create and update contracts", async () => {
    const root = await createTempRoot("mcp-record-contract-");
    roots.push(root);
    const agentsDir = join(root, ".agents");

    await expect(updateMcpLibraryRecord(agentsDir, "alpha", alpha)).rejects.toThrow(/not installed/i);
    await createMcpLibraryRecord(agentsDir, "alpha", alpha);
    await expect(createMcpLibraryRecord(agentsDir, "alpha", alpha)).rejects.toThrow(/already exists/i);
  });
});
