// ABOUTME: Verifies bearer-token resolution precedence for authenticated CLI commands.
// ABOUTME: Keeps CI env-var auth isolated from persisted local credentials.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeCredentials } from "../cli/core/auth/credentials";
import { resolveToken } from "../cli/core/auth/resolve-token";

let tmp: string | null = null;

afterEach(async () => {
  if (tmp) await rm(tmp, { recursive: true, force: true });
  tmp = null;
});

describe("resolveToken", () => {
  test("returns env-var token when DRWN_TOKEN + DRWN_ANALYZER_URL set", async () => {
    const result = await resolveToken({
      credentialsPath: "/no/such/path",
      env: { DRWN_TOKEN: "t", DRWN_ANALYZER_URL: "https://api.test" },
    });
    expect(result).toEqual({ token: "t", apiUrl: "https://api.test" });
  });

  test("returns null when DRWN_TOKEN set but DRWN_ANALYZER_URL missing", async () => {
    const result = await resolveToken({
      credentialsPath: "/no/such/path",
      env: { DRWN_TOKEN: "t" },
    });
    expect(result).toBeNull();
  });

  test("returns stored credential when env vars absent", async () => {
    tmp = await mkdtemp(join(tmpdir(), "drwn-resolve-"));
    const credentialsPath = join(tmp, "credentials.json");
    await writeCredentials(credentialsPath, {
      api_url: "https://api.test",
      access_token: "tok",
      user_email: "x@y.z",
      saved_at: "2026-06-03T00:00:00Z",
    });
    const result = await resolveToken({ credentialsPath, env: {} });
    expect(result).toEqual({ token: "tok", apiUrl: "https://api.test" });
  });

  test("returns null when no env vars and no credentials", async () => {
    const result = await resolveToken({ credentialsPath: "/no/such/path", env: {} });
    expect(result).toBeNull();
  });
});
