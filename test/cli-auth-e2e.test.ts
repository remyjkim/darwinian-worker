// ABOUTME: Subprocess E2E tests for drwn auth commands against a fake analyzer backend.
// ABOUTME: Exercises the real CLI entrypoint, process env, HTTP boundaries, and credential files.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { readCredentials, writeCredentials } from "../cli/core/auth/credentials";
import { resolveCredentialsPath } from "../cli/core/paths";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];
const servers: Array<ReturnType<typeof Bun.serve>> = [];

interface AuthServerState {
  deviceCodeRequests: unknown[];
  tokenRequests: unknown[];
  sessionAuthHeaders: string[];
  signOutAuthHeaders: string[];
}

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.stop(true);
  }
  await cleanupTempRoots(tempRoots);
});

function startAuthServer(options: { pendingPolls?: number } = {}) {
  const pendingPolls = options.pendingPolls ?? 0;
  const state: AuthServerState = {
    deviceCodeRequests: [],
    tokenRequests: [],
    sessionAuthHeaders: [],
    signOutAuthHeaders: [],
  };

  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);

      if (request.method === "POST" && url.pathname === "/api/auth/device/code") {
        state.deviceCodeRequests.push(await request.json());
        return Response.json({
          device_code: "device-code",
          user_code: "ABCD-EFGH",
          verification_uri_complete: new URL("/device?user_code=ABCD-EFGH", request.url).toString(),
          expires_in: 600,
          interval: 1,
        });
      }

      if (request.method === "POST" && url.pathname === "/api/auth/device/token") {
        state.tokenRequests.push(await request.json());
        if (state.tokenRequests.length <= pendingPolls) {
          return Response.json({ error: "authorization_pending" }, { status: 400 });
        }
        return Response.json({
          access_token: "access-token",
          token_type: "Bearer",
          expires_in: 604800,
        });
      }

      if (request.method === "GET" && url.pathname === "/api/auth/session") {
        const auth = request.headers.get("authorization") ?? "";
        state.sessionAuthHeaders.push(auth);
        if (auth === "Bearer access-token") {
          return Response.json({
            user: { id: "u1", email: "cli-e2e@example.com" },
            session: { id: "s1", expiresAt: "2026-06-10T00:00:00Z" },
          });
        }
        if (auth === "Bearer env-token") {
          return Response.json({
            user: { id: "u2", email: "env-e2e@example.com" },
            session: { id: "s2", expiresAt: "2026-06-10T00:00:00Z" },
          });
        }
        if (auth === "Bearer null-session-token") {
          return Response.json(null);
        }
        return new Response("expired", { status: 401 });
      }

      if (request.method === "POST" && url.pathname === "/api/auth/sign-out") {
        state.signOutAuthHeaders.push(request.headers.get("authorization") ?? "");
        return new Response(null, { status: 204 });
      }

      return new Response("not found", { status: 404 });
    },
  });
  servers.push(server);
  return { apiUrl: `http://127.0.0.1:${server.port}`, state };
}

describe("auth CLI E2E", () => {
  test("login --json, stored whoami, and logout work through the real CLI process", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const { apiUrl, state } = startAuthServer({ pendingPolls: 1 });
    const env = { ...envFor(fixture), DRWN_ANALYZER_URL: apiUrl };

    const login = await runAgentsCli(["login", "--no-browser", "--json"], env);

    expect(login.exitCode).toBe(0);
    expect(login.stderr).toContain("To sign in, visit:");
    expect(login.stderr).toContain("Code: ABCD-EFGH");
    expect(JSON.parse(login.stdout)).toMatchObject({ email: "cli-e2e@example.com" });
    expect(state.deviceCodeRequests).toEqual([{ client_id: "drwn-cli" }]);
    expect(state.tokenRequests).toHaveLength(2);
    expect(state.tokenRequests.at(-1)).toMatchObject({
      device_code: "device-code",
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      client_id: "drwn-cli",
    });

    const credentialsPath = resolveCredentialsPath(fixture.agentsDir);
    expect((await stat(credentialsPath)).mode & 0o777).toBe(0o600);
    const onDisk = await Bun.file(credentialsPath).text();
    expect(onDisk).not.toContain("access-token");
    expect(JSON.parse(onDisk).algo).toBe("aes-256-gcm");
    const credentials = await readCredentials(credentialsPath);
    expect(credentials).toMatchObject({
      api_url: apiUrl,
      access_token: "access-token",
      user_email: "cli-e2e@example.com",
    });
    expect(Date.parse(credentials!.saved_at)).not.toBeNaN();

    const whoami = await runAgentsCli(["whoami", "--json"], envFor(fixture));
    expect(whoami.exitCode).toBe(0);
    expect(JSON.parse(whoami.stdout)).toMatchObject({
      email: "cli-e2e@example.com",
      api_url: apiUrl,
      saved_at: credentials!.saved_at,
      expires_at: "2026-06-10T00:00:00Z",
    });
    expect(state.sessionAuthHeaders).toContain("Bearer access-token");

    const logout = await runAgentsCli(["logout"], envFor(fixture));
    expect(logout.exitCode).toBe(0);
    expect(logout.stdout).toContain("Logged out. Credentials removed.");
    expect(state.signOutAuthHeaders).toEqual(["Bearer access-token"]);
    expect(await Bun.file(credentialsPath).exists()).toBe(false);

    const afterLogout = await runAgentsCli(["whoami"], envFor(fixture));
    expect(afterLogout.exitCode).toBe(1);
    expect(afterLogout.stderr).toContain("Not authenticated. Run `drwn login` first");
  });

  test("whoami env-token path bypasses credentials and maps invalid sessions", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const { apiUrl, state } = startAuthServer();
    const baseEnv = envFor(fixture);

    const valid = await runAgentsCli(["whoami", "--json"], {
      ...baseEnv,
      DRWN_TOKEN: "env-token",
      DRWN_ANALYZER_URL: apiUrl,
    });

    expect(valid.exitCode).toBe(0);
    expect(JSON.parse(valid.stdout)).toMatchObject({
      email: "env-e2e@example.com",
      api_url: apiUrl,
      expires_at: "2026-06-10T00:00:00Z",
    });
    expect(await Bun.file(resolveCredentialsPath(fixture.agentsDir)).exists()).toBe(false);

    const nullSession = await runAgentsCli(["whoami"], {
      ...baseEnv,
      DRWN_TOKEN: "null-session-token",
      DRWN_ANALYZER_URL: apiUrl,
    });
    expect(nullSession.exitCode).toBe(1);
    expect(nullSession.stderr).toContain("Session expired. Run `drwn login`.");

    const expired = await runAgentsCli(["whoami"], {
      ...baseEnv,
      DRWN_TOKEN: "expired-token",
      DRWN_ANALYZER_URL: apiUrl,
    });
    expect(expired.exitCode).toBe(1);
    expect(expired.stderr).toContain("Session expired. Run `drwn login`.");
    expect(state.sessionAuthHeaders).toEqual([
      "Bearer env-token",
      "Bearer null-session-token",
      "Bearer expired-token",
    ]);
  });

  test("missing analyzer config fails before credentials are written", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["login", "--no-browser"], envFor(fixture));

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(resolveCredentialsPath(fixture.agentsDir).replace("credentials.json", "config.json"));
    expect(result.stderr).toContain("DRWN_ANALYZER_URL");
    expect(await Bun.file(resolveCredentialsPath(fixture.agentsDir)).exists()).toBe(false);
  });

  test("logout removes stored credentials even when sign-out returns a server error", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const { apiUrl } = startAuthServer();
    const credentialsPath = resolveCredentialsPath(fixture.agentsDir);
    await mkdir(join(fixture.agentsDir, "drwn"), { recursive: true });
    await writeCredentials(credentialsPath, {
      api_url: `${apiUrl}/missing`,
      access_token: "access-token",
      user_email: "cli-e2e@example.com",
      saved_at: "2026-06-03T00:00:00Z",
    });

    const result = await runAgentsCli(["logout"], envFor(fixture));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Logged out. Credentials removed.");
    expect(await Bun.file(credentialsPath).exists()).toBe(false);
  });
});
