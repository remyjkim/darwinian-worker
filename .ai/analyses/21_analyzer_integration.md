# Session Log Analyzer CLI Integration

**Status**: Revised
**Created**: 2026-04-28
**Updated**: 2026-04-28
**References**: `beginning-agents/.ai/analyses/03_project_design.md`, `beginning-agents/.ai/analyses/04_auth_design.md`
**Priority**: High

---

## Executive Summary

Add a `bgng analyze` command that discovers Claude Code session logs, packages them into a tarball, uploads to the session log analyzer API, polls for completion, and renders the analysis report. Authentication uses Better Auth's device authorization plugin (RFC 8628) — the CLI requests a device code from our own backend, the user approves in a browser, and the CLI receives an access token. No external auth service calls. The command follows existing bgng patterns for output, config, and error handling.

---

## Target Architecture

```text
bgng analyze
  → discover session logs at ~/.claude/projects/
  → tar -czf into temp archive
  → POST /api/analyze (Bearer token)
  → poll GET /api/jobs/:id
  → GET /api/reports/:id
  → render report (table or --json)

bgng login
  → POST {apiUrl}/api/auth/device/code → user_code + verification_uri
  → user visits our app, signs in with Google, approves device
  → CLI polls POST {apiUrl}/api/auth/device/token → access_token
  → store access_token at ~/.agents/bgng/credentials.json

bgng logout
  → POST {apiUrl}/api/auth/sign-out (revoke session)
  → delete stored credentials

bgng whoami
  → GET {apiUrl}/api/auth/session (Bearer token)
  → display identity from session response
```

---

## Commands

### `bgng analyze`

**Description:** Analyze Claude Code session logs for authorship and tool-use metrics.

**Options:**

| Flag | Type | Default | Description |
|---|---|---|---|
| `--path` | string | Auto-discovered | Path to session log directory or specific `.jsonl` file |
| `--json` | boolean | `false` | Emit machine-readable JSON output |
| `--no-poll` | boolean | `false` | Upload only, print job ID, do not wait for completion |

**Behavior:**

1. Resolve auth token (see Auth Resolution Order below).
2. Discover session logs:
   - If `--path` is provided, use it directly.
   - Otherwise, scan `~/.claude/projects/` for directories containing `.jsonl` files.
   - If multiple project directories exist, prompt user to select or pass `--path`.
3. Create tarball via `Bun.spawn(["tar", "-czf", tmpPath, "-C", parentDir, targetDir])`.
4. Upload tarball to `POST {apiUrl}/api/analyze` with `Authorization: Bearer <accessToken>` and `Content-Type: multipart/form-data`.
5. If `--no-poll`, print `{ jobId, status: "queued" }` and exit.
6. Poll `GET {apiUrl}/api/jobs/:id` every 2 seconds (max 5 minutes).
7. On `completed`, fetch `GET {apiUrl}/api/reports/:reportId`.
8. Render report via existing `renderTable` / `renderJson` from `cli/core/output.ts`.
9. On `failed`, display error message from job response and exit with code 1.

**Output (table mode):**

```
Session Log Analysis Report
━━━━━━━━━━━━━━━━━━━━━━━━━━
Sessions          12
Total Turns       847
User Chars        124,892
Assistant Chars   1,847,221
Authorship Ratio  0.063
Avg Prompt Length  147.4
Input Tokens      2,891,004
Output Tokens     847,221
Cache Created     124,002
Cache Read        2,100,445

Tool Usage
━━━━━━━━━━
Edit              412
Read              389
Bash              201
Grep              98
Write             47
```

### `bgng login`

**Description:** Authenticate with the session log analyzer.

**Behavior:**

1. Request device code from the analyzer backend:
   ```
   POST {apiUrl}/api/auth/device/code
   Content-Type: application/json

   { "client_id": "bgng-cli", "scope": "openid profile email" }
   ```
   Response:
   ```json
   {
     "user_code": "ABC-123",
     "verification_uri": "https://analyzer.example.com/device",
     "verification_uri_complete": "https://analyzer.example.com/device?user_code=ABC-123",
     "device_code": "device-code-xyz"
   }
   ```

2. Display verification prompt:
   ```
   To sign in, visit https://analyzer.example.com/device
   and enter code: ABC-123

   Waiting for authorization...
   ```

3. Optionally open the browser automatically (`open` on macOS, `xdg-open` on Linux):
   ```ts
   Bun.spawn(["open", verificationUriComplete]);
   ```

4. Poll for access token:
   ```
   POST {apiUrl}/api/auth/device/token
   Content-Type: application/json

   {
     "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
     "device_code": "device-code-xyz",
     "client_id": "bgng-cli"
   }
   ```
   Poll every 5 seconds (or as specified by the device code response). Handle errors:
   - `authorization_pending` — keep polling silently
   - `slow_down` — increase interval by 5 seconds
   - `access_denied` — print denial message, exit 1
   - `expired_token` — print expiry message, exit 1

5. On success, receive `{ "access_token": "..." }`. Verify the token works:
   ```
   GET {apiUrl}/api/auth/session
   Authorization: Bearer <access_token>
   ```
   Response contains `{ user: { id, name, email }, session: { id, expiresAt } }`.

6. Store credentials (see Credential Storage below).

7. Print confirmation:
   ```
   Authenticated as remy@example.com
   ```

**What happens in the browser:**

The user visits the verification URI, which is a page on our frontend at `/device`. If not already signed in, they sign in via Google OAuth (handled by Better Auth's social provider). Once signed in, they enter or confirm the user code, which calls `POST /api/auth/device/approve`. The CLI's next poll receives the access token.

### `bgng logout`

**Description:** Remove stored analyzer credentials and revoke the server session.

**Behavior:**

1. Read stored credential from `~/.agents/bgng/credentials.json`.
2. If credential exists, call `POST {apiUrl}/api/auth/sign-out` with `Authorization: Bearer <accessToken>` to revoke the server session.
3. Remove the `analyzer` key from `credentials.json`.
4. Write back (or delete file if empty).
5. Print `Logged out.`

### `bgng whoami`

**Description:** Display current analyzer identity.

**Options:**

| Flag | Type | Default | Description |
|---|---|---|---|
| `--json` | boolean | `false` | Emit machine-readable JSON output |

**Behavior:**

1. Read stored credential.
2. If no credential, print `Not authenticated. Run bgng login.` and exit 1.
3. Verify the token is still valid by calling `GET {apiUrl}/api/auth/session` with the bearer token.
4. If session is valid, display user info (email, name).
5. If session is expired/invalid, print `Session expired. Run bgng login.` and exit 1.

---

## Auth Resolution Order

Every authenticated request resolves the bearer token in this order:

1. **`BGNG_ANALYZER_TOKEN` env var** — If set, use as-is. No validation. Designed for CI/CD where the caller provides a valid Better Auth session token or other bearer token.
2. **Stored credential** — Read `~/.agents/bgng/credentials.json`. Use the stored `accessToken`. If the session has expired (based on stored `expiresAt`), prompt `Session expired. Run bgng login.` and exit 1.
3. **No credential** — Print `Not authenticated. Run bgng login first.` and exit 1.

### Session Lifetime

Better Auth device authorization tokens are session tokens. The default session expiry is 7 days (configurable server-side). When a session expires, the CLI prompts re-login. There is no client-side token refresh — the session is server-managed.

This is simpler than the Firebase approach (which required client-side refresh token exchange). The trade-off is that users re-login weekly instead of having indefinite refresh. For a CLI tool, this is acceptable — `gh auth login` follows the same pattern.

---

## Credential Storage

**Path:** `~/.agents/bgng/credentials.json`
**Permissions:** `0600` (owner read/write only)

```json
{
  "analyzer": {
    "accessToken": "session-token-from-device-auth",
    "email": "remy@example.com",
    "name": "Remy",
    "userId": "better-auth-user-id",
    "expiresAt": "2026-05-05T00:00:00.000Z"
  }
}
```

Compared to the previous Firebase draft, this is simpler:
- One token (`accessToken`) instead of three (`idToken`, `refreshToken`, `uid`)
- No client-side refresh logic
- No Firebase-specific fields

**Credential file creation:**

- `bgng login` creates the file with `0600` permissions via `Bun.write()` followed by `fs.chmodSync()`.
- If the file already exists, only the `analyzer` key is updated (preserve other future credential sections).
- `bgng logout` removes the `analyzer` key.
- Write atomically (write to temp file, then rename) to prevent corruption on crash.

---

## Configuration

### Analyzer Config in `config.json`

Add an `analyzer` section to the bgng `CanonicalConfig`:

```json
{
  "version": 1,
  "targets": { ... },
  "analyzer": {
    "apiUrl": "https://session-log-analyzer.example.workers.dev",
    "clientId": "bgng-cli"
  }
}
```

| Field | Description |
|---|---|
| `analyzer.apiUrl` | Base URL of the session log analyzer Worker |
| `analyzer.clientId` | Client identifier sent in device auth requests |

That's it. No Firebase project ID, no Firebase API key, no Google OAuth client ID/secret. All auth complexity lives on the server. The CLI only needs to know the API URL and its own client identifier.

### Environment Variable Overrides

| Variable | Overrides | Purpose |
|---|---|---|
| `BGNG_ANALYZER_URL` | `analyzer.apiUrl` | API base URL |
| `BGNG_ANALYZER_TOKEN` | Entire auth flow | Pre-authenticated session token for CI/CD |

---

## Session Log Discovery

### Claude Code Log Location

Claude Code stores session logs at `~/.claude/projects/`. Each project directory contains `.jsonl` files representing individual sessions.

**Discovery logic:**

```ts
async function discoverSessionLogs(homeDir: string): Promise<ProjectLogDir[]> {
  const projectsDir = path.join(homeDir, ".claude", "projects");
  const entries = await readdir(projectsDir, { withFileTypes: true });

  const projects: ProjectLogDir[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const projectPath = path.join(projectsDir, entry.name);
    const jsonlFiles = await glob("*.jsonl", { cwd: projectPath });
    if (jsonlFiles.length > 0) {
      projects.push({
        name: entry.name,
        path: projectPath,
        sessionCount: jsonlFiles.length,
      });
    }
  }
  return projects;
}
```

### Path Resolution

Extend `cli/core/paths.ts` with:

```ts
resolveClaudeProjectsDir(homeDir: string): string {
  return path.join(homeDir, ".claude", "projects");
}

resolveCredentialsPath(agentsDir: string): string {
  return path.join(agentsDir, "bgng", "credentials.json");
}
```

### Tarball Creation

Use `Bun.spawn` to invoke system `tar`, matching the existing pattern in `cli/core/skill-packages.ts`:

```ts
const tmpArchive = path.join(tmpDir, "sessions.tar.gz");
const proc = Bun.spawn(
  ["tar", "-czf", tmpArchive, "-C", parentDir, targetDirName],
  { stdout: "pipe", stderr: "pipe" }
);
const exitCode = await proc.exited;
if (exitCode !== 0) {
  const stderr = await new Response(proc.stderr).text();
  throw new Error(`tar failed: ${stderr}`);
}
```

---

## API Client

### Schema Duplication

Zod schemas for the analyzer API are duplicated inside the bgng project, not imported as a shared dependency. This avoids coupling the CLI's release cycle to the analyzer's package workspace.

**Location:** `cli/core/analyzer/schemas.ts`

```ts
import { z } from "zod";

export const AnalyzeResponseSchema = z.object({
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

export const SessionToolUseSchema = z.object({
  tool: z.string(),
  count: z.number(),
});

export const AnalysisMetricsSchema = z.object({
  totalSessions: z.number(),
  totalTurns: z.number(),
  totalUserChars: z.number(),
  totalAssistantChars: z.number(),
  authorshipRatio: z.number(),
  toolDelegation: z.array(SessionToolUseSchema),
  avgPromptLength: z.number(),
  totalInputTokens: z.number(),
  totalOutputTokens: z.number(),
  totalCacheCreationTokens: z.number(),
  totalCacheReadTokens: z.number(),
});

export const AnalysisReportSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  source: z.enum(["claude-code", "codex", "mixed", "unknown"]),
  analyzerVersion: z.string(),
  metricsSchemaVersion: z.number(),
  metrics: AnalysisMetricsSchema,
  highlights: z.array(z.object({
    label: z.string(),
    value: z.union([z.string(), z.number()]),
  })),
  generatedAt: z.string(),
});

export const DeviceCodeResponseSchema = z.object({
  user_code: z.string(),
  verification_uri: z.string(),
  verification_uri_complete: z.string(),
  device_code: z.string(),
});

export const DeviceTokenResponseSchema = z.object({
  access_token: z.string(),
});

export const SessionResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
  }),
  session: z.object({
    id: z.string(),
    expiresAt: z.string(),
  }),
});
```

### HTTP Client

**Location:** `cli/core/analyzer/client.ts`

Uses Bun's native `fetch`. No HTTP library dependency.

```ts
interface AnalyzerClient {
  upload(archivePath: string, token: string): Promise<{ jobId: string }>;
  getJob(jobId: string, token: string): Promise<JobInfo>;
  getReport(reportId: string, token: string): Promise<AnalysisReport>;
  requestDeviceCode(clientId: string): Promise<DeviceCodeResponse>;
  pollDeviceToken(deviceCode: string, clientId: string): Promise<{ accessToken: string }>;
  getSession(token: string): Promise<SessionResponse>;
  signOut(token: string): Promise<void>;
}
```

Each method:
- Constructs the URL from `analyzer.apiUrl` config
- Sets `Authorization: Bearer <token>` header where applicable
- Validates response with the corresponding Zod schema
- Throws typed errors for non-2xx responses

---

## File Structure

New files in the bgng project:

```
cli/
├── commands/
│   ├── analyze.ts          # bgng analyze command
│   ├── login.ts            # bgng login command
│   ├── logout.ts           # bgng logout command
│   └── whoami.ts           # bgng whoami command
├── core/
│   └── analyzer/
│       ├── auth.ts         # Credential read/write, auth resolution
│       ├── client.ts       # HTTP client for analyzer API + auth endpoints
│       ├── discovery.ts    # Session log directory scanning
│       └── schemas.ts      # Duplicated Zod schemas for API contract
```

### Registration in `cli/index.ts`

```ts
cli.register(Builtins.HelpCommand);
cli.register(Builtins.VersionCommand);
// ... existing commands ...
cli.register(AnalyzeCommand);
cli.register(LoginCommand);
cli.register(LogoutCommand);
cli.register(WhoamiCommand);
```

### New Dependency

| Package | Purpose |
|---|---|
| `zod` | API response validation |

`zod` is the only new dependency. All HTTP uses Bun native `fetch`. All tarball handling uses system `tar` via `Bun.spawn`. No `better-auth/client` SDK needed — the device flow endpoints are simple JSON POST requests.

---

## Integration Points With Existing bgng Code

| Existing Module | Integration |
|---|---|
| `cli/commands/base.ts` | All new commands extend `BaseCommand` |
| `cli/context.ts` | `AgentsContext.agentsDir` used for credential path resolution |
| `cli/core/paths.ts` | Add `resolveClaudeProjectsDir()`, `resolveCredentialsPath()` |
| `cli/core/output.ts` | Use `renderJson()` and `renderTable()` for analyze output |
| `cli/core/user-config.ts` | Read `analyzer` config section |
| `cli/core/types.ts` | Extend `CanonicalConfig` with `analyzer` section type |
| `cli/core/skill-packages.ts` | Tarball creation pattern (Bun.spawn tar) reused |

---

## Error Handling

| Scenario | Behavior |
|---|---|
| No session logs found | Print message suggesting `--path` flag, exit 1 |
| Multiple project directories | List projects, ask user to specify `--path` |
| Session expired | Print `Session expired. Run bgng login.`, exit 1 |
| Upload returns 413 | Print file size and API limit, exit 1 |
| Upload returns 400 | Print validation error from API, exit 1 |
| Upload returns 401 | Print `Authentication failed. Run bgng login.`, exit 1 |
| Job fails | Print error from job response, exit 1 |
| Polling timeout (5 min) | Print timeout message with job ID for manual check, exit 1 |
| Network error | Print connection error with API URL, exit 1 |
| Device flow `access_denied` | Print `Authorization denied.`, exit 1 |
| Device flow `expired_token` | Print `Authorization timed out. Try again.`, exit 1 |

---

## Testing Strategy

| Layer | What | How |
|---|---|---|
| Unit | Schema validation | Test Zod schemas parse valid/invalid API responses |
| Unit | Discovery logic | Mock `readdir` / `glob`, test project enumeration |
| Unit | Auth resolution | Test env var → stored credential → no credential fallback order |
| Unit | Credential storage | Test read/write/delete of credentials.json, atomic write |
| Unit | Report rendering | Test table and JSON output formatting |
| Integration | Device flow | Manual test against dev API (requires human interaction in browser) |
| Integration | Full analyze flow | Upload real fixture tarball to dev API, verify report |

---

## Open Questions

| Question | Impact |
|---|---|
| Should `bgng analyze` support Codex logs (`~/.codex/`) in addition to Claude? | Discovery logic would need to scan both. Codex is "planned" in analyzer v1, so defer. |
| Should `bgng login` open the browser automatically? | `open <verification_uri_complete>` is possible on macOS. Good UX, low risk. |
| Should credentials rotate the file atomically (write tmp + rename)? | Prevents corruption on crash. Recommended — low effort. |
| What should `client_id` be for the CLI? | `bgng-cli` is a reasonable default. Server may want to track which clients are making device auth requests. |
| Session expiry UX — should CLI warn when session is close to expiring? | `bgng whoami` could show "expires in 2 days". Low priority. |
