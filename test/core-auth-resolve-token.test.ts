// ABOUTME: Verifies bearer-token resolution precedence for authenticated CLI commands.
// ABOUTME: Keeps CI env-var auth isolated from persisted local credentials.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeCredentials } from "../cli/core/auth/credentials";
import { resolveToken } from "../cli/core/auth/resolve-token";

let tmp: string | null = null;

function b64(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function fakeJwt(email = "x@y.z", exp = Math.floor(Date.now() / 1000) + 900): string {
  return `${b64({ alg: "none" })}.${b64({
    iss: "https://auth.darwiniantools.com/api/auth",
    aud: "https://api.darwiniantools.com",
    sub: "user_123",
    email,
    exp,
  })}.sig`;
}

afterEach(async () => {
  if (tmp) await rm(tmp, { recursive: true, force: true });
  tmp = null;
});

describe("resolveToken", () => {
  test("returns env-var token when DRWN_TOKEN + DRWN_ANALYZER_URL set", async () => {
    const result = await resolveToken({
      credentialsPath: "/no/such/path",
      env: { DRWN_TOKEN: fakeJwt(), DRWN_ANALYZER_URL: "https://api.test" },
    });
    expect(result).toMatchObject({ source: "env", apiUrl: "https://api.test" });
  });

  test("returns env token without requiring analyzer URL", async () => {
    const result = await resolveToken({
      credentialsPath: "/no/such/path",
      env: { DRWN_TOKEN: fakeJwt() },
    });
    expect(result).toMatchObject({ source: "env" });
  });

  test("returns stored credential when env vars absent", async () => {
    tmp = await mkdtemp(join(tmpdir(), "drwn-resolve-"));
    const credentialsPath = join(tmp, "credentials.json");
    await writeCredentials(credentialsPath, {
      version: 2,
      issuer: "https://auth.darwiniantools.com/api/auth",
      clientId: "drwn-cli",
      resource: "https://api.darwiniantools.com",
      accessToken: fakeJwt(),
      refreshToken: "refresh-1",
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
      user_email: "x@y.z",
      saved_at: "2026-06-03T00:00:00Z",
    });
    const result = await resolveToken({ credentialsPath, env: {} });
    expect(result).toMatchObject({ source: "stored" });
  });

  test("returns null when no env vars and no credentials", async () => {
    const result = await resolveToken({ credentialsPath: "/no/such/path", env: {} });
    expect(result).toBeNull();
  });
});
