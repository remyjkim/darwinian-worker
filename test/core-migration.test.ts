// ABOUTME: Verifies the explicit pre-cards-to-cards store migration.
// ABOUTME: Protects the staging/archive semantics before card implementation depends on the store.

import { afterEach, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, createTempRoot } from "./helpers";
import { ensureStoreInitialized } from "../cli/core/card-store";
import { detectLegacyLayout, migrateStore } from "../cli/core/migration";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function scaffoldPreCardsFixture() {
  const root = await createTempRoot("migration-");
  tempRoots.push(root);
  const homeDir = join(root, "home");
  const agentsDir = join(homeDir, ".agents");

  await mkdir(join(agentsDir, "bgng"), { recursive: true });
  await mkdir(join(agentsDir, "library"), { recursive: true });
  await mkdir(join(agentsDir, "packages", "skills", "@acme", "skills", "1.0.0", "skills", "shared", "hello"), { recursive: true });
  await writeFile(join(agentsDir, "bgng", "config.json"), JSON.stringify({ version: 1, optional: {} }, null, 2));
  await writeFile(
    join(agentsDir, "library", "mcp-servers.json"),
    JSON.stringify(
      {
        version: 1,
        servers: {
          context7: {
            description: "Docs",
            transport: "stdio",
            command: "npx",
            args: ["-y", "@upstash/context7-mcp"],
            optional: false,
          },
          github: {
            description: "GitHub",
            transport: "stdio",
            command: "npx",
            optional: true,
          },
        },
      },
      null,
      2,
    ),
  );
  await writeFile(join(agentsDir, "packages", "skills", "@acme", "skills", "1.0.0", "bundle.json"), JSON.stringify({ schemaVersion: 1, bundleName: "@acme/skills", version: "1.0.0", skills: [] }, null, 2));
  await symlink("1.0.0", join(agentsDir, "packages", "skills", "@acme", "skills", "current"), "dir");

  return { root, homeDir, agentsDir };
}

test("detectLegacyLayout returns true for pre-cards fixture", async () => {
  const fixture = await scaffoldPreCardsFixture();

  expect(detectLegacyLayout(fixture.agentsDir)).toBe(true);
});

test("migrateStore produces the expected post-cards layout", async () => {
  const fixture = await scaffoldPreCardsFixture();

  const result = await migrateStore({ agentsDir: fixture.agentsDir });

  expect(existsSync(join(fixture.agentsDir, "bgng", "store.json"))).toBe(true);
  expect(existsSync(join(fixture.agentsDir, "bgng", "machine.json"))).toBe(true);
  expect(existsSync(join(fixture.agentsDir, "bgng", "cards"))).toBe(true);
  expect(existsSync(join(fixture.agentsDir, "bgng", "sources"))).toBe(true);
  expect(existsSync(join(fixture.agentsDir, "bgng", "generated"))).toBe(true);
  expect(existsSync(join(fixture.agentsDir, "bgng", "cache"))).toBe(true);
  expect(existsSync(join(fixture.agentsDir, "bgng", "mcp-servers", "context7.json"))).toBe(true);
  expect(existsSync(join(fixture.agentsDir, "bgng", "mcp-servers", "github.json"))).toBe(true);
  expect(existsSync(join(fixture.agentsDir, "bgng", "skills", "@acme", "skills", "1.0.0", "bundle.json"))).toBe(true);
  expect(existsSync(join(fixture.agentsDir, "bgng", "skills", "@acme", "skills", "current"))).toBe(true);
  expect(existsSync(result.archivedTo)).toBe(true);
  expect(existsSync(join(fixture.agentsDir, "library"))).toBe(false);
  expect(existsSync(join(fixture.agentsDir, "packages"))).toBe(false);

  const context7 = JSON.parse(await readFile(join(fixture.agentsDir, "bgng", "mcp-servers", "context7.json"), "utf8"));
  expect(context7.command).toBe("npx");
});

test("migrateStore re-run after success reports no migration", async () => {
  const fixture = await scaffoldPreCardsFixture();
  await migrateStore({ agentsDir: fixture.agentsDir });

  const result = await migrateStore({ agentsDir: fixture.agentsDir });

  expect(result.steps).toContain("no legacy layout detected");
  expect(JSON.parse(readFileSync(join(fixture.agentsDir, "bgng", "store.json"), "utf8")).schemaVersion).toBe(1);
});

test("detectLegacyLayout returns true even after the cards-era store is initialized", async () => {
  const fixture = await scaffoldPreCardsFixture();

  await ensureStoreInitialized(fixture.agentsDir);

  expect(detectLegacyLayout(fixture.agentsDir)).toBe(true);
});

test("migrateStore moves forward legacy data even when the cards-era store was preemptively initialized", async () => {
  const fixture = await scaffoldPreCardsFixture();
  await ensureStoreInitialized(fixture.agentsDir);

  const result = await migrateStore({ agentsDir: fixture.agentsDir });

  expect(result.steps).not.toContain("no legacy layout detected");
  expect(existsSync(join(fixture.agentsDir, "bgng", "mcp-servers", "context7.json"))).toBe(true);
  expect(detectLegacyLayout(fixture.agentsDir)).toBe(false);
});
