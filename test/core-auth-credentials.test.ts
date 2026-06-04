// ABOUTME: Verifies drwn analyzer credential storage semantics.
// ABOUTME: Protects atomic writes, owner-only permissions, and tolerant reads.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  deleteCredentials,
  readCredentials,
  writeCredentials,
  type DrwnCredentials,
} from "../cli/core/auth/credentials";

let tmp: string | null = null;

afterEach(async () => {
  if (tmp) await rm(tmp, { recursive: true, force: true });
  tmp = null;
});

const sample: DrwnCredentials = {
  api_url: "https://api.test",
  access_token: "tok",
  user_email: "x@y.z",
  saved_at: "2026-06-03T00:00:00Z",
};

describe("credentials", () => {
  test("writeCredentials creates file with mode 0600", async () => {
    tmp = await mkdtemp(join(tmpdir(), "drwn-cred-"));
    const path = join(tmp, "credentials.json");
    await writeCredentials(path, sample);
    const s = await stat(path);
    expect((s.mode & 0o777).toString(8)).toBe("600");
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(sample);
  });

  test("readCredentials returns null when missing", async () => {
    expect(await readCredentials("/no/such/path.json")).toBeNull();
  });

  test("readCredentials returns null when malformed", async () => {
    tmp = await mkdtemp(join(tmpdir(), "drwn-cred-"));
    const path = join(tmp, "credentials.json");
    await Bun.write(path, "{ not json");
    expect(await readCredentials(path)).toBeNull();
  });

  test("deleteCredentials is a no-op when missing", async () => {
    await expect(deleteCredentials("/no/such/path.json")).resolves.toBeUndefined();
  });

  test("deleteCredentials removes existing file", async () => {
    tmp = await mkdtemp(join(tmpdir(), "drwn-cred-"));
    const path = join(tmp, "credentials.json");
    await writeCredentials(path, sample);
    await deleteCredentials(path);
    expect(await readCredentials(path)).toBeNull();
  });

  test("writeCredentials is atomic and leaves no temp file after success", async () => {
    tmp = await mkdtemp(join(tmpdir(), "drwn-cred-"));
    const path = join(tmp, "credentials.json");
    await writeCredentials(path, sample);
    const files = await readdir(tmp);
    expect(files.filter((f) => f.includes("tmp"))).toEqual([]);
    expect(files).toContain("credentials.json");
  });
});
