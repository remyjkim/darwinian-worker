// ABOUTME: Verifies config.local.json overlay read/write behavior.
// ABOUTME: Ensures gitignore hygiene without touching committed config.

import { afterEach, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const tempRoots: string[] = [];
afterEach(async () => cleanupTempRoots(tempRoots));

test("writeConfigLocal creates gitignored overlay file", async () => {
  const root = await createTempRoot("config-local-");
  tempRoots.push(root);
  const { writeConfigLocal, loadConfigLocal } = await import("../cli/core/config-local");
  await writeConfigLocal(root, {
    schema: "drwn.project-local",
    schemaVersion: 1,
    sourceOverrides: { "@me/x": "file:/tmp/x" },
  });
  const loaded = await loadConfigLocal(root);
  expect(loaded?.sourceOverrides?.["@me/x"]).toBe("file:/tmp/x");
  const gitignore = await readFile(join(root, ".gitignore"), "utf8");
  expect(gitignore).toContain("config.local.json");
});

test("ensureCardLockLocalEntryFromSource writes file-origin local lock entries", async () => {
  const root = await createTempRoot("config-local-lock-");
  tempRoots.push(root);
  const agentsDir = join(root, "agents");
  const sourceDir = join(root, "source");
  const { mkdir: mk, writeFile: wf } = await import("node:fs/promises");
  await mk(join(sourceDir, "skills", "alpha"), { recursive: true });
  await wf(join(sourceDir, "card.json"), `${JSON.stringify({ name: "@me/local", version: "0.1.0", skills: { include: ["alpha"] } }, null, 2)}\n`);
  await wf(join(sourceDir, "skills", "alpha", "SKILL.md"), "---\nname: alpha\ndescription: alpha\n---\n");
  const { ensureCardLockLocalEntryFromSource, loadCardLockLocal } = await import("../cli/core/config-local");
  await ensureCardLockLocalEntryFromSource(root, agentsDir, "@me/local", sourceDir);
  const local = await loadCardLockLocal(root);
  expect(local?.[0]?.origin).toBe("file");
  expect(local?.[0]?.name).toBe("@me/local");
  expect(local?.[0]?.treeSha).toBeUndefined();
});
