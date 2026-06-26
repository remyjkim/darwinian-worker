// ABOUTME: Verifies drwn catalog validate command wiring and JSON output.
// ABOUTME: Exercises local file validation without depending on GitHub network state.

import { afterEach, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("catalog validate accepts the current public catalog shape", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const catalogPath = await writeCatalogFixture(fixture.root, {
    catalogVersion: 1,
    scope: "@community",
    description: "Curation Labs Darwinian Mind Cards Catalog V1",
    homepage: "https://github.com/curation-labs/dm-cards-catalog-v1",
    cards: [
      {
        name: "dm-card-base",
        url: "git+https://github.com/remyjkim/dm-card-base.git#v0.1.0",
        description: "Personal base card bundling the current-lane Darwinian Mind skills.",
        tags: ["harness", "skills"],
      },
    ],
  });

  const result = await runAgentsCli(["catalog", "validate", catalogPath, "--json"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({ ok: true, cardCount: 1 });
});

test("catalog validate rejects malformed catalog json", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const catalogPath = await writeCatalogFixture(fixture.root, {
    catalogVersion: 2,
    scope: "@community",
    cards: [],
  });

  const result = await runAgentsCli(["catalog", "validate", catalogPath, "--json"], envFor(fixture));

  expect(result.exitCode).toBe(1);
  const parsed = JSON.parse(result.stdout) as { ok: false; errors: string[] };
  expect(parsed.ok).toBe(false);
  expect(parsed.errors.join("\n")).toContain("catalogVersion");
});

test("catalog validate reports invalid json clearly", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const dir = join(fixture.root, "catalog");
  await mkdir(dir, { recursive: true });
  const catalogPath = join(dir, "catalog.json");
  await writeFile(catalogPath, "{ nope");

  const result = await runAgentsCli(["catalog", "validate", catalogPath, "--json"], envFor(fixture));

  expect(result.exitCode).toBe(1);
  const parsed = JSON.parse(result.stdout) as { ok: false; errors: string[] };
  expect(parsed.errors.join("\n")).toContain("Invalid JSON");
});

async function writeCatalogFixture(root: string, value: unknown) {
  const dir = join(root, "catalog");
  await mkdir(dir, { recursive: true });
  const catalogPath = join(dir, "catalog.json");
  await writeFile(catalogPath, `${JSON.stringify(value, null, 2)}\n`);
  return catalogPath;
}
