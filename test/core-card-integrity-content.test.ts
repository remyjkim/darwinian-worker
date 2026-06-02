// ABOUTME: Verifies card content-tree integrity hashing covers bundled files.
// ABOUTME: Protects the Wave 1 promise that the integrity field detects content drift.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { computeCardIntegrity, resolveCard } from "../cli/core/card-store";
import { cleanupTempRoots, createTempRoot, publishCardWithSkills, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function scaffoldCardVersion(root: string) {
  await mkdir(join(root, "skills", "polish"), { recursive: true });
  await writeFile(join(root, "card.json"), JSON.stringify({ name: "@me/x", version: "1.0.0" }));
  await writeFile(join(root, "skills", "polish", "SKILL.md"), "---\nname: polish\n---\nbody\n");
  await writeFile(join(root, "skills", "polish", "ref.md"), "reference\n");
  return root;
}

test("computeCardIntegrity returns sha256-prefixed deterministic digest", async () => {
  const root = await createTempRoot("card-int-");
  tempRoots.push(root);
  await scaffoldCardVersion(root);

  const a = await computeCardIntegrity(root);
  const b = await computeCardIntegrity(root);

  expect(a).toBe(b);
  expect(a.startsWith("sha256-")).toBe(true);
  expect(a.length).toBeGreaterThan(20);
});

test("computeCardIntegrity changes when any bundled file content changes", async () => {
  const root = await createTempRoot("card-int-");
  tempRoots.push(root);
  await scaffoldCardVersion(root);

  const before = await computeCardIntegrity(root);
  await writeFile(join(root, "skills", "polish", "SKILL.md"), "---\nname: polish\n---\nMODIFIED\n");
  const after = await computeCardIntegrity(root);

  expect(after).not.toBe(before);
});

test("computeCardIntegrity ignores the .integrity file itself", async () => {
  const root = await createTempRoot("card-int-");
  tempRoots.push(root);
  await scaffoldCardVersion(root);

  const before = await computeCardIntegrity(root);
  await writeFile(join(root, ".integrity"), `${before}\n`);
  const after = await computeCardIntegrity(root);

  expect(after).toBe(before);
});

test("computeCardIntegrity detects added or removed files", async () => {
  const root = await createTempRoot("card-int-");
  tempRoots.push(root);
  await scaffoldCardVersion(root);

  const before = await computeCardIntegrity(root);
  await writeFile(join(root, "skills", "polish", "extra.md"), "extra\n");
  const afterAdd = await computeCardIntegrity(root);
  expect(afterAdd).not.toBe(before);

  await rm(join(root, "skills", "polish", "extra.md"));
  const afterRemove = await computeCardIntegrity(root);
  expect(afterRemove).toBe(before);
});

test("resolveCard returns extracted tree integrity without legacy metadata files", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const versionDir = await publishCardWithSkills(fixture, { name: "@me/legacy", skills: ["polish"] });

  const resolved = await resolveCard(fixture.agentsDir, "@me/legacy@^1.0.0");

  expect(resolved.integrity.startsWith("sha256-")).toBe(true);
  expect(resolved.dir).toBe(versionDir);
  expect(existsSync(join(versionDir, "card.json"))).toBe(true);
  expect(existsSync(join(versionDir, ".integrity"))).toBe(false);
  expect(existsSync(join(fixture.agentsDir, "drwn", "cards", "@me", "legacy", "versions.json"))).toBe(false);
});
