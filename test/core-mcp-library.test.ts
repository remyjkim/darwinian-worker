// ABOUTME: Verifies persistent user MCP library storage.
// ABOUTME: Protects reusable MCP inventory from activation/default policy.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, symlink, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

describe("core MCP library", () => {
  test("loads an absent library as an empty versioned registry", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const { loadMcpLibrary } = await import("../cli/core/mcp-library");

    expect(await loadMcpLibrary(fixture.agentsDir)).toEqual({ version: 1, servers: {} });
  });

  test("saves and loads MCP library entries", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const { loadMcpLibrary, seedMcpInventory } = await import("./mcp-inventory-fixture");

    await seedMcpInventory(fixture.agentsDir, {
      version: 1,
      servers: {
        github: {
          description: "GitHub",
          transport: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
          optional: true,
        },
      },
    });

    expect((await loadMcpLibrary(fixture.agentsDir)).servers.github?.command).toBe("npx");
  });

  test("rejects invalid server definitions", async () => {
    const { validateMcpLibraryServer } = await import("../cli/core/mcp-library");

    expect(() => validateMcpLibraryServer("bad", { description: "Bad", optional: true })).toThrow("transport");
  });

  test("fails closed for symlink records and persisted secret literals", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const recordsDir = join(fixture.agentsDir, "drwn", "mcp-servers");
    await mkdir(recordsDir, { recursive: true });
    const outside = join(fixture.root, "outside.json");
    await writeFile(outside, JSON.stringify({
      description: "Outside",
      transport: "http",
      url: "https://example.test/mcp",
      optional: true,
    }));
    await symlink(outside, join(recordsDir, "linked.json"));

    const { loadMcpLibrary } = await import("../cli/core/mcp-library");
    await expect(loadMcpLibrary(fixture.agentsDir)).rejects.toMatchObject({
      code: "INVENTORY_MCP_RECORD_INVALID",
    });

    await unlink(join(recordsDir, "linked.json"));
    await writeFile(join(recordsDir, "literal.json"), JSON.stringify({
      description: "Literal",
      transport: "http",
      url: "https://example.test/mcp",
      headers: { Authorization: "Bearer hard-coded-secret" },
      optional: true,
    }));
    await expect(loadMcpLibrary(fixture.agentsDir)).rejects.toMatchObject({
      code: "INVENTORY_MCP_RECORD_INVALID",
    });
  });
});
