// ABOUTME: Verifies drwn gitignore and vendor gitattributes authoring for new projects.
// ABOUTME: Protects committed vendor byte-exactness and local overlay gitignore hygiene.

import { afterEach, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ensureGitignoreEntries, ensureVendorGitattributes } from "../cli/core/git-hygiene";
import { cleanupTempRoots, createTempRoot, writeSupportedProjectConfig } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("ensureGitignoreEntries appends drwn block once and preserves user lines", async () => {
  const root = await createTempRoot("git-hygiene-ignore-");
  tempRoots.push(root);
  const gitignore = join(root, ".gitignore");
  await writeFile(gitignore, "node_modules/\n");

  await ensureGitignoreEntries(root);
  const first = await readFile(gitignore, "utf8");
  expect(first).toContain("node_modules/");
  expect(first).toContain("# drwn");
  expect(first).toContain("config.local.json");
  expect(first).toContain(".claude/skills/");

  await ensureGitignoreEntries(root);
  const second = await readFile(gitignore, "utf8");
  expect(second.match(/# drwn/g)?.length).toBe(1);
});

test("ensureGitignoreEntries rewrites drwn block contents in place", async () => {
  const root = await createTempRoot("git-hygiene-rewrite-");
  tempRoots.push(root);
  await writeSupportedProjectConfig(root, { committedSurfaces: true });
  await ensureGitignoreEntries(root);
  const first = await readFile(join(root, ".gitignore"), "utf8");
  expect(first).not.toContain(".claude/skills/");
  await writeSupportedProjectConfig(root);
  await ensureGitignoreEntries(root);
  const second = await readFile(join(root, ".gitignore"), "utf8");
  expect(second).toContain(".claude/skills/");
  expect(second.match(/# drwn/g)?.length).toBe(1);
});

test("ensureVendorGitattributes writes vendor hygiene attributes", async () => {
  const root = await createTempRoot("git-hygiene-attrs-");
  tempRoots.push(root);
  const path = await ensureVendorGitattributes(root);
  const contents = await readFile(path, "utf8");
  expect(contents).toContain("vendor/** -text");
  expect(contents).toContain("linguist-generated");
});
