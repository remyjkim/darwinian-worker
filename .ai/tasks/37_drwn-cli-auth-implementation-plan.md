# Task 37: Drwn CLI Auth Implementation Plan

**Status**: Implemented; automated verification complete; interactive browser E2E pending
**Created**: 2026-06-03
**Updated**: 2026-06-03
**Priority**: High
**Dependencies**: none (must complete and be verified before task 38 starts)
**References**: [analyses/56_drwn-cli-auth-target-architecture.md, analyses/57_drwn-cli-analyze-sessions-target-architecture.md, tasks/38_drwn-cli-analyze-sessions-implementation-plan.md, /Users/pureicis/dev/darwinian-harness-services/tools/recommend-skills/src/lib/auth.ts, /Users/pureicis/dev/darwinian-harness-services/tools/recommend-skills/src/lib/credentials.ts, /Users/pureicis/dev/darwinian-harness-services/tools/recommend-skills/src/commands/login.ts, cli/commands/export/sessions.ts, cli/core/paths.ts]

---

## Execution Summary (2026-06-03)

- Implemented `drwn login`, `drwn logout`, and `drwn whoami`, plus shared analyzer config, credentials, device-flow, token-resolution, HTTP error, schema, and browser-open helpers.
- Added `zod` as the only new dependency.
- Verified with focused auth tests, subprocess CLI auth E2E, full `bun test`, `bun run typecheck`, `bun run docs:build`, CLI help smoke, missing-config login smoke, local-backend device-code smoke, first-phase local-backend `login --no-browser --json` smoke, local-backend fake-token `whoami` smoke, and local-backend logout cleanup smoke against `http://localhost:8787`.
- Interactive browser login with Google approval is still a manual E2E check because it requires a real user sign-in.

## Objective

Add the auth surface to `drwn`: three top-level commands (`login`, `logout`, `whoami`), a shared device-flow client, an atomic 0600 credentials store at `~/.agents/drwn/credentials.json`, and an auth-resolution helper consumed by future commands. Match the verified contract documented in analysis 56.

## Success Criteria

- [ ] `drwn login` completes against the dev backend (`https://darwinian-harness-services-api-dev.dev-726.workers.dev`) end-to-end: browser opens, Google sign-in works, approve persists, terminal prints "Authenticated as <email>."
- [ ] `~/.agents/drwn/credentials.json` is created with mode `0600` containing `{ api_url, access_token, user_email, saved_at }`.
- [ ] `drwn whoami` against a fresh login prints the user's email.
- [ ] `drwn whoami` after the backend session is revoked (e.g. by `drwn logout` in another shell) prints "Session expired" and exits 1.
- [ ] `drwn logout` removes the credentials file and best-effort revokes the server session.
- [ ] `DRWN_TOKEN` + `DRWN_ANALYZER_URL` env vars bypass the credentials file for `drwn whoami`.
- [ ] Bare `drwn login` without an `analyzer.apiUrl` configured prints a precise error referencing both the config path and env var.
- [ ] All unit tests pass under `bun test`. `bun run typecheck` clean. No new ESLint warnings.
- [ ] No new npm dependencies beyond `zod`.

## Approach

Follow the verified `tools/recommend-skills/` reference, port to drwn's Clipanion + Bun + `BaseCommand` conventions, drop the `open` npm package in favor of `Bun.spawn`, and add `whoami`. Build the HTTP client layer in a way that `analyze` can extend without rewrites.

Strict TDD: write a failing test → implement → run test → refactor.

## Execution-Readiness Decisions

- Implement `loadAnalyzerConfig` before any command uses it. Do not defer config wiring to a later documentation/checkpoint phase.
- Do **not** add a packaged `analyzer.apiUrl` default to `registry/config.json` in this task. This keeps the "bare `drwn login` without config" error path testable. Manual dev-backend integration uses either `DRWN_ANALYZER_URL` or user config at `~/.agents/drwn/config.json`.
- If `loadAnalyzerConfig` uses `loadEffectiveConfig`, update the machine-config merge path so an `analyzer` section in the machine config is not dropped.
- `runDeviceFlow` should use the shared `AnalyzerClient` auth methods (`requestDeviceCode`, `pollDeviceToken`) rather than making raw `fetch` calls. This keeps auth and analyze on one HTTP-client seam.
- There is no ESLint script in this repo today. "No new ESLint warnings" means do not introduce lint tooling or warnings if a lint script exists by the time this task is executed.

## Implementation Plan

### Phase 1: Foundations (no commands yet)

#### Task 1.1: Add `zod` dependency

**Files:**
- Modify: `package.json`

**Steps:**

1. Run: `bun add zod`
2. Run: `bun test` to confirm no regressions.
3. Run: `bun run typecheck`.

**Checkpoint:** `zod` in `dependencies`; tests pass.

#### Task 1.2: Extend `CanonicalConfig` with `analyzer` section

**Files:**
- Modify: `cli/core/types.ts`

**Steps:**

1. Append to `CanonicalConfig`:

   ```ts
   analyzer?: {
     apiUrl?: string;
     clientId?: string;
   };
   ```

2. Run `bun run typecheck`.

**Checkpoint:** Type compiles. No runtime change.

#### Task 1.2a: Add analyzer config loader and preserve analyzer during machine-config merge

**Files:**
- Create: `cli/core/auth/config.ts`
- Modify: `cli/core/user-config.ts`
- Test: `test/core-auth-config.test.ts`
- Test: `test/core-user-config.test.ts` (extend existing merge coverage if needed)

**Goal:** `loadAnalyzerConfig(context)` returns `{ apiUrl?: string; clientId: string; configPath: string }` honoring this priority:
1. `DRWN_ANALYZER_URL` env var
2. Effective user/machine config `analyzer.apiUrl`
3. Packaged `registry/config.json` `analyzer.apiUrl` (supported for future defaults, but do not add one in this task)

`clientId` resolves from effective config `analyzer.clientId`, then packaged config, then `"drwn-cli"`.

**Required behavior:**
- Missing `apiUrl` is allowed at config-load time; commands decide whether it is fatal.
- Returned URLs are normalized by trimming trailing slashes.
- `loadAnalyzerConfig` exposes `configPath` (the active user config path or default `~/.agents/drwn/config.json`) so command errors can name the precise path.
- If the cards-era store is initialized and `loadEffectiveConfig` merges `machine.json` over packaged config, the merge must preserve `machineConfig.analyzer`.
- Keep `registry/config.json` unchanged unless a future product decision pins production defaults. For this task, tests should assert the missing-config login error still works without env/user config.

**Step 1: Write failing tests**

Cover:
- Env var wins over config.
- User/machine config `analyzer.apiUrl` is read.
- `clientId` defaults to `"drwn-cli"`.
- Missing `apiUrl` returns `undefined` plus the expected config path.
- Machine-config merge preserves `analyzer`.

**Step 2: Implement**

Implementation can call `loadConfig(context.repoRoot)` and `loadEffectiveConfig(repoConfig, context.agentsDir)`, provided `mergeMachineConfig` is extended:

```ts
merged.analyzer = {
  ...(merged.analyzer ?? {}),
  ...(machineConfig.analyzer ?? {}),
};
```

**Checkpoint:** Config tests green before any command work begins.

#### Task 1.3: Add path helper for credentials

**Files:**
- Modify: `cli/core/paths.ts`
- Test: `test/core-paths-credentials.test.ts`

**Step 1: Write failing test**

```ts
import { describe, expect, test } from "bun:test";
import { resolveCredentialsPath } from "../cli/core/paths";

describe("resolveCredentialsPath", () => {
  test("returns join(agentsDir, 'drwn', 'credentials.json')", () => {
    expect(resolveCredentialsPath("/u/.agents")).toBe("/u/.agents/drwn/credentials.json");
  });
});
```

**Step 2: Run — expect fail.**

**Step 3: Implement**

```ts
export function resolveCredentialsPath(agentsDir: string) {
  return join(resolveUserDrwnDir(agentsDir), "credentials.json");
}
```

**Step 4: Re-run, expect pass.**

**Checkpoint:** Path helper exported and tested.

#### Task 1.4: Create zod schemas for auth responses

**Files:**
- Create: `cli/core/http/schemas.ts`
- Test: `test/core-http-schemas.test.ts`

**Step 1: Write failing test**

```ts
import { describe, expect, test } from "bun:test";
import {
  DeviceCodeResponseSchema,
  DeviceTokenResponseSchema,
  SessionResponseSchema,
} from "../cli/core/http/schemas";

describe("DeviceCodeResponseSchema", () => {
  test("parses a valid response", () => {
    const ok = DeviceCodeResponseSchema.safeParse({
      device_code: "d", user_code: "ABCD",
      verification_uri_complete: "https://example.com/device?user_code=ABCD",
      expires_in: 600, interval: 5,
    });
    expect(ok.success).toBe(true);
  });

  test("defaults interval to 5 when missing", () => {
    const r = DeviceCodeResponseSchema.parse({
      device_code: "d", user_code: "X",
      verification_uri_complete: "https://example.com/device", expires_in: 600,
    });
    expect(r.interval).toBe(5);
  });
});

describe("DeviceTokenResponseSchema", () => {
  test("parses a Bearer success response", () => {
    const ok = DeviceTokenResponseSchema.safeParse({
      access_token: "t", token_type: "Bearer", expires_in: 604800,
    });
    expect(ok.success).toBe(true);
  });

  test("rejects non-Bearer token_type", () => {
    const r = DeviceTokenResponseSchema.safeParse({
      access_token: "t", token_type: "Mac", expires_in: 1,
    });
    expect(r.success).toBe(false);
  });
});

describe("SessionResponseSchema", () => {
  test("accepts null", () => {
    expect(SessionResponseSchema.safeParse(null).success).toBe(true);
  });

  test("accepts {user, session}", () => {
    const ok = SessionResponseSchema.safeParse({
      user: { id: "u", email: "x@y.z" },
      session: { id: "s", expiresAt: "2026-06-10T00:00:00Z" },
    });
    expect(ok.success).toBe(true);
  });
});
```

**Step 3: Implement schemas per analysis 56 appendix.**

**Checkpoint:** All schema tests green.

#### Task 1.5: Browser-open helper

**Files:**
- Create: `cli/core/auth/browser.ts`
- Test: `test/core-auth-browser.test.ts`

**Step 1: Write failing test**

```ts
import { describe, expect, test, spyOn } from "bun:test";
import { openBrowser } from "../cli/core/auth/browser";

describe("openBrowser", () => {
  test("uses 'open' argv on darwin", () => {
    const spy = spyOn(Bun, "spawn").mockReturnValue({} as unknown as ReturnType<typeof Bun.spawn>);
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    openBrowser("https://x.test");
    expect(spy.mock.calls[0][0]).toEqual(["open", "https://x.test"]);
    spy.mockRestore();
  });

  test("uses 'xdg-open' on linux", () => {
    const spy = spyOn(Bun, "spawn").mockReturnValue({} as unknown as ReturnType<typeof Bun.spawn>);
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    openBrowser("https://x.test");
    expect(spy.mock.calls[0][0]).toEqual(["xdg-open", "https://x.test"]);
    spy.mockRestore();
  });

  test("uses cmd start on win32", () => {
    const spy = spyOn(Bun, "spawn").mockReturnValue({} as unknown as ReturnType<typeof Bun.spawn>);
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    openBrowser("https://x.test");
    expect(spy.mock.calls[0][0]).toEqual(["cmd", "/c", "start", "", "https://x.test"]);
    spy.mockRestore();
  });

  test("swallows spawn errors", () => {
    const spy = spyOn(Bun, "spawn").mockImplementation(() => { throw new Error("boom"); });
    expect(() => openBrowser("https://x.test")).not.toThrow();
    spy.mockRestore();
  });
});
```

**Step 3: Implement** per analysis 56's "Cross-platform browser open" snippet.

**Checkpoint:** Tests green; macOS / Linux / Windows branches covered.

### Phase 2: Credential storage

#### Task 2.1: `credentials.ts` — read/write/delete with atomic write + 0600

**Files:**
- Create: `cli/core/auth/credentials.ts`
- Test: `test/core-auth-credentials.test.ts`

**Step 1: Write failing tests**

```ts
import { describe, expect, test, afterEach } from "bun:test";
import { mkdtemp, stat, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readCredentials,
  writeCredentials,
  deleteCredentials,
  type DrwnCredentials,
} from "../cli/core/auth/credentials";

let tmp: string;
afterEach(async () => { if (tmp) await rm(tmp, { recursive: true, force: true }); });

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

  test("writeCredentials is atomic (no temp file left behind)", async () => {
    tmp = await mkdtemp(join(tmpdir(), "drwn-cred-"));
    const path = join(tmp, "credentials.json");
    await writeCredentials(path, sample);
    const entries = (await Bun.file(tmp).exists()) ? [] : [];
    const files = await import("node:fs/promises").then((m) => m.readdir(tmp));
    expect(files.filter((f) => f.includes("tmp"))).toEqual([]);
    expect(files).toContain("credentials.json");
  });
});
```

**Step 3: Implement**

```ts
// cli/core/auth/credentials.ts
// ABOUTME: Atomic read/write/delete for the drwn CLI bearer-token credentials file.
// ABOUTME: Mode 0600; missing or malformed files are treated as "not logged in".

import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";

export interface DrwnCredentials {
  api_url: string;
  access_token: string;
  user_email: string;
  saved_at: string;
}

function isCredentials(v: unknown): v is DrwnCredentials {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.api_url === "string" &&
    typeof r.access_token === "string" &&
    typeof r.user_email === "string" &&
    typeof r.saved_at === "string"
  );
}

export async function readCredentials(path: string): Promise<DrwnCredentials | null> {
  let raw: string;
  try { raw = await fs.readFile(path, "utf8"); }
  catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  try {
    const parsed = JSON.parse(raw);
    return isCredentials(parsed) ? parsed : null;
  } catch { return null; }
}

export async function writeCredentials(path: string, creds: DrwnCredentials): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true });
  const tmp = join(dirname(path), `.credentials.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(creds, null, 2), { mode: 0o600 });
  await fs.chmod(tmp, 0o600);
  await fs.rename(tmp, path);
}

export async function deleteCredentials(path: string): Promise<void> {
  try { await fs.unlink(path); }
  catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}
```

**Checkpoint:** All tests green; manually verify mode 0600 with `ls -l`.

#### Task 2.2: `resolve-token.ts` — env-var > stored chain

**Files:**
- Create: `cli/core/auth/resolve-token.ts`
- Test: `test/core-auth-resolve-token.test.ts`

**Step 1: Write failing tests**

```ts
import { describe, expect, test } from "bun:test";
import { resolveToken } from "../cli/core/auth/resolve-token";

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
    // arrange tmp credentials file
    // ...
    const result = await resolveToken({ credentialsPath: tmpPath, env: {} });
    expect(result).toEqual({ token: "tok", apiUrl: "https://api.test" });
  });

  test("returns null when no env vars and no credentials", async () => {
    const result = await resolveToken({ credentialsPath: "/no/such/path", env: {} });
    expect(result).toBeNull();
  });
});
```

**Step 3: Implement**

```ts
// cli/core/auth/resolve-token.ts
// ABOUTME: Resolves a bearer token from DRWN_TOKEN+DRWN_ANALYZER_URL env vars or the stored credentials file.

import { readCredentials } from "./credentials";

export interface ResolveTokenInput {
  credentialsPath: string;
  env: Partial<Record<"DRWN_TOKEN" | "DRWN_ANALYZER_URL", string>>;
}

export interface ResolvedAuth { token: string; apiUrl: string; }

export async function resolveToken(input: ResolveTokenInput): Promise<ResolvedAuth | null> {
  if (input.env.DRWN_TOKEN && input.env.DRWN_ANALYZER_URL) {
    return { token: input.env.DRWN_TOKEN, apiUrl: input.env.DRWN_ANALYZER_URL };
  }
  if (input.env.DRWN_TOKEN && !input.env.DRWN_ANALYZER_URL) return null;
  const creds = await readCredentials(input.credentialsPath);
  if (creds) return { token: creds.access_token, apiUrl: creds.api_url };
  return null;
}
```

**Checkpoint:** All four cases green.

### Phase 3: HTTP client + device flow

#### Task 3.1: `analyzer-client.ts` — auth methods

**Files:**
- Create: `cli/core/http/analyzer-client.ts`
- Create: `cli/core/http/errors.ts`
- Test: `test/core-http-analyzer-client-auth.test.ts`

**Step 1: Write failing tests for `requestDeviceCode`, `pollDeviceToken`, `getSession`, `signOut`.**

Cover: success path, 401 → `AuthExpiredError`, 4xx with `{error: "..."}` body, 5xx → `ServerError`.

**Step 3: Implement**

```ts
// cli/core/http/errors.ts
export class AuthExpiredError extends Error {
  constructor() { super("auth_expired"); this.name = "AuthExpiredError"; }
}
export class ServerError extends Error {
  constructor(message: string, public status: number) { super(message); this.name = "ServerError"; }
}

// cli/core/http/analyzer-client.ts
// ABOUTME: HTTP client for the analyzer backend. Auth methods + (added by task 38) upload/getJob.
// ABOUTME: Validates responses with zod schemas; throws AuthExpiredError on 401, ServerError on 5xx.

import {
  DeviceCodeResponseSchema, DeviceTokenResponseSchema, SessionResponseSchema,
  type DeviceCodeResponse, type DeviceTokenResponse, type SessionResponse,
} from "./schemas";
import { AuthExpiredError, ServerError } from "./errors";

export type DeviceTokenPollResult =
  | { kind: "success"; token: DeviceTokenResponse }
  | { kind: "error"; error: string };

export interface AnalyzerClient {
  requestDeviceCode(clientId: string): Promise<DeviceCodeResponse>;
  pollDeviceToken(deviceCode: string, clientId: string): Promise<DeviceTokenPollResult>;
  getSession(token: string): Promise<SessionResponse>;
  signOut(token: string): Promise<void>;
}

export function createAnalyzerClient(apiUrl: string, fetcher: typeof fetch = fetch): AnalyzerClient {
  return {
    async requestDeviceCode(clientId) {
      const r = await fetcher(`${apiUrl}/api/auth/device/code`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ client_id: clientId }),
      });
      if (!r.ok) throw new ServerError(await r.text(), r.status);
      return DeviceCodeResponseSchema.parse(await r.json());
    },

    async pollDeviceToken(deviceCode, clientId) {
      const r = await fetcher(`${apiUrl}/api/auth/device/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          device_code: deviceCode,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          client_id: clientId,
        }),
      });
      if (r.ok) {
        return { kind: "success", token: DeviceTokenResponseSchema.parse(await r.json()) };
      }
      let err = "unknown_error";
      try {
        const body = (await r.json()) as { error?: string };
        if (body?.error) err = body.error;
      } catch {}
      return { kind: "error", error: err };
    },

    async getSession(token) {
      const r = await fetcher(`${apiUrl}/api/auth/session`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (r.status === 401) throw new AuthExpiredError();
      if (!r.ok) throw new ServerError(await r.text(), r.status);
      return SessionResponseSchema.parse(await r.json());
    },

    async signOut(token) {
      try {
        await fetcher(`${apiUrl}/api/auth/sign-out`, {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
        });
      } catch { /* best-effort */ }
    },
  };
}
```

**Checkpoint:** All HTTP-method tests green.

#### Task 3.2: `device-flow.ts` — the polling loop

**Files:**
- Create: `cli/core/auth/device-flow.ts`
- Test: `test/core-auth-device-flow.test.ts`

**Step 1: Write failing tests** covering each error branch and the happy path. Inject `client`, `sleep`, `now`, and `onUserAction`.

Branches:
- success after one poll
- `authorization_pending` then success
- `slow_down` doubles interval
- `expired_token` throws
- `access_denied` throws
- unknown error throws with the error string
- expires_in expiration throws timeout message

**Step 3: Implement** per analysis 56's device-flow semantics, but use this repo's shared client seam:

```ts
export interface RunDeviceFlowInput {
  client: Pick<AnalyzerClient, "requestDeviceCode" | "pollDeviceToken">;
  clientId: string;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  onUserAction: (info: { verification_uri_complete: string; user_code: string }) => void;
}
```

Algorithm:
1. `const code = await client.requestDeviceCode(clientId)`.
2. Call `onUserAction({ verification_uri_complete: code.verification_uri_complete, user_code: code.user_code })`.
3. Poll with `client.pollDeviceToken(code.device_code, clientId)`.
4. On `{ kind: "success" }`, return the token.
5. On `authorization_pending`, continue.
6. On `slow_down`, double `interval`.
7. On `expired_token`, `access_denied`, unknown error, or local expiry, throw the user-facing messages from analysis 56.

Top of file: a comment explaining the contract is verified against better-auth@1.6.9.

**Checkpoint:** All seven branches covered.

### Phase 4: Commands

#### Task 4.1: `login` command

**Files:**
- Create: `cli/commands/auth/login.ts`
- Test: `test/commands-auth-login.test.ts`

**Step 1: Failing tests** — happy path, missing apiUrl, `--no-browser` skips spawn, device-code response printed, credentials saved.

**Step 3: Implement** the command per analysis 56's "drwn login flow".

Key wiring:

```ts
// cli/commands/auth/login.ts
import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { resolveCredentialsPath } from "../../core/paths";
import { writeCredentials } from "../../core/auth/credentials";
import { runDeviceFlow } from "../../core/auth/device-flow";
import { openBrowser } from "../../core/auth/browser";
import { createAnalyzerClient } from "../../core/http/analyzer-client";
import { loadAnalyzerConfig } from "../../core/auth/config";

export class LoginCommand extends BaseCommand {
  static override paths = [["login"]];
  static override usage = BaseCommand.Usage({
    category: "Auth",
    description: "Authenticate with the Darwinian analyzer via the device flow.",
    examples: [["Sign in", "drwn login"], ["Print URL only (no browser)", "drwn login --no-browser"]],
  });

  noBrowser = Option.Boolean("--no-browser", false, { description: "Print the URL only." });
  json = Option.Boolean("--json", false);

  async execute() {
    const cfg = await loadAnalyzerConfig(this.context);
    if (!cfg.apiUrl) {
      this.context.stderr.write(`No analyzer.apiUrl configured. Set it in ${cfg.configPath} or DRWN_ANALYZER_URL.\n`);
      return 1;
    }
    const client = createAnalyzerClient(cfg.apiUrl);
    const clientId = cfg.clientId ?? "drwn-cli";

    try {
      const token = await runDeviceFlow({
        client, clientId,
        onUserAction: ({ verification_uri_complete, user_code }) => {
          this.context.stdout.write(
            `To sign in, visit:\n  ${verification_uri_complete}\nCode: ${user_code}\nWaiting for authorization...\n`,
          );
          if (!this.noBrowser) openBrowser(verification_uri_complete);
        },
      });

      const session = await client.getSession(token.access_token);
      if (!session?.user) {
        this.context.stderr.write("Sign-in succeeded but session lookup failed. Please report this.\n");
        return 1;
      }

      const credPath = resolveCredentialsPath(this.context.agentsDir);
      const savedAt = new Date().toISOString();
      await writeCredentials(credPath, {
        api_url: cfg.apiUrl,
        access_token: token.access_token,
        user_email: session.user.email,
        saved_at: savedAt,
      });

      if (this.json) {
        this.context.stdout.write(JSON.stringify({ email: session.user.email, saved_at: savedAt }) + "\n");
      } else {
        this.context.stdout.write(`Authenticated as ${session.user.email}. Credentials saved to ${credPath}.\n`);
      }
      return 0;
    } catch (err) {
      this.context.stderr.write(`${(err as Error).message}\n`);
      return 1;
    }
  }
}
```

`loadAnalyzerConfig` was implemented in Task 1.2a. It reads the effective user/machine config if present, supports packaged defaults for future use, applies `DRWN_ANALYZER_URL`, trims trailing slashes, and exposes the active config path for error text.

**Checkpoint:** Command works end-to-end against dev backend with manual test.

#### Task 4.2: `logout` command

**Files:**
- Create: `cli/commands/auth/logout.ts`
- Test: `test/commands-auth-logout.test.ts`

**Implement** per analysis 56's "drwn logout flow":

- Read creds; if absent, print "Not logged in.", exit 0.
- POST sign-out (best-effort).
- Delete creds file.
- Print "Logged out. Credentials removed.", exit 0.

**Checkpoint:** Manual test: login → logout → whoami says "not authenticated".

#### Task 4.3: `whoami` command

**Files:**
- Create: `cli/commands/auth/whoami.ts`
- Test: `test/commands-auth-whoami.test.ts`

**Implement** per analysis 56's "drwn whoami flow". Use `resolveToken` (env-var-aware). On 401 or `null` session, print "Session expired" and exit 1.

JSON mode emits `{ email, api_url, saved_at }`. When the credentials file is absent but env-var auth is used, `saved_at` is omitted.

**Checkpoint:** Tests green; manual: with env vars, `whoami` works without ever logging in.

#### Task 4.4: Register commands in `cli/index.ts`

**Steps:**

1. Import:
   ```ts
   import { LoginCommand } from "./commands/auth/login";
   import { LogoutCommand } from "./commands/auth/logout";
   import { WhoamiCommand } from "./commands/auth/whoami";
   ```
2. Register near the top-level `cli.register(...)` block.
3. Run `bun cli/index.ts --help`; verify Auth category appears.
4. Run `bun test` and `bun run typecheck`.

**Checkpoint:** Help output shows the three commands; type-check clean.

### Phase 5: Config verification

#### Task 5.1: Verify config wiring completed before command implementation

**Files:**
- No new files expected if Task 1.2a was completed correctly.

**Verification:**

- `cli/core/auth/config.ts` exists and is covered by `test/core-auth-config.test.ts`.
- `cli/core/user-config.ts` merge logic preserves `analyzer`.
- `registry/config.json` is unchanged unless a product/defaults decision has been explicitly made.
- `drwn login` with no env var and no analyzer config prints the missing-config error naming `~/.agents/drwn/config.json` and `DRWN_ANALYZER_URL`.

**Checkpoint:** No deferred config work remains before manual integration.

### Phase 6: Documentation

#### Task 6.1: Update `docs/cli-quickref.md`

Add an "Auth" section showing `drwn login`, `drwn logout`, `drwn whoami` examples.

#### Task 6.2: Add `docs-docusaurus/docs/reference/cli/login.md` (+ logout, whoami)

Mirror the page style of `docs-docusaurus/docs/reference/cli/card.md`.

#### Task 6.3: Update `.ai/knowledges/10_drwn-cli-architecture.md`

Mention the auth layer briefly with a pointer to analysis 56.

### Phase 7: Integration verification

#### Task 7.1: End-to-end against dev backend

Manual steps:

1. Set `analyzer.apiUrl` to `https://darwinian-harness-services-api-dev.dev-726.workers.dev` in `~/.agents/drwn/config.json`, or run commands with `DRWN_ANALYZER_URL=https://darwinian-harness-services-api-dev.dev-726.workers.dev`.
2. `bun cli/index.ts login` → verify browser opens, Google sign-in works, page shows approval, terminal completes.
3. `cat ~/.agents/drwn/credentials.json` → verify shape and mode 0600.
4. `bun cli/index.ts whoami` → verify email printed.
5. `bun cli/index.ts logout` → verify wipe.
6. `bun cli/index.ts whoami` → verify "Not authenticated."

#### Task 7.2: `DRWN_TOKEN` smoke

1. `drwn login`, then read the access token from credentials.
2. `drwn logout` (wipes file).
3. `DRWN_TOKEN=<token> DRWN_ANALYZER_URL=<url> drwn whoami` → expect email printed.

#### Task 7.3: Expired-token smoke

1. Revoke session via web app sign-out.
2. `drwn whoami` → expect "Session expired."

## Acceptance Criteria

- [ ] All unit tests pass: `bun test`.
- [ ] Type-check clean: `bun run typecheck`.
- [ ] All three manual integration checks (Task 7.x) pass against dev backend.
- [ ] No new npm dependencies beyond `zod`.
- [ ] Help output includes `Auth` category.
- [ ] `docs/cli-quickref.md` updated.
- [ ] Docusaurus reference pages added.

## Testing Strategy

Per analysis 56 §"Testing Strategy". All unit tests inject `fetch`, `sleep`, and `Bun.spawn` as appropriate. CI does not require live backend connectivity.

## Risks & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Better Auth bumps a major version with changed device-flow contract | Low | High | Pinned reference in `device-flow.ts` comment; the comment names the verified version. Any future bump triggers manual re-verification. |
| Browser auto-open fails silently on user's system | Medium | Low | URL is always printed first; `--no-browser` flag exists. |
| User mis-permissions `~/.agents/drwn/credentials.json` | Low | High | We write 0600 unconditionally via tmp + chmod + rename. |
| Atomic write leaves tmp files on crash | Low | Low | tmp names include pid + timestamp; periodic dir scan / cleanup would be a future hardening task. |
| Token leaks via shell history when using `DRWN_TOKEN=...` | Medium | Medium | Document the risk in the CLI auth page; recommend `.envrc` / CI secret stores. |
| Different `apiUrl` in env var than in stored credentials | Low | Medium | `resolveToken` returns env-var pair as-is; the env-var path is "explicit, do exactly this." |

## Notes

- Implementation order within each phase: failing test → implement → green → next item. Phases run sequentially.
- The reference implementation in `darwinian-harness-services/tools/recommend-skills/` is the *behavioral* oracle. When in doubt about an edge case, check what it does — it's known to work against the same backend.
- After task 7.x passes, this plan is "complete." Task 38 (analyze) can start. Both plans live as `.ai/tasks/` documents; mark the planning doc's Status as `Completed` and add a `_completion_` summary per `rules/00_docs_usage.md` once merged.
