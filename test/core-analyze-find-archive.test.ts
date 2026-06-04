// ABOUTME: Verifies newest session archive discovery for analyze sessions.
// ABOUTME: Protects the hybrid input model's default archive selection behavior.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findNewestArchive } from "../cli/core/analyze/find-archive";

let tmp: string | null = null;

afterEach(async () => {
  if (tmp) await rm(tmp, { recursive: true, force: true });
  tmp = null;
});

describe("findNewestArchive", () => {
  test("returns null for missing or empty dirs", async () => {
    expect(await findNewestArchive("/no/such/dir")).toBeNull();
    tmp = await mkdtemp(join(tmpdir(), "drwn-find-"));
    expect(await findNewestArchive(tmp)).toBeNull();
  });

  test("returns a single tar archive", async () => {
    tmp = await mkdtemp(join(tmpdir(), "drwn-find-"));
    const archive = join(tmp, "one.tar.gz");
    await writeFile(archive, "x");
    expect(await findNewestArchive(tmp)).toBe(archive);
  });

  test("returns highest mtime and ignores non-tar files", async () => {
    tmp = await mkdtemp(join(tmpdir(), "drwn-find-"));
    const oldArchive = join(tmp, "old.tar");
    const newArchive = join(tmp, "new.tgz");
    const ignored = join(tmp, "newer.zip");
    await writeFile(oldArchive, "x");
    await writeFile(newArchive, "x");
    await writeFile(ignored, "x");
    await utimes(oldArchive, new Date(1000), new Date(1000));
    await utimes(newArchive, new Date(2000), new Date(2000));
    await utimes(ignored, new Date(3000), new Date(3000));

    expect(await findNewestArchive(tmp)).toBe(newArchive);
  });
});
