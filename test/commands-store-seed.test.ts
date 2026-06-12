// ABOUTME: Verifies drwn store seed command and DRWN_STORE_SEED_PATH auto-bootstrap.
// ABOUTME: Guards read-only bootstrap behavior for CI images.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("store seed command seeds an empty store from a directory", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const sourceRoot = await createSeedSource(fixture.root);

  const result = await runAgentsCli(["store", "seed", "--from", sourceRoot], envFor(fixture));

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Seeded");
  expect(existsSync(join(fixture.agentsDir, "drwn", "cards", "sentinel.txt"))).toBe(true);
});

test("store seed command refuses read-only stores", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const sourceRoot = await createSeedSource(fixture.root);

  const result = await runAgentsCli(
    ["store", "seed", "--from", sourceRoot],
    { ...envFor(fixture), DRWN_STORE_READONLY: "1" },
  );

  expect(result.exitCode).toBe(1);
  expect((result.stderr + result.stdout).toLowerCase()).toContain("read-only");
});

test("DRWN_STORE_SEED_PATH auto-seeds before resolving cards under read-only mode", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const author = await scaffoldCliFixture();
  tempRoots.push(author.root);
  expect((await runAgentsCli(["card", "new", "@me/backend", "--no-git"], envFor(author))).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "publish", "@me/backend"], envFor(author))).exitCode).toBe(0);

  const seedRoot = join(author.agentsDir, "drwn");
  const result = await runAgentsCli(
    ["card", "validate", "@me/backend@1.0.0", "--json"],
    {
      ...envFor(fixture),
      DRWN_STORE_SEED_PATH: seedRoot,
      DRWN_STORE_READONLY: "1",
    },
  );

  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout).card.name).toBe("@me/backend");
  expect(existsSync(join(fixture.agentsDir, "drwn", "store.json"))).toBe(true);

  const mutation = await runAgentsCli(
    ["card", "new", "@me/next", "--no-git"],
    { ...envFor(fixture), DRWN_STORE_READONLY: "1" },
  );
  expect(mutation.exitCode).not.toBe(0);
  expect((mutation.stderr + mutation.stdout).toLowerCase()).toContain("read-only");
});

async function createSeedSource(root: string) {
  const sourceRoot = join(root, "seed");
  await mkdir(join(sourceRoot, "drwn", "cards"), { recursive: true });
  await writeFile(
    join(sourceRoot, "drwn", "store.json"),
    `${JSON.stringify({ schemaVersion: 1, initAt: "2026-06-04T00:00:00.000Z" }, null, 2)}\n`,
  );
  await writeFile(join(sourceRoot, "drwn", "cards", "sentinel.txt"), "seed\n");
  return sourceRoot;
}
