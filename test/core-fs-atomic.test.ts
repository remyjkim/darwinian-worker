// ABOUTME: Verifies atomic file writes used for durable store state updates.
// ABOUTME: Ensures successful writes do not leave temp files behind.

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeAtomically } from "../cli/core/fs";

describe("writeAtomically", () => {
  test("writes content to the target path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "drwn-atomic-"));
    const target = join(dir, "subdir", "file.txt");

    await writeAtomically(target, "hello world");

    expect(existsSync(target)).toBe(true);
    expect(await readFile(target, "utf8")).toBe("hello world");
  });

  test("leaves no temp files after success", async () => {
    const dir = await mkdtemp(join(tmpdir(), "drwn-atomic-"));
    const target = join(dir, "file.txt");

    await writeAtomically(target, "x");

    expect(await readdir(dir)).toEqual(["file.txt"]);
  });

  test("overwrites existing file atomically", async () => {
    const dir = await mkdtemp(join(tmpdir(), "drwn-atomic-"));
    const target = join(dir, "file.txt");

    await writeAtomically(target, "first");
    await writeAtomically(target, "second");

    expect(await readFile(target, "utf8")).toBe("second");
  });
});
