// ABOUTME: Verifies local archive validation before analyze upload.
// ABOUTME: Ensures fast, clear failures for missing, empty, wrong, or oversized files.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateArchive } from "../cli/core/analyze/validate-archive";

let tmp: string | null = null;

afterEach(async () => {
  if (tmp) await rm(tmp, { recursive: true, force: true });
  tmp = null;
});

describe("validateArchive", () => {
  test("rejects missing, empty, unsupported, and oversized files", async () => {
    await expect(validateArchive("/no/such.tar.gz", 100)).rejects.toThrow("Archive not found");

    tmp = await mkdtemp(join(tmpdir(), "drwn-val-"));
    const empty = join(tmp, "empty.tar.gz");
    await writeFile(empty, "");
    await expect(validateArchive(empty, 100)).rejects.toThrow("Archive is empty");

    const zip = join(tmp, "foo.zip");
    await writeFile(zip, "x");
    await expect(validateArchive(zip, 100)).rejects.toThrow("Unsupported archive extension");

    const big = join(tmp, "big.tar");
    await writeFile(big, "xxxx");
    await expect(validateArchive(big, 3)).rejects.toThrow("Archive exceeds limit");
  });

  test("accepts tar, tar.gz, and tgz", async () => {
    tmp = await mkdtemp(join(tmpdir(), "drwn-val-"));
    for (const name of ["x.tar", "x.tar.gz", "x.tgz"]) {
      const archive = join(tmp, name);
      await writeFile(archive, "x");
      const info = await validateArchive(archive, 10);
      expect(info.path).toBe(archive);
      expect(info.size).toBe(1);
    }
  });

  test("uses actual size", async () => {
    tmp = await mkdtemp(join(tmpdir(), "drwn-val-"));
    const archive = join(tmp, "x.tar.gz");
    await writeFile(archive, "x");
    await truncate(archive, 5);
    expect((await validateArchive(archive, 5)).size).toBe(5);
  });
});
