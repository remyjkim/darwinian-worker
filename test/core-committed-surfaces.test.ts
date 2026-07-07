// ABOUTME: Verifies committedSurfaces opt-in reads project config correctly.
// ABOUTME: Guards projection-surface gitignore omission and block rewrite behavior.

import { afterEach, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildDesiredGitignoreEntries, ensureGitignoreEntries } from "../cli/core/git-hygiene";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const tempRoots: string[] = [];
afterEach(async () => cleanupTempRoots(tempRoots));

test("committedSurfacesEnabled reads project config flag", async () => {
  const root = await createTempRoot("committed-surfaces-");
  tempRoots.push(root);
  await mkdir(join(root, ".agents", "drwn"), { recursive: true });
  await writeFile(join(root, ".agents", "drwn", "config.json"), `${JSON.stringify({ version: 1, committedSurfaces: true }, null, 2)}\n`);
  const { committedSurfacesEnabled } = await import("../cli/core/migrate-vendor");
  expect(await committedSurfacesEnabled(root)).toBe(true);
});

test("committedSurfaces omits projection surfaces from drwn gitignore block", async () => {
  const root = await createTempRoot("committed-surfaces-block-");
  tempRoots.push(root);
  await mkdir(join(root, ".agents", "drwn"), { recursive: true });
  await writeFile(join(root, ".agents", "drwn", "config.json"), `${JSON.stringify({ version: 1, committedSurfaces: true }, null, 2)}\n`);
  const entries = await buildDesiredGitignoreEntries(root);
  expect(entries).toContain(".agents/drwn/generated/");
  expect(entries).not.toContain(".claude/skills/");
  expect(entries).not.toContain(".cursor/");
  expect(entries).not.toContain(".mcp.json");
});

test("ensureGitignoreEntries rewrites drwn block when committedSurfaces toggles", async () => {
  const root = await createTempRoot("committed-surfaces-toggle-");
  tempRoots.push(root);
  await mkdir(join(root, ".agents", "drwn"), { recursive: true });
  await writeFile(join(root, ".agents", "drwn", "config.json"), `${JSON.stringify({ version: 1 }, null, 2)}\n`);
  await ensureGitignoreEntries(root);
  const first = await readFile(join(root, ".gitignore"), "utf8");
  expect(first).toContain(".claude/skills/");

  await writeFile(join(root, ".agents", "drwn", "config.json"), `${JSON.stringify({ version: 1, committedSurfaces: true }, null, 2)}\n`);
  await ensureGitignoreEntries(root);
  const second = await readFile(join(root, ".gitignore"), "utf8");
  expect(second).toContain("# drwn");
  expect(second).not.toContain(".claude/skills/");
  expect(second).toContain(".agents/drwn/generated/");
});
