// ABOUTME: Verifies catalog configuration and catalog adapter behavior.
// ABOUTME: Keeps online discovery policy explicit and default-safe.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, createExecutable, createTempRoot, createFixtureConfig } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

describe("core catalogs", () => {
  test("treats missing catalog config as default catalog settings", async () => {
    const { isNpmSkillCatalogEnabled } = await import("../cli/core/catalogs");
    const config = createFixtureConfig({ claudeSettings: "a", codexConfig: "b", cursorConfig: "c" });
    delete config.catalogs;

    expect(isNpmSkillCatalogEnabled(config)).toBe(true);
  });

  test("searches npm skills catalog with configured search limit", async () => {
    const root = await createTempRoot("agents-catalogs-");
    tempRoots.push(root);
    const binDir = join(root, "bin");
    await createExecutable(
      binDir,
      "npm",
      'printf "%s" \'[{"name":"@acme/skills-writing","version":"1.2.3","description":"Writing skills"}]\'',
    );
    const config = createFixtureConfig({ claudeSettings: "a", codexConfig: "b", cursorConfig: "c" });
    config.catalogs = { npmSkills: { enabled: true, searchLimit: 7 } };

    const { searchNpmSkillCatalog } = await import("../cli/core/catalogs");
    const result = await searchNpmSkillCatalog("writing", config, { PATH: binDir });

    expect(result.results[0]).toMatchObject({
      id: "@acme/skills-writing",
      kind: "skill-package",
      source: "npm",
      packageName: "@acme/skills-writing",
      version: "1.2.3",
      verified: false,
    });
    expect(result.warnings).toEqual([]);
  });

  test("loads trusted MCP catalog entries from configured files", async () => {
    const root = await createTempRoot("agents-catalogs-");
    tempRoots.push(root);
    const catalogPath = join(root, "mcp-catalog.json");
    await mkdir(root, { recursive: true });
    await writeFile(
      catalogPath,
      JSON.stringify({
        servers: {
          github: {
            description: "GitHub",
            transport: "stdio",
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
            optional: false,
          },
        },
      }),
    );
    const config = createFixtureConfig({ claudeSettings: "a", codexConfig: "b", cursorConfig: "c" });
    config.catalogs = { mcp: { enabled: true, sources: [{ type: "file", path: catalogPath }] } };

    const { searchMcpCatalog } = await import("../cli/core/catalogs");
    const result = await searchMcpCatalog("git", config);

    expect(result.results[0]?.id).toBe("github");
    expect(result.results[0]?.kind).toBe("mcp");
  });
});
