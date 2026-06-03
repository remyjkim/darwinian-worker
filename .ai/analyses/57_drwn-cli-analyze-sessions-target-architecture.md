# Drwn CLI `analyze sessions` Target Architecture

**Date**: 2026-06-03
**Status**: Draft
**References**: [analyses/21_analyzer_integration.md, analyses/22_analyzer_cli_implementation_plan.md, analyses/56_drwn-cli-auth-target-architecture.md, tasks/38_drwn-cli-analyze-sessions-implementation-plan.md, /Users/pureicis/dev/darwinian-harness-services/backend/src/routes/analyze.ts, /Users/pureicis/dev/darwinian-harness-services/backend/src/routes/jobs.ts, /Users/pureicis/dev/darwinian-harness-services/backend/src/queue/consumer.ts, /Users/pureicis/dev/darwinian-harness-services/frontend/src/App.tsx, /Users/pureicis/dev/darwinian-harness-services/frontend/src/routes/UploadPage.tsx, /Users/pureicis/dev/darwinian-harness-services/frontend/src/routes/ProcessingPage.tsx, cli/commands/export/sessions.ts, cli/core/export/archiver.ts, cli/core/export/session-discovery.ts]

---

## Executive Summary

`drwn analyze sessions` is the CLI's first networked command: it uploads a tarball of Claude / Codex session logs to the Darwinian Harness Services backend and prints a URL where the user can watch the analysis run in their browser. The command uses a **hybrid input model** — it defaults to the newest tarball under `.agents/drwn/session-log-exports/`, runs `drwn export sessions --gzip` inline when no archive exists (or when `--fresh` is passed), and accepts an explicit `--archive <path>` for callers that produced the tarball through other means.

The upload contract is verified: `POST /api/analyze` accepts a multipart form with a `file` field (any of `.tar`, `.tar.gz`, `.tgz`, up to `MAX_TARBALL_BYTES` ≈ 100 MB), persists to R2, enqueues a Cloudflare queue, and returns `{ jobId, status: "queued" }` (HTTP 201). The backend does **not** return a URL — the CLI composes `${webBaseUrl}/processing/${jobId}` and `${webBaseUrl}/report/${reportId}` from configured base URLs. The default mode prints the processing URL immediately and exits (the value prop is "get me to the browser"); `--wait` polls `/api/jobs/:id` until the report is ready and prints the report URL; `--open` opens the URL in the browser.

This command hard-depends on the auth slice (analysis 56, plan 37): it consumes `resolveToken()`, the credentials store, and the shared `analyzer-client.ts` module. Auth ships first; analyze layers on top.

---

## Context

### What's already in place

`drwn export sessions` (`cli/commands/export/sessions.ts`) discovers Claude logs at `~/.claude/projects` and Codex logs at `~/.codex/sessions`, archives them to `.agents/drwn/session-log-exports/<timestamp>.tar[.gz]`, and prints an "upload-ready" note. The command supports `--gzip`, `--out <path>`, and `--dry-run`. Building a separate `analyze` command lets export-only callers (CI, "I want to inspect the archive locally") coexist with one-shot analyze-now callers.

### What the backend gives us

- `POST /api/analyze` — `multipart/form-data`, field `file`. Validates extension (`.tar` / `.tar.gz` / `.tgz`), size limit `MAX_TARBALL_BYTES` (default 104 857 600 bytes ≈ 100 MB), and that the file is non-empty. Stores at `uploads/${jobId}/${filename}` in R2 and enqueues `ANALYSIS_QUEUE` with `{ jobId, r2Key }`. Returns `{ jobId, status: "queued" }` with status 201.
- `GET /api/jobs/:id` — returns `{ id, status: "queued"|"processing"|"completed"|"failed", createdAt, updatedAt, error, reportId }`. User-scoped: 404 if the caller didn't create the job.
- `GET /api/reports/:id` — returns the full metrics blob. We do not need this for the basic flow (the URL is enough); it's available for a future `--json` summary mode.

The queue consumer (`backend/src/queue/consumer.ts`) downloads the archive, untars in a worker, parses each session JSONL, computes metrics, writes a `reportId`, then spawns downstream loop-profile scoring requests (unrelated to our flow). When the job hits `status === "completed"` with a non-null `reportId`, the report URL is ready.

### What the frontend exposes

`frontend/src/App.tsx` routes:

- `/processing/:jobId` — public route (not gated by `RequireAuth`); polls `/api/jobs/:id` every 2s with `react-query`, shows progress, and once `job.status === "completed"` and `job.reportId` is set, links to `/report/${reportId}`.
- `/report/:reportId` — public route; renders the report from `/api/reports/:id`.

Because the routes are not auth-gated at the React-Router level, the URLs are safely shareable. The underlying API calls still require a Better Auth session, so non-owners hitting the URL will see auth prompts — that's the right behavior.

### What's missing

The backend does not return a URL in either response. The CLI must compose URLs from a `webBaseUrl` value. The natural source is config: `analyzer.webBaseUrl` (mirroring backend env `APP_BASE_URL`), with env override `DRWN_ANALYZER_WEB_URL`.

### Constraints inherited

- Auth: assumes the auth slice from analysis 56 is shipped. Specifically: `resolveToken(context)` returns `{ token, apiUrl } | null`, and the shared `cli/core/http/analyzer-client.ts` already exists with `getSession`, `requestDeviceCode`, etc. — this work adds `upload`, `getJob`, `getReport`.
- Bun runtime, Clipanion 4, ABOUTME comments, `BaseCommand` for command classes.
- No new deps beyond what auth introduces (`zod`).

---

## Investigation

### Multipart upload from Bun

Bun's `fetch` accepts `FormData` natively. `Bun.file(path)` returns a `File`-like object compatible with `FormData.append`. The reference frontend (`UploadPage.tsx`) calls `apiClient.uploadArchive(file)` which under the hood uses `FormData` and `fetch` without setting `Content-Type` manually (the browser sets the multipart boundary). The same shape works in Bun.

```ts
const file = Bun.file(archivePath);
const form = new FormData();
form.append("file", file, basename(archivePath));
const res = await fetch(`${apiUrl}/api/analyze`, {
  method: "POST",
  body: form,
  headers: { authorization: `Bearer ${token}` },  // do NOT set content-type
});
```

The backend reads the file via `c.req.formData()` (`backend/src/routes/analyze.ts`). Filename is preserved from the upload and used as the R2 key suffix.

### Archive validation matrix

Both client and server validate. The CLI fails fast (no network round-trip) when:

| Check | Server returns | CLI pre-check |
|---|---|---|
| Missing file | 400 "Missing file" | n/a |
| Empty file | 400 "Empty file" | size > 0 |
| Wrong extension | 400 "Unsupported file type" | `.tar` / `.tar.gz` / `.tgz` |
| > MAX_TARBALL_BYTES | 413 "File too large" | size <= 100 MB (configurable via `analyzer.maxArchiveBytes`?) |

Pre-checks are belt-and-suspenders. The CLI still surfaces server errors verbatim when they slip through.

### Hybrid input model

Three input sources, in priority order:

1. `--archive <path>` — explicit. Use as-is. If it doesn't exist or fails validation, error out (do not auto-fall-back).
2. `--fresh` — force a new export via `drwn export sessions --gzip`, then upload it.
3. **Default (no flags)** — look for the newest file matching `.agents/drwn/session-log-exports/*.tar*`. If found, use it. If not, fall through to the inline export step.

The "newest tarball" heuristic uses `stat.mtime`. The CLI prints a one-line note when it picks an existing tarball: `Using existing archive: <path> (created <relative time>)`. This makes the behavior auditable without forcing the user to think about it.

Inline export reuses the existing `archiveSessions` / `discoverClaudeSessions` / `discoverCodexSessions` helpers from `cli/core/export/` rather than shelling out to `drwn export sessions` as a subprocess. This avoids spawn overhead and keeps the failure modes consistent.

### URL composition

```ts
function processingUrl(webBaseUrl: string, jobId: string): string {
  return new URL(`/processing/${jobId}`, webBaseUrl).toString();
}

function reportUrl(webBaseUrl: string, reportId: string): string {
  return new URL(`/report/${reportId}`, webBaseUrl).toString();
}
```

`webBaseUrl` resolution: env `DRWN_ANALYZER_WEB_URL` overrides `config.analyzer.webBaseUrl`. If neither is set, the CLI prints `Job queued as <jobId>. Configure analyzer.webBaseUrl to get a clickable URL.` and exits 0 — degrades gracefully to "the job ran" without a hard failure.

### Polling, when enabled

Default mode: print processing URL, exit 0. Most users want to switch to the browser and watch.

`--wait` mode: poll `GET /api/jobs/:id` every 2 seconds (configurable internally), with a hard ceiling of 5 minutes. Terminal states:

- `completed` + `reportId !== null` → print report URL, optionally open it (`--open`).
- `failed` → print `Analysis failed: <error>` and exit 1.
- Timeout → print `Polling timed out after 5 minutes. Check <processingUrl> for live status.` and exit 1.

The frontend `ProcessingPage` polls at 2s while queued/processing; the CLI matches that cadence to keep server load comparable.

### `--open`

When set, `Bun.spawn` the platform browser-open helper from `cli/core/auth/browser.ts` (introduced by the auth slice). `--open` works with or without `--wait`:

- Without `--wait`: opens the processing URL immediately.
- With `--wait`: opens the report URL on success.

### Auth handoff

The command imports `resolveToken` from `cli/core/auth/resolve-token.ts`. The token is required:

| Condition | Message | Exit |
|---|---|---|
| No env-var token AND no credentials file | `Not authenticated. Run drwn login first (or set DRWN_TOKEN + DRWN_ANALYZER_URL).` | 1 |
| 401 from upload | `Session expired. Run drwn login.` | 1 |
| 401 from job poll | Same. | 1 |

### Command shape

```
drwn analyze sessions [options]
  --archive <path>       Path to a pre-built .tar / .tar.gz / .tgz to upload.
  --fresh                Force a new export before uploading. Ignored if --archive is set.
  --wait                 Poll until the analysis finishes; print the report URL.
  --open                 Open the URL in the default browser when ready.
  --no-poll              Alias for default behavior; explicit for scripts.
  --json                 Emit { jobId, processingUrl, reportUrl? } as JSON.
  --dry-run              Resolve inputs and print the upload plan without uploading.
```

`drwn analyze sessions` lives parallel to `drwn export sessions`. The two-word path matches `card source set`, `library defaults add-skill`, etc., and leaves headroom for future subcommands (`drwn analyze tarball`, `drwn analyze loop`, etc.).

### Backwards compatibility with `--no-poll`

The default is already "no poll." `--no-poll` is provided as an explicit flag so scripts can say what they mean. It is mutually exclusive with `--wait` and `--open` (an unopenable URL isn't useful).

---

## Findings

1. **Backend contracts are stable and verified.** All three endpoints we touch (`/api/analyze`, `/api/jobs/:id`, `/api/reports/:id`) are exercised by the frontend today. No backend changes needed.

2. **The backend does not return a URL.** This is the load-bearing finding for command UX. The CLI must compose URLs from a configured base. We expose `analyzer.webBaseUrl` and `DRWN_ANALYZER_WEB_URL`.

3. **Default mode should print the URL and exit.** Polling for completion is the wrong default: the value the CLI delivers is "stop staring at the terminal, switch to the browser." Polling is opt-in via `--wait`.

4. **The hybrid input model is worth the complexity.** Re-exporting on every invocation duplicates work and surprises users debugging mismatched results. Requiring an explicit `--archive` everywhere is friction. The "newest tarball, else export" default is the obvious right behavior and is auditable with one print line.

5. **Multipart upload works natively in Bun.** No need for the `form-data` npm package.

6. **Pre-check archive size and extension.** Saves round-trips and gives clearer errors. Server validation stays as the source of truth.

7. **The "loop profile" downstream pipeline is irrelevant for the CLI.** The queue consumer spawns scoring jobs after the report is ready; those continue in the background and surface in `/sessions`. The CLI does not need to wait for or surface them — `report/:reportId` is the right endpoint.

8. **Auth must ship first.** Every interesting path in this command requires `resolveToken` and the shared HTTP client.

---

## Target Architecture

### Command UX walkthrough

**Happy path (default):**

```text
$ drwn analyze sessions
Using existing archive: .agents/drwn/session-log-exports/20260603-110530.tar.gz (5 minutes ago)
Uploading 12.4 MB...
Job queued. Watch progress here:
  https://app.darwiniantools.com/processing/job_01h8...
```

**Happy path with `--wait --open`:**

```text
$ drwn analyze sessions --wait --open
Building archive from ~/.claude/projects and ~/.codex/sessions...
Archived 47 file(s) to: .agents/drwn/session-log-exports/20260603-184201.tar.gz
Uploading 12.4 MB...
Job queued: job_01h8...
Waiting for analysis to complete (this usually takes 30-90 seconds)...
✓ Analysis ready:
  https://app.darwiniantools.com/report/rep_01h8...
Opening in browser...
```

**`--archive` with fresh override conflict:**

```text
$ drwn analyze sessions --archive /tmp/x.tar.gz --fresh
--fresh is ignored when --archive is provided.
Uploading /tmp/x.tar.gz (8.1 MB)...
...
```

**No credentials:**

```text
$ drwn analyze sessions
Not authenticated. Run `drwn login` first (or set DRWN_TOKEN + DRWN_ANALYZER_URL).
$ echo $?
1
```

### Algorithm

```text
1. Resolve auth:
     auth = resolveToken(context)
     if auth is null → exit 1 with "Not authenticated."
   Resolve URLs:
     apiUrl = auth.apiUrl  // from env var or credentials
     webBaseUrl = process.env.DRWN_ANALYZER_WEB_URL ?? config.analyzer.webBaseUrl
     // webBaseUrl may be null; that affects the printed message only.

2. Resolve input archive:
     if (--archive) archivePath = <provided>
     else if (--fresh) archivePath = await runInlineExport()
     else {
       existing = newestFile(".agents/drwn/session-log-exports", /\.(tar|tar\.gz|tgz)$/)
       archivePath = existing ?? await runInlineExport()
     }

3. Validate archive locally:
     - exists
     - non-empty
     - extension is .tar | .tar.gz | .tgz
     - size <= MAX_ARCHIVE_BYTES (100 MB by default; configurable via analyzer.maxArchiveBytes)
   On failure: print error, exit 1.

4. Optionally print "Uploading <size>..."

5. POST {apiUrl}/api/analyze (multipart, file=<Bun.file(archivePath)>)
   On 401 → exit 1 with "Session expired. Run drwn login."
   On 413 → exit 1 with "Archive exceeds server limit (<size> > MAX_TARBALL_BYTES)."
   On 400 → exit 1 with server's text response verbatim.
   On 5xx → exit 1 with "Server error <status>. Try again later."
   On 201 → parse { jobId, status: "queued" }

6. Compute processingUrl = `${webBaseUrl}/processing/${jobId}` (if webBaseUrl).
   Print "Job queued. Watch progress here:\n  <processingUrl>" (or "Job queued as <jobId>." if no webBaseUrl).

7. If --wait:
     start = Date.now()
     loop:
       sleep 2000
       job = GET {apiUrl}/api/jobs/{jobId}
       if job.status === "completed" && job.reportId → exit loop
       if job.status === "failed" → exit 1 with "Analysis failed: <job.error>"
       if Date.now() - start > 5min → exit 1 with timeout message
     reportUrl = `${webBaseUrl}/report/${job.reportId}` (if webBaseUrl)
     Print "Analysis ready:\n  <reportUrl>"

8. If --open: openBrowser(reportUrl ?? processingUrl). Errors swallowed.

9. If --json: emit `{ jobId, processingUrl, reportUrl? }` to stdout (one line).

10. Exit 0.
```

### HTTP client additions

`cli/core/http/analyzer-client.ts` (introduced by auth slice) gains:

```ts
export interface AnalyzerClient {
  // existing (auth):
  requestDeviceCode(clientId: string): Promise<DeviceCodeResponse>;
  pollDeviceToken(deviceCode: string, clientId: string): Promise<DeviceTokenPollResult>;
  getSession(token: string): Promise<SessionResponse>;
  signOut(token: string): Promise<void>;
  // added (analyze):
  upload(archivePath: string, token: string): Promise<AnalyzeUploadResponse>;
  getJob(jobId: string, token: string): Promise<JobInfo>;
  getReport(reportId: string, token: string): Promise<AnalysisReport>;  // for future --json summary
}
```

`upload` uses `Bun.file(archivePath)`, builds `FormData`, calls `fetch` without setting `Content-Type` (the boundary is auto-generated). Schema validation via zod.

### Schemas

```ts
// cli/core/http/schemas.ts (additions)
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

// AnalysisReportSchema deferred — only needed if we add a CLI report summary.
```

### Inline export helper

```ts
// cli/core/analyze/inline-export.ts
import { resolveProjectRoot, deriveProjectSlug, discoverClaudeSessions, discoverCodexSessions, gitWorktreeRoots } from "../export/session-discovery";
import { archiveSessions, makeTimestamp } from "../export/archiver";

export async function runInlineExport(context: AgentsContext): Promise<string> {
  const projectRoot = await resolveProjectRoot(context.cwd);
  const projectSlug = deriveProjectSlug(projectRoot);
  const projectRoots = await gitWorktreeRoots(projectRoot);
  const claudeProjectsDir = join(context.homeDir, ".claude", "projects");
  const codexSessionsDir = join(context.homeDir, ".codex", "sessions");
  const [claudeFiles, codexFiles] = await Promise.all([
    discoverClaudeSessions(claudeProjectsDir, projectSlug),
    discoverCodexSessions(codexSessionsDir, projectRoots),
  ]);
  const files = [...claudeFiles, ...codexFiles];
  if (files.length === 0) {
    throw new Error("No session files found for this project. Nothing to analyze.");
  }
  const outputPath = join(
    context.cwd,
    ".agents", "drwn", "session-log-exports",
    `${makeTimestamp()}.tar.gz`,
  );
  await archiveSessions(files, outputPath, { gzip: true });
  return outputPath;
}
```

Always gzip in the inline path: smaller upload, no user-visible decision.

### Newest-archive helper

```ts
// cli/core/analyze/find-archive.ts
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

export async function findNewestArchive(exportsDir: string): Promise<string | null> {
  let entries: string[];
  try {
    entries = await readdir(exportsDir);
  } catch {
    return null;
  }
  const candidates = entries.filter((e) => /\.(tar|tar\.gz|tgz)$/.test(e));
  if (candidates.length === 0) return null;
  const stats = await Promise.all(
    candidates.map(async (e) => ({ path: join(exportsDir, e), mtime: (await stat(join(exportsDir, e))).mtimeMs })),
  );
  stats.sort((a, b) => b.mtime - a.mtime);
  return stats[0].path;
}
```

### Config schema additions

`cli/core/types.ts` `CanonicalConfig` (extending the auth slice's `analyzer` section):

```ts
analyzer?: {
  apiUrl?: string;
  clientId?: string;
  webBaseUrl?: string;            // added by analyze
  maxArchiveBytes?: number;       // added by analyze; optional override of 100 MB
};
```

### Environment variable contract (full)

| Variable | Purpose | Owner |
|---|---|---|
| `DRWN_ANALYZER_URL` | API base URL | auth |
| `DRWN_ANALYZER_WEB_URL` | Frontend base URL for composed report links | analyze |
| `DRWN_TOKEN` | Pre-acquired bearer token | auth |

### File layout (analyze additions only)

```
cli/
├── commands/
│   └── analyze/
│       └── sessions.ts             # the command class
├── core/
│   └── analyze/
│       ├── inline-export.ts        # reuses export/* helpers
│       ├── find-archive.ts         # newest-tarball search
│       ├── validate-archive.ts     # extension + size pre-check
│       └── url.ts                  # processingUrl / reportUrl composers
├── core/http/
│   └── analyzer-client.ts          # AUTH SLICE adds device+session; ANALYZE adds upload/getJob/getReport
└── core/http/
    └── schemas.ts                  # AUTH adds device/session; ANALYZE adds upload/job/report
```

### Registration

```ts
// cli/index.ts
import { AnalyzeSessionsCommand } from "./commands/analyze/sessions";
cli.register(AnalyzeSessionsCommand);
```

`Analyze` becomes a new help category. Future subcommands (`drwn analyze loop`, etc.) slot in here.

---

## Testing Strategy

| Layer | What | How |
|---|---|---|
| Unit | `findNewestArchive` | Tmpdir with multiple extensions/mtimes; assert correct winner; empty dir → null; missing dir → null. |
| Unit | `validateArchive` | Each failure mode (empty, wrong ext, too big) returns a specific error; happy path returns ok. |
| Unit | URL composers | Various base URLs (with/without trailing slash) compose correctly. |
| Unit | `inline-export` wiring | Mock `discoverClaudeSessions`/`discoverCodexSessions`; assert archive path is returned; no files → throws. |
| Unit | `analyzer-client.upload` | Inject `fetch`; capture FormData and headers; assert no Content-Type set; assert auth header present. |
| Unit | `analyzer-client.getJob` | Inject `fetch`; 200 happy path, 401 → AuthExpiredError, 404 → ServerError. |
| Unit | Polling loop | Inject `getJob` results sequence: queued → processing → completed → break. failed → exits. Timeout via injected clock → exits with timeout msg. |
| Unit | Command happy paths | Mock auth, mock client, mock filesystem; exercise each flag combination. |
| Integration (manual) | End-to-end against dev backend | `drwn login`, then `drwn analyze sessions --wait --open`, verify report page loads. |
| Integration (manual) | `--fresh` path | Delete `.agents/drwn/session-log-exports/`, run command, verify new archive created and uploaded. |
| Integration (manual) | 413 path | Construct a >100 MB archive; verify 413 surfaces cleanly. |
| Smoke (CI) | `--dry-run` | Resolves input, prints plan, never touches network. CI exercises this. |

The reference frontend `UploadPage.tsx` and `ProcessingPage.tsx` serve as a behavioral oracle for what "good" looks like; manual integration tests compare the CLI's behavior to the equivalent web flow.

---

## Recommendations

1. **Ship after auth (plan 37). Do not bundle.** Two PRs, two reviews, two rollouts.

2. **Default to "fire and forget."** Polling is opt-in. Most analyze runs end with the user switching to the browser; staring at a spinner in the terminal is the worse UX.

3. **Always gzip on the inline export path.** The exported tar can be 10x larger than the gzipped version; the upload is the slow leg.

4. **Print the processing URL before the report URL is known.** It's the only URL we can promise on success of the upload. The processing page itself shows the report URL once ready, so the user has a path even without `--wait`.

5. **Reuse the auth slice's HTTP client.** Resist the temptation to create a parallel `cli/core/analyze/client.ts`. One client is simpler to evolve.

6. **Pre-validate the archive.** Server validates too, but a 413 surfaced after a 30-second upload is a worse experience than a one-line "Archive is 142 MB, server limit is 100 MB" before the upload starts.

7. **Don't surface the loop-profile downstream pipeline.** It's an internal optimization tied to the web app's `/sessions` UI. The CLI's responsibility ends at the report URL.

8. **Capture the timing-sensitive contract in a comment** at the top of the polling helper, matching the auth slice's pattern. The 2-second poll cadence and 5-minute ceiling are choices, not natural laws.

---

## Open Questions

| Question | Notes |
|---|---|
| Should `--wait` poll `/jobs/:id/loop-sessions` too, to mirror the web UX? | No. Loop scoring is a separate pipeline; the CLI's contract is "report URL." If users want loop-session detail, the web app surface is richer. |
| Should `--json` always include `reportUrl`, even when null? | Yes, with `reportUrl: null` when polling didn't happen. Predictable shape is easier to script. |
| Should there be a `--archive-stdin` mode? | Probably not. Files-on-disk is the universal case; piping tar bytes through Bun fetch is doable but niche. Defer. |
| Should the CLI delete the local archive on successful upload? | No. Users may want to inspect or re-upload. The export command owns the lifecycle of the archives directory. |
| What if the user is signed in to two different `apiUrl`s simultaneously? | Out of scope. Single credentials file, single `api_url`. Multi-tenant support is a future RFC. |
| Should `--wait` poll cadence be configurable? | Not initially. 2s mirrors the frontend; it's a sensible default. |
| Should we expose progress as a streaming response? | The backend doesn't support that; we'd have to long-poll `/jobs/:id`. Defer. |

---

## Appendix

### Reference: command class skeleton

```ts
// cli/commands/analyze/sessions.ts
// ABOUTME: Implements `drwn analyze sessions` — uploads session-log archive, prints processing URL.
// ABOUTME: Hybrid input: --archive | --fresh | newest in .agents/drwn/session-log-exports | inline export.

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { resolveToken } from "../../core/auth/resolve-token";
import { createAnalyzerClient } from "../../core/http/analyzer-client";
import { findNewestArchive } from "../../core/analyze/find-archive";
import { runInlineExport } from "../../core/analyze/inline-export";
import { validateArchive } from "../../core/analyze/validate-archive";
import { processingUrl, reportUrl } from "../../core/analyze/url";
import { openBrowser } from "../../core/auth/browser";
import { loadEffectiveConfig } from "../../core/user-config";
import { join } from "node:path";

export class AnalyzeSessionsCommand extends BaseCommand {
  static override paths = [["analyze", "sessions"]];
  static override usage = BaseCommand.Usage({
    category: "Analyze",
    description: "Upload session logs to the analyzer and return a viewing URL.",
    details: `...`,
    examples: [
      ["Upload newest local archive (or build one)", "drwn analyze sessions"],
      ["Build a fresh archive first", "drwn analyze sessions --fresh"],
      ["Wait for the report URL, then open it", "drwn analyze sessions --wait --open"],
      ["Upload a specific archive", "drwn analyze sessions --archive /tmp/sessions.tar.gz"],
    ],
  });

  archive = Option.String("--archive", { description: "Path to a pre-built archive." });
  fresh = Option.Boolean("--fresh", false, { description: "Build a new archive even if one exists." });
  wait = Option.Boolean("--wait", false, { description: "Poll until the report is ready." });
  open = Option.Boolean("--open", false, { description: "Open the URL in the browser." });
  noPoll = Option.Boolean("--no-poll", false, { description: "Explicit no-poll (default)." });
  json = Option.Boolean("--json", false, { description: "Emit JSON to stdout." });
  dryRun = Option.Boolean("--dry-run", false, { description: "Resolve inputs and exit." });

  async execute() {
    // (1) auth + URLs
    // (2) resolve archive (--archive | --fresh | newest | inline export)
    // (3) validate archive
    // (4) if dry-run, print plan and exit 0
    // (5) upload
    // (6) compose + print processing URL
    // (7) if --wait, poll loop -> reportUrl
    // (8) if --open, openBrowser(reportUrl ?? processingUrl)
    // (9) if --json, print json
    // (10) exit 0
  }
}
```

### Reference: upload method

```ts
// cli/core/http/analyzer-client.ts (addition)
async upload(archivePath: string, token: string): Promise<AnalyzeUploadResponse> {
  const file = Bun.file(archivePath);
  const form = new FormData();
  form.append("file", file, basename(archivePath));
  const res = await fetcher(`${apiUrl}/api/analyze`, {
    method: "POST",
    body: form,
    headers: { authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new AuthExpiredError();
  if (res.status === 413) throw new ServerError(await res.text(), 413);
  if (!res.ok) throw new ServerError(await res.text(), res.status);
  return AnalyzeUploadResponseSchema.parse(await res.json());
}
```

### Default polling cadence rationale

The frontend `ProcessingPage` calls `getJobQueryOptions(jobId)` with `refetchInterval: 2000` while the job is `queued` or `processing`. Matching that cadence in the CLI means we don't double the per-job load on the backend for a `drwn analyze --wait` user. The 5-minute ceiling is empirical: typical jobs finish in under 90 seconds; 5× that gives generous headroom for cold queues without indefinite hanging.

### Why we don't need `getReport` for v1

The user-visible artifact is the report **page**, not the metrics blob. The page calls `/api/reports/:id` from the browser; the CLI does not need to. We define the schema and method in case a future `--summary` mode wants to inline-render key metrics, but the v1 flow stops at the URL.

### Sequencing recap

- Plan 37 (auth) merges first. After merge: `drwn login` / `drwn logout` / `drwn whoami` work against the dev backend, credentials persist correctly, env-var override works.
- Plan 38 (this command) merges second. It reuses `resolveToken`, the credentials store, and the shared HTTP client. No re-implementation of auth code.
