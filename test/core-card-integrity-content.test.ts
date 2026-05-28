// ABOUTME: Verifies card content-tree integrity hashing covers bundled files.
// ABOUTME: Protects the Wave 1 promise that the integrity field detects content drift.

import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
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

test("resolveCard recomputes and rewrites stale .integrity from a v1.1 manifest hash", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/legacy", skills: ["polish"] });
  const versionDir = join(fixture.agentsDir, "bgng", "cards", "@me", "legacy", "1.0.0");
  const manifest = JSON.parse(await Bun.file(join(versionDir, "card.json")).text());
  const legacyHash = `sha256-${createHash("sha256").update(JSON.stringify(manifest)).digest("hex")}`;
  await writeFile(join(versionDir, ".integrity"), `${legacyHash}\n`);
  const pkgIndexPath = join(fixture.agentsDir, "bgng", "cards", "@me", "legacy", "versions.json");
  const pkgIndex = JSON.parse(await Bun.file(pkgIndexPath).text());
  pkgIndex.versions[0].integrity = legacyHash;
  await writeFile(pkgIndexPath, JSON.stringify(pkgIndex, null, 2));

  const resolved = await resolveCard(fixture.agentsDir, "@me/legacy@^1.0.0");

  expect(resolved.integrity.startsWith("sha256-")).toBe(true);
  expect(resolved.integrity).not.toBe(legacyHash);
  expect((await Bun.file(join(versionDir, ".integrity")).text()).trim()).toBe(resolved.integrity);
  const reparsed = JSON.parse(await Bun.file(pkgIndexPath).text());
  expect(reparsed.versions[0].integrity).toBe(resolved.integrity);
});
