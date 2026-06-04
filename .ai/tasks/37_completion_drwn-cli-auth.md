# Task 37 Completion: Drwn CLI Auth

**Task**: [37_drwn-cli-auth-implementation-plan.md](./37_drwn-cli-auth-implementation-plan.md)
**Completed**: 2026-06-03 PDT
**Status**: Implemented, fully automated-tested, and live local-backend device-flow verified
**Commit Status**: No commits made, per instruction
**Worktree Status**: No separate git worktree created, per instruction
**Current Branch**: `remyjkim/docs-overhaul-and-skills-submodule`
**Related Analysis**: [56_drwn-cli-auth-target-architecture.md](../analyses/56_drwn-cli-auth-target-architecture.md)

---

## Executive Summary

Task 37 is complete as an implementation and has been verified through unit tests, command-level tests, subprocess CLI E2E tests, full repository tests, docs build, and a live device-flow run against the local backend at `http://localhost:8787`.

The CLI now has a first-class auth surface:

- `drwn login`
- `drwn logout`
- `drwn whoami`

Auth uses the analyzer backend's Better Auth device-flow contract, stores bearer credentials at `~/.agents/drwn/credentials.json`, validates sessions through the backend before reporting identity, and supports `DRWN_TOKEN` plus `DRWN_ANALYZER_URL` for automation.

The implementation deliberately does not ship a packaged analyzer API default. Operators must configure `DRWN_ANALYZER_URL` or `analyzer.apiUrl`, which keeps local, dev, and production environments explicit.

---

## Delivered Scope

### Configuration

- Extended `CanonicalConfig` with an optional `analyzer` section:
  - `apiUrl`
  - `clientId`
  - `webBaseUrl`
  - `maxArchiveBytes`
- Added analyzer config resolution in `cli/core/auth/config.ts`.
- Analyzer API URL precedence:
  1. `DRWN_ANALYZER_URL`
  2. effective user/machine config `analyzer.apiUrl`
  3. packaged config `analyzer.apiUrl`, if one is added in the future
- Analyzer frontend URL precedence:
  1. `DRWN_ANALYZER_WEB_URL`
  2. effective user/machine config `analyzer.webBaseUrl`
  3. packaged config `analyzer.webBaseUrl`, if one is added in the future
- Preserved `analyzer` during `loadEffectiveConfig` machine-config merge.
- Kept `registry/config.json` free of packaged analyzer defaults.

### Credential Storage

- Added `resolveCredentialsPath(agentsDir)` in `cli/core/paths.ts`.
- Added `cli/core/auth/credentials.ts`.
- Credential path:

```text
~/.agents/drwn/credentials.json
```

- Credential shape:

```json
{
  "api_url": "http://localhost:8787",
  "access_token": "...",
  "user_email": "user@example.com",
  "saved_at": "2026-06-03T..."
}
```

- Credentials are written through temp-file plus rename and chmodded to owner-only mode `0600`.
- Malformed or missing credentials are treated as unauthenticated.
- Logout deletes credentials and treats missing credentials as a no-op success.

### HTTP Client And Schemas

- Added `zod` as the only new runtime dependency.
- Added `cli/core/http/schemas.ts` for response validation:
  - `DeviceCodeResponseSchema`
  - `DeviceTokenResponseSchema`
  - `SessionResponseSchema`
  - `AnalyzeUploadResponseSchema`
  - `JobInfoSchema`
- Added `cli/core/http/errors.ts`:
  - `AuthExpiredError`
  - `ServerError`
- Added `cli/core/http/analyzer-client.ts` with auth methods:
  - `requestDeviceCode(clientId)`
  - `pollDeviceToken(deviceCode, clientId)`
  - `getSession(token)`
  - `signOut(token)`

The client validates backend response bodies and maps 401 session failures to `AuthExpiredError`.

### Device Flow

- Added `cli/core/auth/device-flow.ts`.
- Implemented the verified Better Auth device authorization contract:
  - request device code
  - print/open `verification_uri_complete`
  - poll token endpoint
  - continue on `authorization_pending`
  - double interval on `slow_down`
  - fail clearly on `expired_token`, `access_denied`, unknown errors, and local timeout
- The code comment names the verified Better Auth contract source.

### Browser Opening

- Added `cli/core/auth/browser.ts`.
- Uses Bun-native process spawning instead of an npm `open` dependency.
- Platform behavior:
  - macOS: `open`
  - Linux: `xdg-open`
  - Windows: `cmd /c start`
- Spawn failures are swallowed because the URL is always printed.

### Commands

#### `drwn login`

- Requests a device code from the configured analyzer API.
- Prints the browser approval URL and user code.
- Opens the URL unless `--no-browser` is passed.
- Waits for approval and token issuance.
- Validates the resulting token with `/api/auth/session`.
- Writes credentials with `0600`.
- Prints `Authenticated as <email>.`
- Supports `--json`.
- In JSON mode, device-flow instructions go to stderr so stdout remains a single machine-readable JSON object.

#### `drwn whoami`

- Resolves auth from:
  1. `DRWN_TOKEN` plus `DRWN_ANALYZER_URL`
  2. stored credentials
- Calls `/api/auth/session` before printing identity.
- Prints the email in human mode.
- Emits `{email, api_url, saved_at, expires_at}` in JSON mode.
- Maps null session or 401 to `Session expired. Run \`drwn login\`.`
- Reports missing auth as `Not authenticated. Run \`drwn login\` first (or set DRWN_TOKEN + DRWN_ANALYZER_URL).`

#### `drwn logout`

- Reads stored credentials.
- Calls `/api/auth/sign-out` best-effort.
- Removes the local credential file regardless of server sign-out success.
- Is safe to run when not logged in.

### CLI Registration

- Registered auth commands in `cli/index.ts`.
- Help output includes the `Auth` category.
- Each command has Clipanion Details and Examples sections.

### Documentation

- Updated `docs/cli-quickref.md`.
- Added Docusaurus reference pages:
  - `docs-docusaurus/docs/reference/cli/login.md`
  - `docs-docusaurus/docs/reference/cli/logout.md`
  - `docs-docusaurus/docs/reference/cli/whoami.md`
- Updated `docs-docusaurus/sidebars.ts`.
- Updated `.ai/knowledges/10_drwn-cli-architecture.md`.
- Updated the task plan with implementation status and verification notes.

---

## Files Added

- `cli/commands/auth/login.ts`
- `cli/commands/auth/logout.ts`
- `cli/commands/auth/whoami.ts`
- `cli/core/auth/browser.ts`
- `cli/core/auth/config.ts`
- `cli/core/auth/credentials.ts`
- `cli/core/auth/device-flow.ts`
- `cli/core/auth/resolve-token.ts`
- `cli/core/http/analyzer-client.ts`
- `cli/core/http/errors.ts`
- `cli/core/http/schemas.ts`
- `docs-docusaurus/docs/reference/cli/login.md`
- `docs-docusaurus/docs/reference/cli/logout.md`
- `docs-docusaurus/docs/reference/cli/whoami.md`
- `test/cli-auth-e2e.test.ts`
- `test/commands-auth.test.ts`
- `test/core-auth-browser.test.ts`
- `test/core-auth-config.test.ts`
- `test/core-auth-credentials.test.ts`
- `test/core-auth-device-flow.test.ts`
- `test/core-auth-resolve-token.test.ts`
- `test/core-http-analyzer-client-auth.test.ts`
- `test/core-http-schemas.test.ts`
- `test/core-paths-credentials.test.ts`
- `.ai/tasks/37_completion_drwn-cli-auth.md`

## Files Modified

- `.ai/knowledges/10_drwn-cli-architecture.md`
- `.ai/tasks/37_drwn-cli-auth-implementation-plan.md`
- `bun.lock`
- `cli/core/paths.ts`
- `cli/core/types.ts`
- `cli/core/user-config.ts`
- `cli/index.ts`
- `docs-docusaurus/sidebars.ts`
- `docs/cli-quickref.md`
- `package.json`

---

## TDD And Test Coverage

The auth implementation was built with tests first around the core seams and then hardened with a real subprocess E2E suite.

### Core Unit Coverage

Covered:

- credential path resolution
- analyzer config precedence and trailing-slash trimming
- machine-config merge preserving `analyzer`
- credential read/write/delete behavior
- credential file mode `0600`
- malformed credentials returning null
- env-token resolution
- missing env pair rejection when `DRWN_TOKEN` lacks `DRWN_ANALYZER_URL`
- browser opener per platform
- device-flow polling success
- `authorization_pending`
- `slow_down`
- `expired_token`
- `access_denied`
- local timeout
- auth HTTP request bodies and headers
- session response `null`
- 401 mapping to `AuthExpiredError`
- schema validation failures

### Command-Level Coverage

Covered:

- missing analyzer config error includes config path and `DRWN_ANALYZER_URL`
- login happy path writes credentials and opens browser
- `login --no-browser` skips browser open
- logout removes credentials and calls sign-out
- logout when not logged in
- whoami via env token
- whoami without auth
- whoami with null session

### Subprocess CLI E2E Coverage

Added `test/cli-auth-e2e.test.ts`, which starts a fake analyzer backend and drives the actual CLI process through `bun run cli/index.ts`.

Covered:

- `login --no-browser --json`
- real process env handling
- device-code request body
- token polling request body
- pending poll followed by token success
- stdout/stderr separation in JSON mode
- credential write and `0600` permission
- stored-credential `whoami --json`
- logout sign-out authorization header
- credential removal
- post-logout `whoami` failure
- env-token `whoami --json`
- null-session mapping
- 401 expired-session mapping
- missing-config login failure before credentials are written
- logout still removes credentials when sign-out returns a server error

---

## Verification

### Automated Gates

Commands run after implementation and auth hardening:

```bash
bun run typecheck
bun test test/core-paths-credentials.test.ts \
  test/core-auth-config.test.ts \
  test/core-http-schemas.test.ts \
  test/core-auth-browser.test.ts \
  test/core-auth-credentials.test.ts \
  test/core-auth-resolve-token.test.ts \
  test/core-http-analyzer-client-auth.test.ts \
  test/core-auth-device-flow.test.ts \
  test/commands-auth.test.ts \
  test/cli-auth-e2e.test.ts
bun test
bun run docs:build
```

Results:

- `bun run typecheck`: passed.
- Focused auth suite: 53 pass, 0 fail, 113 expectations, 10 files.
- Full repository suite after final auth hardening: 618 pass, 0 fail, 2358 expectations, 119 files.
- Docusaurus build: passed.

### Local Backend Live Auth Verification

Backend target:

```text
http://localhost:8787
```

Health check:

```text
GET /health -> {"ok": true}
```

Device-code endpoint contract:

- `POST /api/auth/device/code`
- returned HTTP 200
- returned keys included:
  - `device_code`
  - `expires_in`
  - `interval`
  - `user_code`
  - `verification_uri`
  - `verification_uri_complete`
- returned `verification_uri_complete` under `/device`

Live CLI device-flow run:

```bash
AGENTS_HOME_DIR=<isolated-temp-home> \
AGENTS_DIR=<isolated-temp-home>/.agents \
DRWN_ANALYZER_URL=http://localhost:8787 \
bun run cli/index.ts login --no-browser
```

Observed:

- CLI printed a device approval URL.
- User approved the browser flow.
- CLI completed as `pureicis@gmail.com`.
- Credentials were saved to the isolated `AGENTS_DIR`.
- Credential file mode was `600`.
- Sanitized credential inspection confirmed:
  - `api_url: http://localhost:8787`
  - `user_email: pureicis@gmail.com`
  - `has_access_token: true`

Session checks:

```bash
drwn whoami
drwn whoami --json
```

Observed:

- human output: `pureicis@gmail.com`
- JSON output included:
  - `email: pureicis@gmail.com`
  - `api_url: http://localhost:8787`
  - `saved_at`
  - `expires_at`

Logout:

```bash
drwn logout
```

Observed:

- printed `Logged out. Credentials removed.`
- credential file removed
- post-logout `drwn whoami` failed with the expected unauthenticated message

### Isolation

The live auth smoke used temporary `AGENTS_HOME_DIR` and `AGENTS_DIR` values. It did not write to the user's real `~/.agents/drwn/credentials.json`.

---

## Scope Decisions

### No Packaged Analyzer Default

No `analyzer.apiUrl` was added to `registry/config.json`.

Reason: environments must remain explicit until production URLs are a product decision. The missing-config path is also a real UX contract and is tested.

### No Token Expiry Persistence

Credentials do not store token expiry.

Reason: backend session validation remains authoritative, and every protected command still handles 401 or null session.

### Sign-Out Is Best-Effort

`drwn logout` removes local credentials even if server sign-out fails.

Reason: the operator intent is to stop using local credentials immediately; server revocation is useful but should not block local cleanup.

### JSON Mode Stdout Discipline

`drwn login --json` writes browser/device instructions to stderr and final machine-readable data to stdout.

Reason: JSON-mode stdout must be parseable by scripts.

---

## Residual Risks

| Risk | Status | Mitigation |
|---|---|---|
| Hosted dev/prod backend differs from local backend | Not fully exercised in this task | The local backend was live-verified; remote backend should be smoke-tested before release if URLs are pinned. |
| Browser opener can fail on unusual desktop environments | Accepted | URL is always printed; `--no-browser` exists; opener failures are swallowed. |
| Shell-history exposure when using `DRWN_TOKEN=...` | Accepted | Documentation describes env-token usage; operators should rely on CI secret stores or shell-safe secret loading. |
| Better Auth device-flow contract changes in a future backend upgrade | Accepted | Response schemas and device-flow tests pin the current contract; future backend upgrades should run the E2E suite and live smoke. |

---

## Workspace Notes

- No commit was created.
- No git worktree was created.
- The repo had unrelated dirty/untracked files before this completion report. They were not reverted.
- This completion document is itself uncommitted, per instruction.
