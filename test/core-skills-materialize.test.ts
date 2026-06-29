// ABOUTME: Migration + drift coverage for copy-based skill materialization through syncRepository.
// ABOUTME: A pre-upgrade symlink install converts to a copied directory; hand-edits trip drift protection.

import { afterEach, expect, test } from "bun:test";
import { lstatSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanupTempRoots, scaffoldCliFixture } from "./helpers";
import { syncRepository } from "../cli/core/sync";
import { loadWriteRecord, saveWriteRecord } from "../cli/core/write-record";
import { resolveGlobalWriteRecordPath } from "../cli/core/store-paths";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

function machineSyncOptions(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>, extra: Record<string, unknown> = {}) {
  return {
    repoRoot: fixture.repoRoot,
    agentsDir: fixture.agentsDir,
    homeDir: fixture.homeDir,
    cwd: fixture.repoRoot,
    skillsOnly: true,
    ...extra,
  };
}

test("migrates a pre-upgrade symlink skill install to a copied directory and stays idempotent", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
  tempRoots.push(fixture.root);
  const claudeAlpha = join(fixture.homeDir, ".claude", "skills", "alpha");
  const curatedAlpha = join(fixture.agentsDir, "skills", "alpha");

  // Simulate a pre-upgrade install: a downstream dir symlink plus a symlink-kind write-record.
  mkdirSync(join(fixture.homeDir, ".claude", "skills"), { recursive: true });
  symlinkSync(curatedAlpha, claudeAlpha, "dir");
  const recordPath = resolveGlobalWriteRecordPath(fixture.agentsDir);
  saveWriteRecord(recordPath, {
    writeRecordVersion: 1,
    lastWriteAt: "2026-01-01T00:00:00.000Z",
    lastWriteHarnessVersion: "0.0.0",
    managedPaths: [{ path: ".claude/skills/alpha", kind: "symlink", target: curatedAlpha }],
  });

  await syncRepository(machineSyncOptions(fixture));

  expect(lstatSync(claudeAlpha).isSymbolicLink()).toBe(false);
  expect(lstatSync(claudeAlpha).isDirectory()).toBe(true);
  expect(readFileSync(join(claudeAlpha, "SKILL.md"), "utf8")).toContain("alpha");

  const saved = loadWriteRecord(recordPath);
  const entry = saved?.managedPaths.find((path) => path.path === ".claude/skills/alpha");
  expect(entry?.kind).toBe("managed-directory");

  const second = await syncRepository(machineSyncOptions(fixture));
  expect(second.changes.some((change) => change.includes(".claude/skills/alpha"))).toBe(false);
});

test("refuses to overwrite a hand-edited copied skill without --force, succeeds with it", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
  tempRoots.push(fixture.root);
  const claudeAlpha = join(fixture.homeDir, ".claude", "skills", "alpha");

  await syncRepository(machineSyncOptions(fixture));
  writeFileSync(join(claudeAlpha, "SKILL.md"), "hand edited\n");

  await expect(syncRepository(machineSyncOptions(fixture))).rejects.toThrow(/drift/i);

  await syncRepository(machineSyncOptions(fixture, { force: true }));
  expect(readFileSync(join(claudeAlpha, "SKILL.md"), "utf8")).toContain("alpha");
});
