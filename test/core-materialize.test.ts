// ABOUTME: Tests copy-based directory materialization and pointer-file writes.
// ABOUTME: Guards the OS-uniform primitives that replace skill symlinks on every platform.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { materializeDir, materializePointer } from "../cli/core/materialize";
import { hashManagedDirectory, type ManagedPath } from "../cli/core/write-record";
import type { SyncResult } from "../cli/core/types";

let root: string;

function freshResult(): SyncResult {
  return { changes: [], warnings: [], managedPaths: [] };
}

function makeSourceSkill(name: string): string {
  const source = join(root, "src", name);
  mkdirSync(join(source, "nested"), { recursive: true });
  writeFileSync(join(source, "SKILL.md"), `# ${name}\n`);
  writeFileSync(join(source, "nested", "extra.txt"), "payload\n");
  return source;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "materialize-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("materializeDir", () => {
  test("should copy nested files into the destination directory", () => {
    const source = makeSourceSkill("alpha");
    const dest = join(root, "out", "alpha");
    const record = materializeDir(source, dest, { dryRun: false, result: freshResult(), relPath: ".claude/skills/alpha" });

    expect(lstatSync(dest).isDirectory()).toBe(true);
    expect(readFileSync(join(dest, "SKILL.md"), "utf8")).toBe("# alpha\n");
    expect(readFileSync(join(dest, "nested", "extra.txt"), "utf8")).toBe("payload\n");
    expect(record).toEqual({ path: ".claude/skills/alpha", kind: "managed-directory", contentHash: hashManagedDirectory(dest) });
  });

  test("should be a no-op with no changes when the destination already matches", () => {
    const source = makeSourceSkill("alpha");
    const dest = join(root, "out", "alpha");
    materializeDir(source, dest, { dryRun: false, result: freshResult(), relPath: ".claude/skills/alpha" });

    const result = freshResult();
    materializeDir(source, dest, { dryRun: false, result, relPath: ".claude/skills/alpha" });
    expect(result.changes).toEqual([]);
  });

  test("should replace a symlink destination with a real directory", () => {
    const source = makeSourceSkill("alpha");
    const dest = join(root, "out", "alpha");
    mkdirSync(join(root, "out"), { recursive: true });
    symlinkSync(source, dest, "dir");

    const result = freshResult();
    materializeDir(source, dest, { dryRun: false, result, relPath: ".claude/skills/alpha" });
    expect(lstatSync(dest).isSymbolicLink()).toBe(false);
    expect(lstatSync(dest).isDirectory()).toBe(true);
    expect(result.changes.length).toBeGreaterThan(0);
  });

  test("should replace a drifted destination directory", () => {
    const source = makeSourceSkill("alpha");
    const dest = join(root, "out", "alpha");
    materializeDir(source, dest, { dryRun: false, result: freshResult(), relPath: ".claude/skills/alpha" });
    writeFileSync(join(dest, "SKILL.md"), "# drifted\n");

    const result = freshResult();
    const record = materializeDir(source, dest, { dryRun: false, result, relPath: ".claude/skills/alpha" });
    expect(readFileSync(join(dest, "SKILL.md"), "utf8")).toBe("# alpha\n");
    expect(result.changes.length).toBeGreaterThan(0);
    expect((record as Extract<ManagedPath, { kind: "managed-directory" }>).contentHash).toBe(hashManagedDirectory(dest));
  });

  test("should dereference a symlinked source file into a real file", () => {
    const source = join(root, "src", "beta");
    mkdirSync(source, { recursive: true });
    writeFileSync(join(root, "real-skill.md"), "# beta\n");
    symlinkSync(join(root, "real-skill.md"), join(source, "SKILL.md"), "file");
    const dest = join(root, "out", "beta");

    materializeDir(source, dest, { dryRun: false, result: freshResult(), relPath: ".claude/skills/beta" });
    expect(lstatSync(join(dest, "SKILL.md")).isSymbolicLink()).toBe(false);
    expect(readFileSync(join(dest, "SKILL.md"), "utf8")).toBe("# beta\n");
  });

  test("should not touch disk on dry-run and report the sentinel hash", () => {
    const source = makeSourceSkill("alpha");
    const dest = join(root, "out", "alpha");
    const result = freshResult();
    const record = materializeDir(source, dest, { dryRun: true, result, relPath: ".claude/skills/alpha" });

    expect(existsSync(dest)).toBe(false);
    expect(result.changes.length).toBeGreaterThan(0);
    expect((record as Extract<ManagedPath, { kind: "managed-directory" }>).contentHash).toBe("sha256-dry-run");
  });
});

describe("materializePointer", () => {
  test("should write the value with a trailing newline", () => {
    const dest = join(root, "store", "pkg", "current");
    const record = materializePointer(dest, "1.2.3", { dryRun: false, result: freshResult(), relPath: "store/pkg/current" });
    expect(readFileSync(dest, "utf8")).toBe("1.2.3\n");
    expect(lstatSync(dest).isFile()).toBe(true);
    expect(record.kind).toBe("managed-content");
  });

  test("should replace a pre-existing symlink with a pointer file", () => {
    const dir = join(root, "store", "pkg");
    mkdirSync(join(dir, "1.0.0"), { recursive: true });
    const dest = join(dir, "current");
    symlinkSync("1.0.0", dest, "dir");

    materializePointer(dest, "2.0.0", { dryRun: false, result: freshResult(), relPath: "store/pkg/current" });
    expect(lstatSync(dest).isSymbolicLink()).toBe(false);
    expect(readFileSync(dest, "utf8")).toBe("2.0.0\n");
  });
});
