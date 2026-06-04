# Task 38 Completion: Drwn CLI `analyze sessions`

**Task**: [38_drwn-cli-analyze-sessions-implementation-plan.md](./38_drwn-cli-analyze-sessions-implementation-plan.md)
**Completed**: 2026-06-03 PDT
**Status**: Implemented, automated-tested, docs-built, and local-backend upload-smoked
**Commit Status**: No commits made, per instruction
**Worktree Status**: No separate git worktree created, per instruction
**Current Branch**: `remyjkim/docs-overhaul-and-skills-submodule`
**Related Analysis**: [57_drwn-cli-analyze-sessions-target-architecture.md](../analyses/57_drwn-cli-analyze-sessions-target-architecture.md)
**Dependency**: [37_completion_drwn-cli-auth.md](./37_completion_drwn-cli-auth.md)

---

## Executive Summary

Task 38 is complete as a CLI implementation. `drwn analyze sessions` now uploads session-log archives to the analyzer backend, supports explicit archive input, newest-archive reuse, fresh inline export, dry-run planning, optional polling, optional browser opening, and JSON output.

The command builds directly on Task 37's auth layer. It resolves bearer auth from stored credentials or `DRWN_TOKEN` plus `DRWN_ANALYZER_URL`, uploads through the shared analyzer HTTP client, and composes frontend URLs from `analyzer.webBaseUrl` or `DRWN_ANALYZER_WEB_URL`.

Automated tests cover the command and all core helpers without requiring network access. A local-backend smoke reached `http://localhost:8787/api/analyze` and queued a job. A full authenticated report-generation E2E was not completed in this pass; that remains the final manual product-flow check before release because it depends on representative session-log content and analyzer report completion.

---

## Delivered Scope

### Analyzer Config Additions

Task 38 consumes the analyzer config extensions added in Task 37:

- `analyzer.webBaseUrl`
- `analyzer.maxArchiveBytes`

Runtime behavior:

- `webBaseUrl` is optional.
- When `webBaseUrl` is present, the CLI prints and returns frontend URLs.
- When `webBaseUrl` is absent, uploads still succeed and human output prints the job ID plus a configuration hint.
- `maxArchiveBytes` defaults to `104857600` bytes when not configured.

### HTTP Client

Extended `cli/core/http/analyzer-client.ts` with:

- `upload(archivePath, token)`
- `getJob(jobId, token)`

Upload behavior:

- Uses Bun's `Bun.file()` and `FormData`.
- Sends multipart body to:

```text
POST <apiUrl>/api/analyze
```

- Sends:

```text
Authorization: Bearer <token>
```

- Does not manually set multipart `Content-Type`; Bun owns the boundary.
- Parses `{jobId, status: "queued"}` through `AnalyzeUploadResponseSchema`.

Job polling behavior:

- Calls:

```text
GET <apiUrl>/api/jobs/<jobId>
```

- Parses job status through `JobInfoSchema`.
- Maps 401 to `AuthExpiredError`.
- Preserves non-401 HTTP status codes through `ServerError`.

### Analyze Core Helpers

Added `cli/core/analyze/`:

- `find-archive.ts`
- `validate-archive.ts`
- `inline-export.ts`
- `resolve-input.ts`
- `url.ts`

#### Archive Discovery

`findNewestArchive(exportsDir)`:

- returns null when the exports directory is missing or empty
- considers `.tar`, `.tar.gz`, and `.tgz`
- ignores unrelated files
- chooses the archive with the newest mtime

#### Archive Validation

`validateArchive(path, maxBytes)`:

- rejects missing files
- rejects empty files
- rejects unsupported extensions
- rejects oversized archives
- accepts `.tar`, `.tar.gz`, and `.tgz`
- returns archive path, size, and extension

#### Inline Export

`runInlineExport(context)`:

- reuses existing session discovery helpers from `cli/core/export/session-discovery.ts`
- reuses the existing archive writer from `cli/core/export/archiver.ts`
- discovers Claude Code and Codex session logs for the current project
- writes a gzip archive under:

```text
<project>/.agents/drwn/session-log-exports/<timestamp>.tar.gz
```

- throws clearly when no session files are found

#### Input Resolution

`resolveAnalyzeInput()` implements the hybrid input model:

1. `--archive <path>` uses the explicit path.
2. `--fresh` builds an inline gzip archive.
3. Otherwise, the newest existing export is reused.
4. If none exists, a new inline gzip archive is built.

Dry-run is intentionally non-mutating:

- if an archive exists, it validates and reports the plan
- if no archive exists, it reports that an inline export would be built
- it does not call `runInlineExport`
- it does not write a tarball
- it does not call the network
- it does not require auth

#### URL Composition

`processingUrl(webBaseUrl, jobId)` returns:

```text
<webBaseUrl>/processing/<jobId>
```

`reportUrl(webBaseUrl, reportId)` returns:

```text
<webBaseUrl>/report/<reportId>
```

Both use `URL` composition and encode IDs safely.

### Command

Added:

```text
drwn analyze sessions
```

Options:

- `--archive <path>`
- `--fresh`
- `--wait`
- `--open`
- `--json`
- `--dry-run`

Human behavior:

- prints `Using existing archive: <path>` when reusing an existing archive
- prints upload size
- prints a processing URL when `webBaseUrl` is configured
- otherwise prints the queued job ID and a config hint
- prints a final report URL with `--wait` when report URL composition is possible
- warns to stderr when `--open` is requested but no `webBaseUrl` is configured

JSON behavior:

Successful upload emits a single-line object:

```json
{
  "jobId": "job_x",
  "processingUrl": "https://.../processing/job_x",
  "reportUrl": null
}
```

Dry-run emits:

```json
{
  "dryRun": true,
  "source": "existing",
  "archivePath": "...",
  "size": 123,
  "apiUrl": "http://localhost:8787"
}
```

Error mapping:

- missing auth -> `Not authenticated. Run \`drwn login\` first (or set DRWN_TOKEN + DRWN_ANALYZER_URL).`
- 401 -> `Session expired. Run \`drwn login\`.`
- 413 -> `Archive exceeds server limit. Try \`drwn export sessions --gzip\` for a smaller archive.`
- 400 -> server message
- 5xx -> `Server error (<status>). Try again later.`

### Polling

`--wait`:

- polls every 2 seconds
- stops after 5 minutes
- returns final report URL when `status: "completed"` and `reportId` is present
- fails clearly when `status: "failed"`
- timeout message points to the processing page when available

The wait loop is dependency-injected in tests for clock and sleep control.

### Browser Opening

`--open`:

- opens the processing URL by default
- opens the final report URL when combined with `--wait`
- uses the shared browser opener from Task 37
- does not fail the upload when no `webBaseUrl` is configured

### CLI Registration

- Registered `AnalyzeSessionsCommand` in `cli/index.ts`.
- Help output includes the `Analyze` category.
- Command help includes Details and Examples sections.

### Documentation

- Updated `docs/cli-quickref.md`.
- Added `docs-docusaurus/docs/reference/cli/analyze.md`.
- Updated `docs-docusaurus/sidebars.ts`.
- Updated `.ai/knowledges/10_drwn-cli-architecture.md`.
- Updated the task plan with implementation status and verification notes.

---

## Files Added

- `cli/commands/analyze/sessions.ts`
- `cli/core/analyze/find-archive.ts`
- `cli/core/analyze/inline-export.ts`
- `cli/core/analyze/resolve-input.ts`
- `cli/core/analyze/url.ts`
- `cli/core/analyze/validate-archive.ts`
- `docs-docusaurus/docs/reference/cli/analyze.md`
- `test/commands-analyze-sessions.test.ts`
- `test/core-analyze-find-archive.test.ts`
- `test/core-analyze-inline-export.test.ts`
- `test/core-analyze-resolve-input.test.ts`
- `test/core-analyze-url.test.ts`
- `test/core-analyze-validate-archive.test.ts`
- `test/core-http-analyzer-client-jobs.test.ts`
- `test/core-http-analyzer-client-upload.test.ts`
- `.ai/tasks/38_completion_drwn-cli-analyze-sessions.md`

## Files Modified

- `.ai/knowledges/10_drwn-cli-architecture.md`
- `.ai/tasks/38_drwn-cli-analyze-sessions-implementation-plan.md`
- `cli/core/http/analyzer-client.ts`
- `cli/core/http/schemas.ts`
- `cli/index.ts`
- `docs-docusaurus/sidebars.ts`
- `docs/cli-quickref.md`

Task 38 also relies on Task 37 modifications to:

- `cli/core/types.ts`
- `cli/core/user-config.ts`
- `cli/core/auth/config.ts`
- `cli/core/auth/resolve-token.ts`
- `cli/core/paths.ts`

---

## TDD And Test Coverage

### Core Helper Coverage

Covered:

- newest archive discovery from missing/empty directories
- filtering archive extensions
- mtime ordering
- archive validation for missing files
- archive validation for empty files
- archive validation for unsupported extensions
- archive validation for oversized files
- accepting `.tar`, `.tar.gz`, and `.tgz`
- URL composition for processing/report pages
- explicit archive precedence
- `--fresh` inline export precedence
- existing archive reuse
- fallback inline export
- dry-run avoiding inline export
- inline export error when no session logs exist
- inline export writing gzip archive to default exports dir

### HTTP Client Coverage

Covered:

- upload posts multipart with `Authorization` header
- upload returns parsed queued response
- upload maps 401 to `AuthExpiredError`
- upload maps 413 and 5xx to `ServerError`
- job fetch parses job response
- job fetch maps 401 to `AuthExpiredError`
- job fetch maps 404 to `ServerError`
- malformed job JSON is rejected by schema validation

### Command Coverage

Covered:

- default path uses existing archive
- `--dry-run` with no archive is non-mutating and does not require auth
- `--archive` validates and uploads explicit path
- archive validation failure exits before upload
- `--wait --json` emits final report URL
- 401 upload error maps to session-expired message
- 413 upload error maps to archive-too-large message
- `--open` without `webBaseUrl` does not spawn browser and prints hint

### Full-Suite Interaction Coverage

The command also participates in:

- CLI help shape tests
- command output contract tests
- full repository test suite

---

## Verification

### Automated Gates

Commands run after implementation:

```bash
bun run typecheck
bun test test/core-http-analyzer-client-upload.test.ts \
  test/core-http-analyzer-client-jobs.test.ts \
  test/core-analyze-find-archive.test.ts \
  test/core-analyze-validate-archive.test.ts \
  test/core-analyze-url.test.ts \
  test/core-analyze-resolve-input.test.ts \
  test/core-analyze-inline-export.test.ts \
  test/commands-analyze-sessions.test.ts
bun test
bun run docs:build
```

Results:

- `bun run typecheck`: passed.
- Focused analyze helper/client/command suite: 21 pass initially for helpers/client, then 7 pass for command-level tests; combined focused auth/analyze suite later passed 77 tests.
- Full repository suite before final auth hardening: 614 pass, 0 fail, 2324 expectations, 118 files.
- Full repository suite after final auth hardening: 618 pass, 0 fail, 2358 expectations, 119 files.
- Docusaurus build: passed.

### Local Backend Smoke

Backend target:

```text
http://localhost:8787
```

Health check:

```text
GET /health -> {"ok": true}
```

Dry-run with explicit archive:

```bash
DRWN_ANALYZER_URL=http://localhost:8787 \
bun run cli/index.ts analyze sessions --dry-run --archive <fixture>.tar.gz
```

Observed:

- exited 0
- printed a dry-run plan
- did not require auth
- did not call upload

Upload path smoke:

```bash
DRWN_TOKEN=fake \
DRWN_ANALYZER_URL=http://localhost:8787 \
bun run cli/index.ts analyze sessions --archive <fixture>.tar.gz
```

Observed:

- command reached the local backend upload path
- local backend returned a queued job ID
- CLI printed:

```text
Uploading 7 B...
Job queued as <jobId>. Configure analyzer.webBaseUrl or DRWN_ANALYZER_WEB_URL to get a clickable URL.
```

Important caveat: the local backend queued this upload with a fake token, while `drwn whoami` with the same fake token correctly returned `Session expired. Run \`drwn login\`.` This local upload smoke is therefore evidence that the CLI upload request shape reaches the backend, not evidence of backend auth enforcement. CLI-side auth/error behavior is covered by injected HTTP tests.

### Auth Dependency Verification

Task 37 was live-verified against the same local backend:

- real device-flow login completed after browser approval
- stored `whoami` succeeded
- `whoami --json` succeeded
- logout removed credentials
- post-logout `whoami` failed as expected

That validates the auth foundation `drwn analyze sessions` depends on.

---

## Scope Decisions

### No Packaged Analyzer Defaults

Task 38 did not add production or dev analyzer defaults to packaged config.

Reason: URLs must be explicit until the product decision is made. Local/dev runs use `DRWN_ANALYZER_URL` and optionally `DRWN_ANALYZER_WEB_URL`.

### No `getReport` In V1

The HTTP client only adds `upload` and `getJob`.

Reason: Task 38's scope is queue/upload plus processing/report URL handoff. Report-summary retrieval/rendering is future work.

### No `--no-poll`

The command's default is already no polling. `--wait` opts into polling.

### Dry-Run Is Non-Mutating

Dry-run intentionally avoids inline archive creation when no archive exists.

Reason: users and CI should be able to validate intent without creating files, requiring auth, or touching the network.

---

## Residual Risks And Follow-Ups

| Risk / Gap | Status | Suggested Follow-Up |
|---|---|---|
| Full authenticated analyze report E2E was not completed | Pending manual/product-flow check | After a real login, run `drwn export sessions --gzip`, then `DRWN_ANALYZER_WEB_URL=https://darwinian-harness-services.pages.dev drwn analyze sessions --wait --open` and verify the report page. |
| Local backend upload accepted a fake token | Observed local-backend behavior | Confirm backend auth middleware behavior for `/api/analyze` before relying on local upload auth as an integration signal. |
| Inline export can fail when no local Claude/Codex session logs exist | Expected | Command reports a clear "No session files found" error; dry-run remains non-mutating. |
| Incorrect `webBaseUrl` creates unusable frontend links | Accepted | URL composition is deterministic; docs show the dev frontend URL; `webBaseUrl` remains explicit. |
| Large archives may fail locally or server-side | Mitigated | Local max-size validation and 413 error mapping are implemented. |

---

## Release Readiness Notes

Before treating analyzer upload as release-complete, run the pending real product-flow check with an authenticated user and representative session logs:

```bash
DRWN_ANALYZER_URL=http://localhost:8787 drwn login
drwn export sessions --gzip
DRWN_ANALYZER_URL=http://localhost:8787 \
DRWN_ANALYZER_WEB_URL=https://darwinian-harness-services.pages.dev \
drwn analyze sessions --wait --open
```

Expected:

- upload succeeds
- processing URL opens
- wait loop reaches completed job
- report URL opens
- report page renders

---

## Workspace Notes

- No commit was created.
- No git worktree was created.
- The repo had unrelated dirty/untracked files before this completion report. They were not reverted.
- This completion document is itself uncommitted, per instruction.
