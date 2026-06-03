# Task 38: Drwn CLI `analyze sessions` Implementation Plan

**Status**: Implemented; automated verification complete; authenticated report E2E pending
**Created**: 2026-06-03
**Updated**: 2026-06-03
**Priority**: High
**Dependencies**: Task 37 (auth) implemented in this working tree; merge still pending
**References**: [analyses/57_drwn-cli-analyze-sessions-target-architecture.md, analyses/56_drwn-cli-auth-target-architecture.md, tasks/37_drwn-cli-auth-implementation-plan.md, /Users/pureicis/dev/darwinian-harness-services/backend/src/routes/analyze.ts, /Users/pureicis/dev/darwinian-harness-services/backend/src/routes/jobs.ts, /Users/pureicis/dev/darwinian-harness-services/frontend/src/routes/UploadPage.tsx, /Users/pureicis/dev/darwinian-harness-services/frontend/src/routes/ProcessingPage.tsx, cli/commands/export/sessions.ts, cli/core/export/archiver.ts, cli/core/export/session-discovery.ts]

---

## Execution Summary (2026-06-03)

- Implemented `drwn analyze sessions` with explicit archive, newest-archive reuse, fresh inline gzip export, dry-run, wait, open, and JSON output paths.
- Added analyzer upload/job client methods, schemas, archive selection/validation, URL composition, and inline export helpers.
- Verified with focused analyze tests, full `bun test`, `bun run typecheck`, `bun run docs:build`, CLI help smoke, dry-run smoke, and local-backend upload smoke against `http://localhost:8787`.
- Authenticated browser/report E2E remains a manual check because it depends on completing Task 37's real device-flow login with a user account.

## Objective

Add `drwn analyze sessions` to the CLI: a one-command flow that uploads a session-log tarball to the analyzer backend and prints the URL where the user can watch the analysis. Implements the hybrid input model (newest local archive, else inline export, else explicit `--archive`), polling-on-demand (`--wait`), and optional browser opening (`--open`).

## Success Criteria

- [ ] `drwn analyze sessions` against a logged-in user with `analyzer.webBaseUrl` or `DRWN_ANALYZER_WEB_URL` configured produces a job and prints a valid processing URL.
- [ ] With existing tarballs under `.agents/drwn/session-log-exports/`, the newest is used and a "Using existing archive" line is printed.
- [ ] With no existing tarballs, the CLI builds one inline (gzip), uploads it, and prints the URL when `webBaseUrl` is configured.
- [ ] `--archive <path>` uploads exactly that file (no auto-fallback on validation failure).
- [ ] `--fresh` builds a new archive even if existing ones are present (when `--archive` is absent).
- [ ] `--wait` polls and prints the report URL once `status: completed` and `reportId` is non-null.
- [ ] `--open` opens the URL in the system browser (best-effort).
- [ ] `--json` emits a parseable single-line object with a stable shape: `{ jobId, processingUrl, reportUrl }`, where URLs are strings or `null`.
- [ ] `--dry-run` resolves all inputs and prints the upload plan without making a network call or writing a new archive.
- [ ] 401 from upload prints "Session expired. Run drwn login." and exits 1.
- [ ] 413 from upload prints a clean "Archive exceeds server limit" message.
- [ ] `bun test` clean. `bun run typecheck` clean.
- [ ] No new npm dependencies.

## Approach

Build on the auth slice (task 37). Compose URLs from a configurable `webBaseUrl`. Reuse all existing `cli/core/export/` helpers for inline archive creation. Extend the shared `cli/core/http/analyzer-client.ts` with `upload` and `getJob` methods only. `getReport` and report-summary rendering are deferred to a future task. Strict TDD throughout.

## Execution-Readiness Decisions

- Start this task only after Task 37 is merged, `bun test` and `bun run typecheck` are clean, and `drwn login`, `drwn whoami`, and `drwn logout` have passed the Task 37 dev-backend smoke.
- Use Task 37's auth APIs as implemented: resolve auth with `resolveToken({ credentialsPath: resolveCredentialsPath(context.agentsDir), env: process.env })`.
- Do not add packaged analyzer defaults in this task unless a separate product decision pins production URLs. Manual dev integration should use:
  - `DRWN_ANALYZER_URL=https://darwinian-harness-services-api-dev.dev-726.workers.dev`
  - `DRWN_ANALYZER_WEB_URL=https://darwinian-harness-services.pages.dev`
  or the equivalent `analyzer.apiUrl` / `analyzer.webBaseUrl` values in user config.
- `webBaseUrl` is optional for upload success. When absent, human output prints the job id and a config hint; JSON output uses `processingUrl: null` and `reportUrl: null`.
- `--dry-run` is non-mutating. If no explicit archive and no existing archive is available, it reports that an inline export would be built and exits 0; it does not call `runInlineExport`, does not create a tarball, and does not call the network.
- `--no-poll` is out of scope for v1. The default is already no polling; scripts can omit `--wait`.

## Implementation Plan

### Phase 0: Preconditions

#### Task 0.1: Confirm task 37 is merged

**Verification:**
- `cli/core/auth/resolve-token.ts` exists.
- `cli/core/paths.ts` exports `resolveCredentialsPath`.
- `cli/core/http/analyzer-client.ts` exists with auth methods.
- `cli/core/http/schemas.ts` exists with `DeviceCodeResponseSchema`, etc.
- `cli/core/auth/credentials.ts` exists.
- `cli/core/auth/config.ts` exists with `loadAnalyzerConfig`.
- `drwn login`, `drwn whoami`, and `drwn logout` are registered in `cli/index.ts`.
- `bun test` and `bun run typecheck` are clean after Task 37.

If any are missing, halt and resolve task 37 first.

### Phase 1: Config schema additions

#### Task 1.1: Extend `analyzer` config section

**Files:**
- Modify: `cli/core/types.ts`

**Steps:**

1. Extend `analyzer?` in `CanonicalConfig`:

   ```ts
   analyzer?: {
     apiUrl?: string;
     clientId?: string;
     webBaseUrl?: string;          // new
     maxArchiveBytes?: number;     // new, defaults to 104857600 (100 MB)
   };
   ```

2. Run `bun run typecheck`.

**Checkpoint:** Type compiles.

#### Task 1.2: Extend `loadAnalyzerConfig` (from auth slice) with `webBaseUrl` + `maxArchiveBytes`

**Files:**
- Modify: `cli/core/auth/config.ts`
- Test: `test/core-auth-config.test.ts` (extend existing)

Resolution priority for `webBaseUrl`:
1. `DRWN_ANALYZER_WEB_URL` env var
2. User config
3. Packaged config

`maxArchiveBytes` defaults to `104857600` if unset everywhere.

`loadAnalyzerConfig` must keep the Task 37 return fields and add:

```ts
{
  apiUrl?: string;
  clientId: string;
  webBaseUrl?: string;
  maxArchiveBytes: number;
  configPath: string;
}
```

Normalize trailing slashes for both URLs.

**Checkpoint:** Tests pass for env-var, config, and default paths.

### Phase 2: Schemas for analyze responses

#### Task 2.1: Add `AnalyzeUploadResponseSchema` and `JobInfoSchema`

**Files:**
- Modify: `cli/core/http/schemas.ts`
- Test: `test/core-http-schemas.test.ts` (extend)

**Step 1: Failing tests** for valid + invalid parses on both schemas.

**Step 3: Implement**

```ts
export const AnalyzeUploadResponseSchema = z.object({
  jobId: z.string(),
  status: z.literal("queued"),
});

export const JobInfoSchema = z.object({
  id: z.string(),
  status: z.enum(["queued", "processing", "completed", "failed"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  error: z.string().nullable(),
  reportId: z.string().nullable(),
});

export type AnalyzeUploadResponse = z.infer<typeof AnalyzeUploadResponseSchema>;
export type JobInfo = z.infer<typeof JobInfoSchema>;
```

**Checkpoint:** Schema tests green.

### Phase 3: HTTP client additions

#### Task 3.1: Add `upload(archivePath, token)` to `analyzer-client.ts`

**Files:**
- Modify: `cli/core/http/analyzer-client.ts`
- Test: `test/core-http-analyzer-client-upload.test.ts`

**Step 1: Failing tests**

```ts
import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAnalyzerClient } from "../cli/core/http/analyzer-client";
import { AuthExpiredError, ServerError } from "../cli/core/http/errors";

describe("analyzer-client.upload", () => {
  async function makeArchive() {
    const dir = await mkdtemp(join(tmpdir(), "drwn-up-"));
    const path = join(dir, "x.tar.gz");
    await writeFile(path, Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0, 0, 0, 0]));
    return path;
  }

  test("posts multipart with Authorization header; returns parsed response", async () => {
    let captured: { url?: string; init?: RequestInit } = {};
    const mockFetch = (async (url: string, init?: RequestInit) => {
      captured = { url, init };
      return new Response(JSON.stringify({ jobId: "job_x", status: "queued" }), {
        status: 201, headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    const archive = await makeArchive();
    const client = createAnalyzerClient("https://api.test", mockFetch);
    const result = await client.upload(archive, "TOK");
    expect(result).toEqual({ jobId: "job_x", status: "queued" });
    expect(captured.url).toBe("https://api.test/api/analyze");
    expect(captured.init?.method).toBe("POST");
    const headers = new Headers(captured.init?.headers);
    expect(headers.get("authorization")).toBe("Bearer TOK");
    // CRITICAL: do not set content-type — FormData sets the boundary.
    expect(headers.get("content-type")).toBeNull();
    expect(captured.init?.body).toBeInstanceOf(FormData);
  });

  test("throws AuthExpiredError on 401", async () => {
    const mockFetch = (async () => new Response("nope", { status: 401 })) as typeof fetch;
    const archive = await makeArchive();
    const client = createAnalyzerClient("https://api.test", mockFetch);
    await expect(client.upload(archive, "T")).rejects.toBeInstanceOf(AuthExpiredError);
  });

  test("throws ServerError on 413 with status preserved", async () => {
    const mockFetch = (async () => new Response("too big", { status: 413 })) as typeof fetch;
    const archive = await makeArchive();
    const client = createAnalyzerClient("https://api.test", mockFetch);
    await expect(client.upload(archive, "T")).rejects.toMatchObject({ name: "ServerError", status: 413 });
  });

  test("throws ServerError on 5xx", async () => {
    const mockFetch = (async () => new Response("boom", { status: 502 })) as typeof fetch;
    const archive = await makeArchive();
    const client = createAnalyzerClient("https://api.test", mockFetch);
    await expect(client.upload(archive, "T")).rejects.toMatchObject({ name: "ServerError", status: 502 });
  });
});
```

**Step 3: Implement**

```ts
// inside createAnalyzerClient return object
async upload(archivePath: string, token: string): Promise<AnalyzeUploadResponse> {
  const file = Bun.file(archivePath);
  const form = new FormData();
  form.append("file", file, basename(archivePath));
  const r = await fetcher(`${apiUrl}/api/analyze`, {
    method: "POST",
    body: form,
    headers: { authorization: `Bearer ${token}` },
  });
  if (r.status === 401) throw new AuthExpiredError();
  if (!r.ok) throw new ServerError(await r.text(), r.status);
  return AnalyzeUploadResponseSchema.parse(await r.json());
}
```

**Checkpoint:** All upload tests green.

#### Task 3.2: Add `getJob(jobId, token)` to `analyzer-client.ts`

**Files:**
- Modify: `cli/core/http/analyzer-client.ts`
- Test: `test/core-http-analyzer-client-jobs.test.ts`

**Tests:** 200 happy path, 401 → AuthExpiredError, 404 → ServerError, schema reject on malformed JSON.

**Implement:**

```ts
async getJob(jobId: string, token: string): Promise<JobInfo> {
  const r = await fetcher(`${apiUrl}/api/jobs/${encodeURIComponent(jobId)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (r.status === 401) throw new AuthExpiredError();
  if (!r.ok) throw new ServerError(await r.text(), r.status);
  return JobInfoSchema.parse(await r.json());
}
```

**Checkpoint:** Job tests green.

**Out of scope for v1:** Do not add `getReport` in this task. The CLI v1 stops at URL composition and job polling.

### Phase 4: Analyze core helpers

#### Task 4.1: `findNewestArchive`

**Files:**
- Create: `cli/core/analyze/find-archive.ts`
- Test: `test/core-analyze-find-archive.test.ts`

**Tests:**
- empty / missing dir → null
- single tar file → returned
- multiple files: returns the one with the highest mtime
- ignores non-tar files

**Implement** per analysis 57 appendix.

**Checkpoint:** All four tests green.

#### Task 4.2: `validateArchive`

**Files:**
- Create: `cli/core/analyze/validate-archive.ts`
- Test: `test/core-analyze-validate-archive.test.ts`

**Tests:**
- nonexistent path → `Error("Archive not found: ...")`
- empty file → `Error("Archive is empty")`
- `.zip` extension → `Error("Unsupported extension")`
- file > maxBytes → `Error("Archive exceeds limit")`
- valid `.tar` / `.tar.gz` / `.tgz` → no throw, returns `{ size, extension }`

**Implement:**

```ts
// cli/core/analyze/validate-archive.ts
// ABOUTME: Local pre-check for archive existence, size, and extension before the upload round-trip.

import { stat } from "node:fs/promises";

const EXTENSIONS = [".tar", ".tar.gz", ".tgz"] as const;

export interface ArchiveInfo { path: string; size: number; extension: string; }

export async function validateArchive(path: string, maxBytes: number): Promise<ArchiveInfo> {
  let s;
  try { s = await stat(path); }
  catch { throw new Error(`Archive not found: ${path}`); }
  if (s.size === 0) throw new Error(`Archive is empty: ${path}`);
  const ext = EXTENSIONS.find((e) => path.endsWith(e));
  if (!ext) throw new Error(`Unsupported archive extension. Expected one of: ${EXTENSIONS.join(", ")}.`);
  if (s.size > maxBytes) {
    throw new Error(`Archive exceeds limit (${s.size} bytes > ${maxBytes} bytes).`);
  }
  return { path, size: s.size, extension: ext };
}
```

**Checkpoint:** Tests cover all branches.

#### Task 4.3: `runInlineExport`

**Files:**
- Create: `cli/core/analyze/inline-export.ts`
- Test: `test/core-analyze-inline-export.test.ts`

**Tests:**
- No session files discovered → throws "No session files found"
- Discovers files → calls `archiveSessions` with `{ gzip: true }`, returns path, ensures `.tar.gz` extension.
- Uses `makeTimestamp()` for filename.

Implement `runInlineExport` with dependency injection for `discoverClaudeSessions`, `discoverCodexSessions`, `archiveSessions`, and `makeTimestamp`, defaulting to the real helpers. This keeps the helper unit-testable without module-level mocking.

**Implement** per analysis 57 appendix.

**Checkpoint:** Tests green.

#### Task 4.4: URL composers

**Files:**
- Create: `cli/core/analyze/url.ts`
- Test: `test/core-analyze-url.test.ts`

**Tests:**
- `processingUrl("https://app.test", "job_x")` → `"https://app.test/processing/job_x"`
- handles trailing slashes on base
- `reportUrl("https://app.test/", "rep_y")` → `"https://app.test/report/rep_y"`

**Implement** per analysis 57 algorithm.

**Checkpoint:** Tests green.

#### Task 4.5: Resolve-input helper

**Files:**
- Create: `cli/core/analyze/resolve-input.ts`
- Test: `test/core-analyze-resolve-input.test.ts`

**Goal:** A pure function that resolves the archive path given flags and a filesystem injection.

```ts
export interface ResolveInputOptions {
  archive?: string;
  fresh?: boolean;
  exportsDir: string;
  inlineExport: () => Promise<string>;
  findNewest: (dir: string) => Promise<string | null>;
  dryRun?: boolean;
}

export async function resolveAnalyzeInput(opts: ResolveInputOptions): Promise<{
  path: string | null;
  source: "explicit" | "fresh" | "existing" | "inline" | "would-inline";
}> {
  if (opts.archive) return { path: opts.archive, source: "explicit" };
  if (opts.dryRun) {
    const existing = opts.fresh ? null : await opts.findNewest(opts.exportsDir);
    if (existing) return { path: existing, source: "existing" };
    return { path: null, source: "would-inline" };
  }
  if (opts.fresh) return { path: await opts.inlineExport(), source: "fresh" };
  const existing = await opts.findNewest(opts.exportsDir);
  if (existing) return { path: existing, source: "existing" };
  return { path: await opts.inlineExport(), source: "inline" };
}
```

**Tests:** Explicit, fresh, existing, inline, and dry-run would-inline branches covered with injected mocks. Assert dry-run would-inline does not call `inlineExport`.

**Checkpoint:** Tests green.

### Phase 5: The command

#### Task 5.1: `analyze sessions` command — happy path

**Files:**
- Create: `cli/commands/analyze/sessions.ts`
- Test: `test/commands-analyze-sessions.test.ts`

**Step 1: Failing test** — default flags, mock auth + mock client + mock fs, assert:
- prints "Using existing archive" when one is found
- prints "Job queued. Watch progress here: <url>"
- exits 0

**Step 3: Implement** the command skeleton from analysis 57 appendix. Wire:

- `resolveToken({ credentialsPath: resolveCredentialsPath(this.context.agentsDir), env: process.env })` for auth/apiUrl
- `loadAnalyzerConfig` for `webBaseUrl` + `maxArchiveBytes`
- `resolveAnalyzeInput` for archive selection
- `validateArchive` for pre-check
- `createAnalyzerClient(...).upload(...)` for the network call
- `processingUrl(...)` for the printed URL

Error mapping (all exit 1):

- `null` auth → "Not authenticated. Run `drwn login` first (or set DRWN_TOKEN + DRWN_ANALYZER_URL)."
- `AuthExpiredError` → "Session expired. Run `drwn login`."
- `ServerError` with status 413 → "Archive exceeds server limit. Try `drwn export sessions --gzip` for a smaller archive."
- `ServerError` with status 400 → message body verbatim
- `ServerError` with status >= 500 → "Server error (<status>). Try again later."
- Any other thrown error → message and exit 1

**Checkpoint:** Default happy-path test green.

#### Task 5.2: `--archive`

**Tests:**
- `--archive /tmp/x.tar.gz` uploads that file
- `--archive /missing` → exits 1 with "Archive not found"
- `--archive /tmp/foo.zip` → exits 1 with "Unsupported extension"

**Implement:** Wire the flag through `resolveAnalyzeInput`.

#### Task 5.3: `--fresh`

**Tests:**
- `--fresh` triggers inline export even when an existing archive is present
- `--archive X --fresh` → prints "--fresh is ignored when --archive is provided." and proceeds with `--archive`

#### Task 5.4: `--wait`

**Tests:**
- Job sequence: `queued` → `processing` → `completed`+`reportId` → prints report URL
- Job sequence: `queued` → `failed` → exits 1 with "Analysis failed: <error>"
- Timeout via injected clock → exits 1 with timeout message

Polling cadence: every 2000 ms (injectable). Ceiling: 5 minutes (injectable). Clock is injectable for timeout tests.

**Implement:**

```ts
async function waitForReport(client, jobId, token, opts: { intervalMs: number; ceilingMs: number; sleep: (ms: number) => Promise<void>; now: () => number }): Promise<JobInfo> {
  const start = opts.now();
  while (true) {
    await opts.sleep(opts.intervalMs);
    if (opts.now() - start > opts.ceilingMs) {
      throw new Error(`Polling timed out after ${Math.round(opts.ceilingMs / 1000)}s. Check the processing URL for live status.`);
    }
    const job = await client.getJob(jobId, token);
    if (job.status === "completed" && job.reportId) return job;
    if (job.status === "failed") throw new Error(`Analysis failed: ${job.error ?? "unknown error"}`);
    // continue
  }
}
```

#### Task 5.5: `--open`

**Tests:**
- With `--open` and no `--wait`: opens processing URL
- With `--open --wait`: opens report URL on success
- With `--open` and no `webBaseUrl`: upload still succeeds, no browser spawn occurs, and stderr includes "No analyzer.webBaseUrl configured; cannot open browser."
- Spawn errors swallowed

**Implement:** Reuse `openBrowser` from `cli/core/auth/browser.ts`.

#### Task 5.6: `--json`

**Tests:**
- No `--wait`: emits `{ jobId, processingUrl, reportUrl: null }`
- With `--wait`: emits `{ jobId, processingUrl, reportUrl }`
- When `webBaseUrl` is missing: `processingUrl: null`, `reportUrl: null`

#### Task 5.7: `--dry-run`

**Tests:**
- Resolves input + validates + prints plan
- With `--archive`, validates the explicit archive and prints the upload plan
- With existing archive, validates that archive and prints the upload plan
- With no existing archive and no `--archive`, prints that an inline gzip export would be built and exits 0
- Never touches the network (`fetch` mock asserts zero calls)
- Does not call `runInlineExport` and does not write an archive
- Exits 0

#### Task 5.8: Register in `cli/index.ts`

```ts
import { AnalyzeSessionsCommand } from "./commands/analyze/sessions";
cli.register(AnalyzeSessionsCommand);
```

`bun cli/index.ts --help` shows `Analyze` category.

**Checkpoint:** All flag combinations green; help output correct; typecheck clean.

### Phase 6: Documentation

#### Task 6.1: Update `docs/cli-quickref.md`

Add `drwn analyze sessions` examples below `drwn export sessions`.

#### Task 6.2: Add `docs-docusaurus/docs/reference/cli/analyze.md`

Mirror the structure of `card.md`. Document every flag, exit codes, env vars.

#### Task 6.3: Update `.ai/knowledges/10_drwn-cli-architecture.md`

Brief note about the analyze surface; pointer to analysis 57.

### Phase 7: Integration verification

#### Task 7.1: End-to-end happy path

1. Ensure logged in: `drwn whoami` shows your email.
2. Configure `DRWN_ANALYZER_WEB_URL=https://darwinian-harness-services.pages.dev` or set `analyzer.webBaseUrl` to that value in user config.
3. `drwn export sessions --gzip` exits with a tarball.
4. `drwn analyze sessions` prints a processing URL.
5. Open URL in browser — verify analysis progresses and finishes.

#### Task 7.2: `--wait --open` end-to-end

1. `drwn analyze sessions --fresh --wait --open`.
2. Verify terminal blocks ≤5 min, then prints report URL and opens browser.
3. Verify report page renders.

#### Task 7.3: `--archive` error paths

1. `drwn analyze sessions --archive /nonexistent.tar.gz` → "Archive not found", exit 1.
2. `drwn analyze sessions --archive /tmp/foo.zip` (empty file with wrong ext) → "Unsupported extension", exit 1.

#### Task 7.4: Auth-expired smoke

1. Backend-revoke session (e.g., another browser sign-out).
2. `drwn analyze sessions` → "Session expired. Run `drwn login`.", exit 1.

#### Task 7.5: `--dry-run` CI smoke

In CI without network, `drwn analyze sessions --dry-run --archive <fixture>` resolves and prints the plan, exits 0. Also verify `drwn analyze sessions --dry-run` with no archive reports that an inline export would be built without creating one.

## Acceptance Criteria

- [ ] All unit tests pass: `bun test`.
- [ ] Typecheck clean.
- [ ] All five integration checks (7.1–7.5) pass.
- [ ] No new npm dependencies.
- [ ] `drwn analyze sessions` appears in `--help`.
- [ ] `docs/cli-quickref.md` updated.
- [ ] Docusaurus reference page added.

## Testing Strategy

Per analysis 57 §"Testing Strategy". Every network call is injectable; CI runs without backend. Manual integration runs against dev backend only.

## Risks & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Bun's `FormData` + `Bun.file` regresses across versions | Low | High | Pin Bun version in CI; assert FormData boundary handling in upload test (no manual Content-Type). |
| Server's `MAX_TARBALL_BYTES` changes silently | Medium | Low | `--dry-run` and validation use a local `maxArchiveBytes`. 413 message is precise about server limit so the user can adjust. |
| `webBaseUrl` configured wrong → user lands on 404 | Medium | Medium | URL composition is pure; manual integration verifies the dev URL works. Packaged defaults remain out of scope until production URLs are pinned. |
| Poll cadence overloads backend in failure modes | Low | Medium | 2-second cadence matches frontend; 5-minute ceiling caps. Configurable via injected deps for tests, not via CLI flag in v1. |
| Inline export emits a 100+ MB tarball | Low | High | We gzip in inline-export; if even gzipped is over `maxArchiveBytes`, error message tells the user to scope down. Document `.agents/drwn/session-log-exports/` cleanup in the CLI page. |
| Hybrid input model surprises users debugging stale uploads | Medium | Low | Print "Using existing archive" with the path and mtime relative time. Users can `--fresh` or delete the directory. |

## Notes

- Implementation order within each phase: failing test → implement → green → next. Phases are sequential.
- Auth slice (task 37) must be merged before this plan starts. The first step (Task 0.1) is to verify that.
- After Task 7.x passes, this plan is "complete." Mark Status `Completed` and add a `38_completion_*` summary per `rules/00_docs_usage.md`.
