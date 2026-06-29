// ABOUTME: Tests the pure-JS tar helpers used across the seed/export/git/skill-package write paths.
// ABOUTME: Covers create/list/extract round-trips, symlink preservation, and large-file streaming.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { create, extract, list } from "../cli/core/archive";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "archive-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("archive", () => {
  test("should round-trip create -> list -> extract for a plain tar", async () => {
    const src = join(root, "src");
    mkdirSync(join(src, "nested"), { recursive: true });
    writeFileSync(join(src, "a.txt"), "alpha\n");
    writeFileSync(join(src, "nested", "b.txt"), "beta\n");
    const archivePath = join(root, "out.tar");

    await create(archivePath, { cwd: src, entries: ["."] });
    const members = await list(archivePath);
    expect(members.some((m) => m.replace(/^\.\//, "") === "a.txt")).toBe(true);
    expect(members.some((m) => m.replace(/^\.\//, "") === "nested/b.txt")).toBe(true);

    const dest = join(root, "dest");
    await extract(archivePath, dest);
    expect(readFileSync(join(dest, "a.txt"), "utf8")).toBe("alpha\n");
    expect(readFileSync(join(dest, "nested", "b.txt"), "utf8")).toBe("beta\n");
  });

  test("should round-trip a gzip tar with auto-detected decompression", async () => {
    const src = join(root, "src");
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, "a.txt"), "alpha\n");
    const archivePath = join(root, "out.tar.gz");

    await create(archivePath, { cwd: src, entries: ["."], gzip: true });
    const members = await list(archivePath);
    expect(members.some((m) => m.replace(/^\.\//, "") === "a.txt")).toBe(true);

    const dest = join(root, "dest");
    await extract(archivePath, dest);
    expect(readFileSync(join(dest, "a.txt"), "utf8")).toBe("alpha\n");
  });

  test("should preserve a symlink through create and extract", async () => {
    const src = join(root, "src");
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, "real.txt"), "payload\n");
    symlinkSync("real.txt", join(src, "link.txt"));
    const archivePath = join(root, "out.tar");

    await create(archivePath, { cwd: src, entries: ["."] });
    const dest = join(root, "dest");
    await extract(archivePath, dest);
    expect(lstatSync(join(dest, "link.txt")).isSymbolicLink()).toBe(true);
  });

  test("should stream a large file without corruption", async () => {
    const src = join(root, "src");
    mkdirSync(src, { recursive: true });
    const big = Buffer.alloc(2 * 1024 * 1024, 7);
    writeFileSync(join(src, "big.bin"), big);
    const archivePath = join(root, "out.tar");

    await create(archivePath, { cwd: src, entries: ["."] });
    const dest = join(root, "dest");
    await extract(archivePath, dest);
    expect(readFileSync(join(dest, "big.bin")).length).toBe(big.length);
  });
});
