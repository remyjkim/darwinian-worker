// ABOUTME: Command-level tests for drwn login/logout/whoami.
// ABOUTME: Exercises Clipanion command wiring with injected network and browser dependencies.

import { afterEach, describe, expect, test } from "bun:test";
import { Cli } from "clipanion";
import { Writable } from "node:stream";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { LoginCommand } from "../cli/commands/auth/login";
import { LogoutCommand } from "../cli/commands/auth/logout";
import { WhoamiCommand } from "../cli/commands/auth/whoami";
import type { AgentsContext } from "../cli/context";
import { writeCredentials } from "../cli/core/auth/credentials";
import { resolveCredentialsPath } from "../cli/core/paths";
import { cleanupTempRoots, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

class CaptureStream extends Writable {
  chunks: Buffer[] = [];

  override _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    callback();
  }

  text() {
    return Buffer.concat(this.chunks).toString("utf8");
  }
}

afterEach(async () => {
  LoginCommand.testDeps = undefined;
  LogoutCommand.testDeps = undefined;
  WhoamiCommand.testDeps = undefined;
  await cleanupTempRoots(tempRoots);
});

async function runAuthCommand(
  args: string[],
  options?: {
    fixture?: Awaited<ReturnType<typeof scaffoldCliFixture>>;
    config?: Record<string, unknown>;
    cwd?: string;
  },
) {
  const fixture = options?.fixture ?? await scaffoldCliFixture();
  if (!options?.fixture) tempRoots.push(fixture.root);
  if (options?.config) {
    await mkdir(join(fixture.agentsDir, "drwn"), { recursive: true });
    await writeFile(join(fixture.agentsDir, "drwn", "config.json"), JSON.stringify(options.config, null, 2));
  }

  const stdout = new CaptureStream();
  const stderr = new CaptureStream();
  const context: AgentsContext = {
    repoRoot: fixture.repoRoot,
    agentsDir: fixture.agentsDir,
    homeDir: fixture.homeDir,
    cwd: options?.cwd ?? fixture.repoRoot,
    projectConfigPath: null,
    stdin: process.stdin,
    stdout,
    stderr,
    env: {},
    colorDepth: 1,
  };
  const cli = new Cli({ binaryName: "drwn", binaryLabel: "drwn", binaryVersion: "0.0.0" });
  cli.register(LoginCommand);
  cli.register(LogoutCommand);
  cli.register(WhoamiCommand);
  const exitCode = await cli.run(args, context);
  return { fixture, stdout: stdout.text(), stderr: stderr.text(), exitCode };
}

function deviceFlowFetch(): typeof fetch {
  return (async (url: string) => {
    if (url.endsWith("/api/auth/device/code")) {
      return Response.json({
        device_code: "dev",
        user_code: "ABCD",
        verification_uri_complete: "https://app.test/device?user_code=ABCD",
        expires_in: 600,
        interval: 1,
      });
    }
    if (url.endsWith("/api/auth/device/token")) {
      return Response.json({
        access_token: "tok",
        token_type: "Bearer",
        expires_in: 604800,
      });
    }
    if (url.endsWith("/api/auth/session")) {
      return Response.json({
        user: { id: "u", email: "x@y.z" },
        session: { id: "s", expiresAt: "2026-06-10T00:00:00Z" },
      });
    }
    throw new Error(`unexpected URL ${url}`);
  }) as unknown as typeof fetch;
}

describe("auth commands", () => {
  test("login reports missing analyzer apiUrl with config path and env var", async () => {
    LoginCommand.testDeps = { env: {} };

    const result = await runAuthCommand(["login"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(join(result.fixture.agentsDir, "drwn", "config.json"));
    expect(result.stderr).toContain("DRWN_ANALYZER_URL");
  });

  test("login completes device flow, opens browser, and writes 0600 credentials", async () => {
    const opened: string[] = [];
    LoginCommand.testDeps = {
      env: { DRWN_ANALYZER_URL: "https://api.test" },
      fetch: deviceFlowFetch(),
      sleep: async () => {},
      openBrowser: (url) => { opened.push(url); },
    };

    const result = await runAuthCommand(["login"]);
    const credentialsPath = resolveCredentialsPath(result.fixture.agentsDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Authenticated as x@y.z.");
    expect(opened).toEqual(["https://app.test/device?user_code=ABCD"]);
    expect((await stat(credentialsPath)).mode & 0o777).toBe(0o600);
    expect(JSON.parse(await Bun.file(credentialsPath).text())).toMatchObject({
      api_url: "https://api.test",
      access_token: "tok",
      user_email: "x@y.z",
    });
  });

  test("login --no-browser skips browser open", async () => {
    const opened: string[] = [];
    LoginCommand.testDeps = {
      env: { DRWN_ANALYZER_URL: "https://api.test" },
      fetch: deviceFlowFetch(),
      sleep: async () => {},
      openBrowser: (url) => { opened.push(url); },
    };

    const result = await runAuthCommand(["login", "--no-browser"]);

    expect(result.exitCode).toBe(0);
    expect(opened).toEqual([]);
  });

  test("logout removes credentials and best-effort signs out", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const called: string[] = [];
    LogoutCommand.testDeps = {
      fetch: (async (url: string) => {
        called.push(url);
        return new Response(null, { status: 204 });
      }) as unknown as typeof fetch,
    };
    const credentialsPath = resolveCredentialsPath(fixture.agentsDir);
    await writeCredentials(credentialsPath, {
      api_url: "https://api.test",
      access_token: "tok",
      user_email: "x@y.z",
      saved_at: "2026-06-03T00:00:00Z",
    });

    const result = await runAuthCommand(["logout"], { fixture });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Logged out. Credentials removed.");
    expect(await Bun.file(credentialsPath).exists()).toBe(false);
    expect(called).toEqual(["https://api.test/api/auth/sign-out"]);
  });

  test("logout reports not logged in when credentials are absent", async () => {
    const result = await runAuthCommand(["logout"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Not logged in.");
  });

  test("whoami uses env token and prints email", async () => {
    WhoamiCommand.testDeps = {
      env: { DRWN_TOKEN: "tok", DRWN_ANALYZER_URL: "https://api.test" },
      fetch: (async (url: string) => {
        expect(url).toBe("https://api.test/api/auth/session");
        return Response.json({
          user: { id: "u", email: "env@example.com" },
          session: { id: "s", expiresAt: "2026-06-10T00:00:00Z" },
        });
      }) as unknown as typeof fetch,
    };

    const result = await runAuthCommand(["whoami"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("env@example.com");
  });

  test("whoami reports not authenticated without env or credentials", async () => {
    WhoamiCommand.testDeps = { env: {} };

    const result = await runAuthCommand(["whoami"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Not authenticated.");
  });

  test("whoami reports expired session on null session", async () => {
    WhoamiCommand.testDeps = {
      env: { DRWN_TOKEN: "tok", DRWN_ANALYZER_URL: "https://api.test" },
      fetch: (async () => Response.json(null)) as unknown as typeof fetch,
    };

    const result = await runAuthCommand(["whoami"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Session expired. Run `drwn login`.");
  });
});
