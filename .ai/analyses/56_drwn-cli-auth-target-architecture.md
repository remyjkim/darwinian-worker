# Drwn CLI Auth Target Architecture

**Date**: 2026-06-03
**Status**: Draft
**References**: [analyses/21_analyzer_integration.md, analyses/22_analyzer_cli_implementation_plan.md, analyses/57_drwn-cli-analyze-sessions-target-architecture.md, tasks/37_drwn-cli-auth-implementation-plan.md, /Users/pureicis/dev/darwinian-harness-services/.ai/knowledges/device_flow_consumer_contract.md, /Users/pureicis/dev/darwinian-harness-services/tools/recommend-skills/src/lib/auth.ts, /Users/pureicis/dev/darwinian-harness-services/tools/recommend-skills/src/lib/credentials.ts, /Users/pureicis/dev/darwinian-harness-services/backend/src/auth/better-auth-instance.ts, /Users/pureicis/dev/darwinian-harness-services/backend/src/auth/device-page.ts, cli/context.ts, cli/core/paths.ts, cli/commands/export/sessions.ts]

---

## Executive Summary

`drwn` will adopt OAuth 2.0 Device Authorization Grant (RFC 8628) as its CLI auth model, talking to the existing Darwinian Harness Services backend that ships Better Auth with the `bearer()` and `deviceAuthorization()` plugins. The CLI gains three top-level commands — `drwn login`, `drwn logout`, `drwn whoami` — plus a shared credential store at `~/.agents/drwn/credentials.json` (0600) and an auth resolution chain (`DRWN_TOKEN` env var → stored credential → unauthenticated).

The design is verified against the canonical reference implementation in `darwinian-harness-services/tools/recommend-skills/`, which is the existing internal CLI consumer of the same backend and was validated against `better-auth@1.6.9`. The contract is also codified in the services repo's `device_flow_consumer_contract.md`. By matching that contract exactly, `drwn` inherits a known-working auth surface and avoids re-litigating polling semantics, error codes, or session handling.

This document is the target state for the auth slice in isolation. It is a precondition for `drwn analyze sessions` (see analysis 57), which is the first command that requires authenticated requests. Sequencing is enforced: auth ships first.

---

## Context

### Why now

`drwn export sessions` already builds tarballs of Claude / Codex session logs locally. The next step — `drwn analyze sessions` — uploads those tarballs to a backend that returns an analysis URL. That backend gates every interesting route behind a Better Auth bearer token. The CLI currently has no HTTP client, no credential storage, and no auth commands. Building the analyze command without an auth surface would force users into a brittle env-var-only flow, which is fine for CI but unworkable for the everyday developer-on-laptop case.

### Why device flow

Three constraints make device flow the right primitive:

1. **No localhost listener**: The CLI runs on developer laptops behind NATs and corporate networks; an OAuth redirect URI to `http://localhost:<port>` is fragile and often blocked.
2. **No client secret in CLI**: CLIs cannot hold a confidential OAuth client secret. Device flow is the OAuth-blessed answer for public clients.
3. **Backend already speaks it**: `backend/src/auth/better-auth-instance.ts` already registers `deviceAuthorization({ verificationUri })` and `bearer()`. The endpoints exist and are exercised by `tools/recommend-skills/` today.

### Scope

This architecture covers:

- The three commands: `drwn login`, `drwn logout`, `drwn whoami`.
- Credential storage and atomic on-disk semantics.
- Auth resolution order across env var and stored credential.
- The HTTP client layer for auth endpoints and a shared bearer-token call wrapper analyze will reuse.
- New config schema fields (`analyzer.apiUrl`, `analyzer.clientId`).
- Error UX and exit codes.
- Testing strategy (unit + manual integration; no live-server CI dependency).

Out of scope: the analyze command itself (covered by analysis 57), the upload contract, and the report-URL composition.

### Constraints inherited from the project

- Runtime: Bun (matches `cli/commands/export/sessions.ts` which uses `Bun.spawn`).
- Command framework: Clipanion 4 (same as the reference recommend-skills CLI).
- Context shape: `AgentsContext { repoRoot, agentsDir, homeDir, cwd, projectConfigPath }`.
- No new runtime dependencies beyond what's strictly required (the project leans on Bun primitives + `zod` for validation).
- All new code follows the project's ABOUTME-comment convention (`cli/core/paths.ts`, `cli/commands/base.ts` for examples).

---

## Investigation

### The backend's auth surface

`backend/src/auth/better-auth-instance.ts` constructs Better Auth with the `bearer()` and `deviceAuthorization()` plugins. The `verificationUri` is computed as `new URL("/device", env.APP_BASE_URL ?? env.AUTH_BASE_URL)`, meaning the URL the CLI shows to the user lands on the frontend's `/device` route.

`backend/src/app.ts` mounts the Better Auth handler at `GET|POST /api/auth/*`. The CORS layer (`app.use("/api/*", cors(...))`) restricts browser origins via `CORS_ORIGINS` but does not block non-browser CLI requests (no `Origin` header → no preflight). Auth middleware (`createAuthMiddleware`) sets `c.var.identity` based on `auth.api.getSession({ headers })` — when an `Authorization: Bearer <token>` header is present, the `bearer()` plugin resolves it to the underlying session.

### Device flow contracts (verified)

The reference implementation at `tools/recommend-skills/src/lib/auth.ts` documents at the top: *"Verified against better-auth@1.6.9 deviceAuthorization plugin source. Error dispatch is on response BODY.error, not HTTP status."* The verified contracts:

**Request a device code:**

```http
POST /api/auth/device/code
Content-Type: application/json

{ "client_id": "drwn-cli" }
```

**Response:**

```json
{
  "device_code": "<opaque>",
  "user_code": "ABCD-EFGH",
  "verification_uri_complete": "https://app.darwiniantools.com/device?user_code=ABCD-EFGH",
  "expires_in": 600,
  "interval": 5
}
```

Note: Better Auth does **not** return a separate `verification_uri` in this response — only `verification_uri_complete`. The CLI must use that URL directly. (The prior `21_analyzer_integration.md` assumed both fields existed; this is corrected here.)

**Poll for token:**

```http
POST /api/auth/device/token
Content-Type: application/json

{
  "device_code": "<opaque>",
  "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
  "client_id": "drwn-cli"
}
```

**Success response (HTTP 200):**

```json
{
  "access_token": "<bearer token>",
  "token_type": "Bearer",
  "expires_in": 604800
}
```

**Pending / error responses (HTTP 400, body shape):**

```json
{ "error": "authorization_pending" | "slow_down" | "expired_token" | "access_denied" | <other> }
```

CLI behavior per error code:

| Code | Action |
|---|---|
| `authorization_pending` | Sleep `interval` seconds, poll again. |
| `slow_down` | **Double** `interval`, then poll. |
| `expired_token` | Abort with "Code expired. Run `drwn login` again." Exit 1. |
| `access_denied` | Abort with "Authorization denied in browser." Exit 1. |
| Anything else | Treat as hard auth failure; print the code and exit 1. |

The CLI also stops polling when `Date.now() > start + expires_in*1000`, even before the server says `expired_token` (defense-in-depth against a stalled server).

### The /device approval page

`backend/src/auth/device-page.ts` server-renders an HTML page that:

1. Reads `user_code` from the query string (escaped).
2. Calls `GET /api/auth/session` to check whether the user has a browser session.
3. If unauthenticated, redirects through `GET /api/auth/google?callbackURL=<this page>` (Google OAuth).
4. If authenticated, shows an "Approve" button that calls `POST /api/auth/device/approve` with `{ userCode }`.

The CLI never touches `/api/auth/device/approve` — that endpoint is browser-only and relies on cookie credentials. The CLI's job is to display `verification_uri_complete` and (optionally) open the browser to it; everything else is browser-side.

Note that the backend `GET /device` route on the API origin redirects requests to `APP_BASE_URL` if the request origin differs. So a CLI that prints `https://api.darwiniantools.com/device?user_code=...` would still land the user on the app correctly. We still prefer to use `verification_uri_complete` as returned by the server — that already points at the app origin via `APP_BASE_URL`.

### Identity resolution on protected routes

`packages/identity-better-auth/src/better-auth-resolver.ts` calls `auth.api.getSession({ headers: req.headers })`. Better Auth's `bearer()` plugin extracts `Authorization: Bearer <token>`, resolves it to a session row, and the resolver maps that to `{ userId, email, source: "session" }`. The middleware at `packages/identity-better-auth/src/middleware.ts` then sets `c.var.identity`. All `/api/analyze`, `/api/jobs/*`, `/api/reports/*`, `/api/session-logs/*` routes check `identity?.userId` and 401 if missing.

Session lifetime is Better Auth's default (7 days unless overridden). When the access token expires, `getSession` returns null, the middleware sets identity to null, and protected routes return 401. The CLI's response to 401 is "Your session has expired. Run `drwn login` again."

### `GET /api/auth/session` returns `null` when unauth

A subtle but important detail from `tools/recommend-skills/src/lib/api.ts`: when there is no valid session, this endpoint returns the JSON value `null`, **not** `{user: null}`. The CLI's session-fetch code must guard with `data?.user` (optional chaining), not `data.user`.

### Sign-out

`POST /api/auth/sign-out` with `Authorization: Bearer <token>` revokes the underlying session on the server. The reference treats this as best-effort: errors are swallowed because the local credential deletion happens regardless.

### Existing CLI patterns to reuse

- **Context shape**: `cli/context.ts` exposes `agentsDir` (default `~/.agents`), which combined with `resolveUserDrwnDir(agentsDir)` (`cli/core/paths.ts`) gives `~/.agents/drwn`. Credentials go at `~/.agents/drwn/credentials.json`.
- **Command framework**: `cli/commands/base.ts` exports `BaseCommand extends Command<AgentsContext>`. All new commands extend this.
- **Process spawning**: `cli/commands/export/sessions.ts` uses Bun-native spawning. The browser-open helper will use `Bun.spawn` rather than introduce a new dependency.
- **No HTTP today**: There is no existing `cli/core/http.ts`. We introduce one as part of this work, sized to support the analyze command's needs in addition to auth.

### Recommend-skills as the model

`darwinian-harness-services/tools/recommend-skills/` is a Clipanion 4 CLI that already implements the full device flow against this exact backend. The credentials file lives at `~/.darwinian/credentials.json` with shape `{ api_url, access_token, user_email, saved_at }`. There is no `whoami` command in that reference (only `login`, `logout`, and a `status` command). `drwn` will:

- Mirror the credentials shape exactly. Server is the source of truth for token validity; we do not persist expiry.
- Mirror the polling loop semantics exactly.
- Add a `whoami` command on top, which hits `GET /api/auth/session` to confirm the stored token is still valid and prints the user's email.
- Replace the `open` npm dependency with `Bun.spawn` per-platform.

---

## Findings

1. **Backend is ready.** All three device endpoints (`/code`, `/token`, `/approve`) plus `/session` and `/sign-out` are mounted and exercised by a working reference. No backend changes are required for the CLI to integrate.

2. **The right CLI client model is a thin HTTP wrapper.** The auth endpoints expect JSON bodies and return JSON responses with stable shapes. Validation via `zod` (already proposed for analyze) is sufficient. No SDK or generated client is warranted.

3. **Credentials are simple by design.** The verified shape is intentionally minimal. Local expiry tracking is an attractive nuisance — it adds a clock-skew failure mode without removing the need to handle 401s.

4. **Browser open is platform-conditional.** macOS `open`, Linux `xdg-open`, Windows `start`. `Bun.spawn` handles all three without a dependency. Detection via `process.platform`.

5. **Polling correctness depends on `slow_down` doubling.** The prior `21_analyzer_integration.md` had this wrong (it said "+5s"). The verified reference doubles. We follow the verified contract.

6. **The CLI must tolerate `null` from `/api/auth/session`.** Anything less is a bug; the reference notes this explicitly with a comment.

7. **Sign-out is best-effort.** If the backend is unreachable at logout time, we still wipe local credentials. The user's expectation is "logout works locally."

8. **Config additions are minimal.** Only `analyzer.apiUrl` and `analyzer.clientId` are needed for auth. The webBaseUrl arrives with analyze. Env overrides: `DRWN_ANALYZER_URL` and `DRWN_TOKEN`.

---

## Target Architecture

### Commands

```
drwn login                  Authenticate via the device flow.
  --no-browser              Print the URL only; do not auto-open.
  --json                    Emit structured JSON to stdout (success: {email, saved_at}).
drwn logout                 Revoke server session (best-effort), wipe local credentials.
drwn whoami                 Print the current authenticated identity. Validates against the server.
  --json                    Emit {email, api_url, saved_at}.
```

Top-level placement matches existing drwn commands (`drwn init`, `drwn status`, `drwn doctor`).

### `drwn login` flow

```text
1. Resolve apiUrl  = DRWN_ANALYZER_URL ?? config.analyzer.apiUrl
   Resolve clientId = config.analyzer.clientId ?? "drwn-cli"
   If apiUrl is missing, exit with "No analyzer.apiUrl configured."

2. POST {apiUrl}/api/auth/device/code  body { client_id }
   → { device_code, user_code, verification_uri_complete, expires_in, interval }

3. Print to stdout:
     To sign in, visit:
       <verification_uri_complete>
     Code: <user_code>
     Waiting for authorization...

4. Unless --no-browser, attempt Bun.spawn(<platform-open>, [<url>]) (errors ignored).

5. Loop until expires_in elapsed:
     await sleep(interval * 1000)
     POST {apiUrl}/api/auth/device/token body { device_code, grant_type, client_id }
     On 200 → break with access_token
     On 400 body.error switch:
       authorization_pending → continue
       slow_down → interval *= 2; continue
       expired_token → exit 1 with "Code expired. Run `drwn login` again."
       access_denied → exit 1 with "Authorization denied in browser."
       other → exit 1 with `Authentication failed: ${error}`

6. GET {apiUrl}/api/auth/session with Authorization: Bearer <access_token>
   → null is an error here (we just got a token)
   → { user: { email, ... } }

7. Write {apiUrl, access_token, user_email, saved_at} to ~/.agents/drwn/credentials.json (mode 0600)
   via atomic write (tmpfile + rename).

8. Print: "Authenticated as <email>. Credentials saved to <path>."
   Exit 0.
```

### `drwn logout` flow

```text
1. Read ~/.agents/drwn/credentials.json. If absent, print "Not logged in." Exit 0.
2. POST {api_url}/api/auth/sign-out with Authorization: Bearer <access_token>.
   Swallow any error.
3. Delete the credentials file.
4. Print "Logged out. Credentials removed." Exit 0.
```

### `drwn whoami` flow

```text
1. Resolve token via resolveToken() (env var > stored credential).
2. If no token, exit 1 with "Not authenticated. Run `drwn login`."
3. GET {apiUrl}/api/auth/session with Authorization: Bearer <token>.
4. If response is null OR 401, exit 1 with "Session expired. Run `drwn login`."
5. Print "<email>" (or {email, api_url, saved_at} when --json).
   Exit 0.
```

### Auth resolution order

A single function `resolveToken(context): Promise<{ token: string; apiUrl: string } | null>`:

1. If `process.env.DRWN_TOKEN` is set AND `process.env.DRWN_ANALYZER_URL` is set → return `{ token, apiUrl }`. (We require the URL alongside the env-var token because the env-var path is the CI/CD path and we don't want to silently fall back to a config value.)
2. Else: read credentials file. If present, return `{ token: access_token, apiUrl: api_url }`.
3. Else: return `null`.

Analyze and any future authenticated command imports this same function. The CLI does **not** silently re-resolve the API URL from config when an env var is provided — that ambiguity has caused outages in other tools.

### Credentials file

Path: `~/.agents/drwn/credentials.json` (computed via `join(resolveUserDrwnDir(agentsDir), "credentials.json")`).

Mode: `0600` (owner read/write only).

Schema:

```json
{
  "api_url": "https://darwinian-harness-services-api-dev.dev-726.workers.dev",
  "access_token": "<opaque bearer token>",
  "user_email": "remy@example.com",
  "saved_at": "2026-06-03T18:00:00.000Z"
}
```

Write semantics: write to `~/.agents/drwn/.credentials.<pid>.tmp`, `chmod 0600`, `rename` to the final path. This prevents partial writes from corrupting an existing session if the process is killed mid-write.

Read semantics: `JSON.parse`, type-guard with a hand-written predicate (matching the reference). Any malformed file is treated as "not logged in."

We do **not** store `expires_in` or compute an `expiresAt`. The signal "this token is invalid" is a 401 from the server, period.

### Config schema additions

`cli/core/types.ts`'s `CanonicalConfig` gains an optional section:

```ts
analyzer?: {
  apiUrl?: string;
  clientId?: string;
};
```

Both fields are optional at the type level so existing configs don't break. The auth commands surface a clear error if `apiUrl` is unresolved at runtime.

### Environment variable contract

| Variable | Purpose | Required when |
|---|---|---|
| `DRWN_ANALYZER_URL` | Base URL of the analyzer API | Login: never (config preferred). Other auth commands: only when combined with `DRWN_TOKEN`. |
| `DRWN_TOKEN` | Pre-acquired bearer token | CI/CD scenarios. Bypasses the credential file. Must be accompanied by `DRWN_ANALYZER_URL`. |

The two env vars together let CI run `drwn analyze sessions ...` without any prior login. They do not bypass auth — they substitute for it.

### HTTP client layer

A new module `cli/core/http/analyzer-client.ts` exports:

```ts
export interface AnalyzerClient {
  requestDeviceCode(clientId: string): Promise<DeviceCodeResponse>;
  pollDeviceToken(deviceCode: string, clientId: string): Promise<DeviceTokenPollResult>;
  getSession(token: string): Promise<SessionUser | null>;
  signOut(token: string): Promise<void>;
}

export function createAnalyzerClient(apiUrl: string, fetcher?: typeof fetch): AnalyzerClient;
```

Where `DeviceTokenPollResult = { kind: "success"; token: DeviceTokenResponse } | { kind: "error"; error: string }` so the poll loop can switch on the error code without throwing.

Validation: each response is parsed through a `zod` schema before return. Schema failures throw with a "Server returned an unexpected response" message.

This same module will gain `upload`, `getJob`, `getReport` methods in analyze (see analysis 57). Sharing the module avoids a second HTTP layer.

### Error UX

| Scenario | User-visible message | Exit code |
|---|---|---|
| `apiUrl` unresolved | `No analyzer.apiUrl configured. Add it to ~/.agents/drwn/config.json or set DRWN_ANALYZER_URL.` | 1 |
| Network error reaching backend | `Could not reach analyzer at <url>: <message>` | 1 |
| 5xx during login | `Server error during sign-in (<status>). Try again later.` | 1 |
| `expired_token` from poll | `Code expired. Run drwn login again.` | 1 |
| `access_denied` from poll | `Authorization denied in browser.` | 1 |
| Polling timeout (local) | `Sign-in timed out after <expires_in>s. Try again.` | 1 |
| 401 on whoami | `Session expired. Run drwn login.` | 1 |
| Logout without credentials | `Not logged in.` | 0 |
| Successful login | `Authenticated as <email>. Credentials saved to <path>.` | 0 |
| Successful logout | `Logged out. Credentials removed.` | 0 |

### Cross-platform browser open

```ts
function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin" ? ["open", url] :
    process.platform === "win32" ? ["cmd", "/c", "start", "", url] :
    ["xdg-open", url];
  try {
    Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" });
  } catch {
    // best-effort
  }
}
```

`--no-browser` skips the call entirely. Spawn errors are swallowed because the URL has already been printed.

### File layout

```
cli/
├── commands/
│   ├── auth/
│   │   ├── login.ts
│   │   ├── logout.ts
│   │   └── whoami.ts
│   └── ...
├── core/
│   ├── auth/
│   │   ├── credentials.ts          # read/write/delete, atomic + 0600
│   │   ├── device-flow.ts          # runDeviceFlow polling loop
│   │   ├── resolve-token.ts        # env-var > stored credential
│   │   └── browser.ts              # cross-platform openBrowser
│   ├── http/
│   │   ├── analyzer-client.ts      # auth + (later) analyze methods
│   │   └── schemas.ts              # zod schemas for all server responses
│   └── ...
```

`commands/auth/*` keeps the auth surface together. Core modules are isolated so analyze can reuse `analyzer-client.ts`, `resolve-token.ts`, and `schemas.ts` without dragging in command code.

### Registration

`cli/index.ts` registers the three commands top-level:

```ts
cli.register(LoginCommand);
cli.register(LogoutCommand);
cli.register(WhoamiCommand);
```

The `Auth` category gets its own slot in help output.

---

## Testing Strategy

| Layer | What | How |
|---|---|---|
| Unit | `device-flow.ts` polling loop | Inject `fetch` and `sleep`. Test each error code branch: `authorization_pending` → continue, `slow_down` → interval doubles, `expired_token` → throws, `access_denied` → throws, success → returns token. |
| Unit | `credentials.ts` round-trip | Write, read, verify shape; assert mode 0600 via `fs.stat`; verify atomic write doesn't leave temp files on failure. |
| Unit | `resolve-token.ts` precedence | Env-var with URL → returned. Env-var without URL → null. No env-var, credentials present → returned. No env-var, no credentials → null. |
| Unit | `analyzer-client.ts` schemas | `DeviceCodeResponse`, `DeviceTokenResponse`, `SessionResponse` parse valid examples and reject malformed. Test `null` from `/api/auth/session`. |
| Unit | `browser.ts` platform detection | Stub `process.platform` and `Bun.spawn`; assert correct argv per platform; assert spawn errors are swallowed. |
| Unit | Command happy paths | Construct each command, inject test deps (mock fetch, in-memory credentials store), exercise `execute()`. Mirrors `commands/login.test.ts` in the recommend-skills reference. |
| Integration (manual) | Full login against dev backend | Run `drwn login` against `https://darwinian-harness-services-api-dev.dev-726.workers.dev`, complete browser approval, verify credentials saved with 0600. |
| Integration (manual) | `whoami` after login | Run, verify email matches, verify exit 0. |
| Integration (manual) | `logout` then `whoami` | Verify server-side session is revoked (`whoami` reports session expired). |
| Smoke (CI) | No live network | All HTTP tests use injected `fetch`. CI does not require backend availability. |

The reference recommend-skills CLI has matching `login.test.ts` and `logout.test.ts`; we adopt the same dep-injection-via-static-property pattern (`LoginCommand.testDeps`) where helpful, but prefer constructor-style injection when possible.

---

## Recommendations

1. **Ship auth before analyze, in a separate PR.** Auth has a stable contract and finite surface area. Bundling it with analyze risks scope creep and obscures regressions.

2. **Treat the device-flow contract as load-bearing.** It is verified against a specific Better Auth version. Add a comment at the top of `device-flow.ts` calling that out (matching the recommend-skills reference) so future maintainers don't change polling semantics without re-verifying.

3. **Do not invent new error messages.** Pull strings from the reference recommend-skills CLI where it's already battle-tested.

4. **Add `Bun.spawn` browser-open as a small, internal utility.** Keep it under 30 lines. Resist the urge to add the `open` npm package — the trade-off doesn't pencil out for three platforms and one URL.

5. **Keep `whoami` honest.** It must hit the server. A local-only `whoami` reports stale state and erodes trust the first time a user is silently signed out.

6. **Plan for a follow-up `drwn auth status` later** if user feedback demands a "what's the storage path, when was I logged in, is my token still valid" report. Don't ship it now; `whoami` covers the 95% case.

---

## Open Questions

| Question | Notes |
|---|---|
| What's the production `apiUrl` and `webBaseUrl`? | `api.darwiniantools.com` appears in `better-auth-instance.ts` `allowedHosts`. App URL is likely `app.darwiniantools.com`, but we should confirm before pinning in the packaged `config.json`. For now, dev `darwinian-harness-services-api-dev.dev-726.workers.dev` is the documented default. |
| Should `drwn login` write to project config or user config? | User config (`~/.agents/drwn/config.json`) is the right level — auth is a per-user concern, not per-project. The packaged config can hold the dev `apiUrl`; the user config overrides for prod. |
| Should the `Authorization` header use lowercase `authorization`? | Both work. The reference uses lowercase; we mirror it for consistency. |
| What happens if two `drwn login` invocations race? | Atomic write via tmpfile + rename makes the last writer wins. Acceptable. |
| Should we offer `drwn login --token <value>` for non-interactive setups? | No — that's what `DRWN_TOKEN` is for, and it's already plumbed through `resolveToken`. Adding a flag duplicates the env-var path. |
| Should `whoami --json` include `session.expiresAt`? | `/api/auth/session` returns it. Including it is harmless; we will. |

---

## Appendix

### Reference: minimal `runDeviceFlow` sketch

```ts
// cli/core/auth/device-flow.ts
// Verified against better-auth@1.6.9 deviceAuthorization plugin source.
// Error dispatch is on response BODY.error, not HTTP status.

const GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

export interface DeviceFlowDeps {
  apiUrl: string;
  clientId: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  onUserAction: (info: { verification_uri_complete: string; user_code: string }) => void;
}

export async function runDeviceFlow(deps: DeviceFlowDeps): Promise<DeviceTokenResponse> {
  const fetchImpl = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));

  const codeResp = await fetchImpl(`${deps.apiUrl}/api/auth/device/code`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: deps.clientId }),
  });
  if (!codeResp.ok) {
    throw new Error(`Failed to request device code: ${codeResp.status} ${await codeResp.text()}`);
  }
  const code = DeviceCodeResponseSchema.parse(await codeResp.json());

  deps.onUserAction({
    verification_uri_complete: code.verification_uri_complete,
    user_code: code.user_code,
  });

  const expiresAt = Date.now() + code.expires_in * 1000;
  let interval = code.interval ?? 5;

  while (true) {
    await sleep(interval * 1000);
    if (Date.now() > expiresAt) {
      throw new Error("Sign-in timed out. Run drwn login again.");
    }

    const tokenResp = await fetchImpl(`${deps.apiUrl}/api/auth/device/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        device_code: code.device_code,
        grant_type: GRANT_TYPE,
        client_id: deps.clientId,
      }),
    });
    if (tokenResp.ok) {
      return DeviceTokenResponseSchema.parse(await tokenResp.json());
    }

    const body = await tokenResp.json().catch(() => ({}));
    const error = (body as { error?: string }).error ?? "unknown_error";
    switch (error) {
      case "authorization_pending":
        continue;
      case "slow_down":
        interval *= 2;
        continue;
      case "expired_token":
        throw new Error("Code expired. Run drwn login again.");
      case "access_denied":
        throw new Error("Authorization denied in browser.");
      default:
        throw new Error(`Authentication failed: ${error}`);
    }
  }
}
```

### Reference: zod schemas (excerpt)

```ts
// cli/core/http/schemas.ts
import { z } from "zod";

export const DeviceCodeResponseSchema = z.object({
  device_code: z.string(),
  user_code: z.string(),
  verification_uri_complete: z.string().url(),
  expires_in: z.number().int().positive(),
  interval: z.number().int().positive().default(5),
});

export const DeviceTokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.literal("Bearer"),
  expires_in: z.number().int().positive(),
  scope: z.string().optional(),
});

export const SessionResponseSchema = z
  .object({
    user: z.object({
      id: z.string(),
      email: z.string(),
      name: z.string().optional(),
    }),
    session: z
      .object({
        id: z.string(),
        expiresAt: z.string(),
      })
      .partial(),
  })
  .nullable();

export type DeviceCodeResponse = z.infer<typeof DeviceCodeResponseSchema>;
export type DeviceTokenResponse = z.infer<typeof DeviceTokenResponseSchema>;
export type SessionResponse = z.infer<typeof SessionResponseSchema>;
```

### Reference: credentials shape

```ts
// cli/core/auth/credentials.ts
export interface DrwnCredentials {
  api_url: string;
  access_token: string;
  user_email: string;
  saved_at: string;  // ISO timestamp
}
```

### Sequencing with analyze

Auth (this doc, plan 37) ships first. Analyze (analysis 57, plan 38) hard-depends on:

- `cli/core/auth/resolve-token.ts`
- `cli/core/http/analyzer-client.ts` (auth methods only; analyze adds `upload`/`getJob`/`getReport`)
- `cli/core/http/schemas.ts` (analyze adds upload/job/report schemas)

This sequencing avoids merging a partially functional analyze command and gives us a chance to validate auth in isolation against the real backend before layering uploads on top.
