# Analyzer CLI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `bgng analyze`, `bgng login`, `bgng logout`, and `bgng whoami` commands to the bgng CLI. These commands discover Claude Code session logs, authenticate via Better Auth's device flow, upload archives to the session log analyzer API, and render analysis reports.

**Architecture:** The CLI sends HTTP requests to the session log analyzer Worker using Bun's native `fetch`. Authentication uses Better Auth's device authorization endpoint — no Firebase, no Google OAuth device flow, no external token exchange. Zod schemas are duplicated locally (not shared with the analyzer workspace). Tarball creation uses `Bun.spawn(["tar", ...])` matching the existing skill-packages pattern.

**Tech Stack:** Bun, Clipanion 4, `zod` (new dep), existing: `cli/core/output.ts`, `cli/core/paths.ts`, `cli/core/types.ts`, `cli/commands/base.ts`.

**References:** `beginning-agents/.ai/analyses/04_auth_design.md`, `beginning-agents/.ai/analyses/21_analyzer_integration.md`, bgng `cli/core/skill-packages.ts` (tarball pattern).

---

## Execution Rules

- Follow TDD: write the failing test, run it, implement, run it green, refactor.
- Do not commit unless the user explicitly authorizes commits.
- Match existing bgng patterns exactly: `BaseCommand`, `Option.Boolean("--json")`, `renderJson`, `renderTable`, `this.context.stdout.write()`.
- Use `bun:test` for tests, `Bun.spawn` for subprocesses, `Bun.write` for file creation.
- Credential files must have `0600` permissions.
- All HTTP uses Bun native `fetch`. No HTTP library.

---

## Phase 0: Preconditions

### Task 0.1: Verify Analyzer API Is Running

**Files:** None.

**Steps:**

1. Confirm the session log analyzer backend is running locally or at a known dev URL.
2. Confirm `GET {apiUrl}/health` returns `{ "ok": true }`.
3. Confirm auth routes are mounted: `POST {apiUrl}/api/auth/device/code` returns a structured response (even if it's an error — it should not be 404).

**Checkpoint:** Analyzer API is reachable and has auth routes.

---

## Phase 1: Types And Config

### Task 1.1: Add zod Dependency

**Files:**
- Modify: `package.json`

**Steps:**

1. Run: `bun add zod`
2. Run: `bun test` to verify no regressions.
3. Run: `bun run typecheck`.

**Checkpoint:** `zod` in dependencies. All existing tests pass.

### Task 1.2: Extend CanonicalConfig With Analyzer Section

**Files:**
- Modify: `cli/core/types.ts`
- Test: (type-level, verified by typecheck)

**Steps:**

1. Add to `CanonicalConfig`:
   ```ts
   analyzer?: {
     apiUrl: string;
     clientId: string;
   };
   ```
2. Run `bun run typecheck`.

**Checkpoint:** Type compiles. No runtime changes needed since the field is optional.

### Task 1.3: Add Path Resolution Functions

**Files:**
- Modify: `cli/core/paths.ts`
- Test: `test/paths-analyzer.test.ts`

**Step 1: Write failing test**

```ts
import { describe, expect, test } from "bun:test";
import { resolveClaudeProjectsDir, resolveCredentialsPath } from "../cli/core/paths";

describe("analyzer path resolution", () => {
  test("resolveClaudeProjectsDir returns correct path", () => {
    expect(resolveClaudeProjectsDir("/home/user")).toBe("/home/user/.claude/projects");
  });

  test("resolveCredentialsPath returns correct path", () => {
    expect(resolveCredentialsPath("/home/user/.agents")).toBe("/home/user/.agents/bgng/credentials.json");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test test/paths-analyzer.test.ts`
Expected: FAIL — functions not exported.

**Step 3: Implement**

Add to `cli/core/paths.ts`:
```ts
export function resolveClaudeProjectsDir(homeDir: string) {
  return join(homeDir, ".claude", "projects");
}

export function resolveCredentialsPath(agentsDir: string) {
  return join(resolveUserBgngDir(agentsDir), "credentials.json");
}
```

**Step 4: Run test to verify it passes**

Run: `bun test test/paths-analyzer.test.ts`

**Checkpoint:** Path functions work. All existing tests still pass.

---

## Phase 2: Analyzer Core Modules

### Task 2.1: Create Zod Schemas

**Files:**
- Create: `cli/core/analyzer/schemas.ts`
- Test: `test/analyzer-schemas.test.ts`

**Step 1: Write failing test**

```ts
import { describe, expect, test } from "bun:test";
import { AnalyzeResponseSchema, JobInfoSchema, AnalysisReportSchema, DeviceCodeResponseSchema } from "../cli/core/analyzer/schemas";

describe("analyzer schemas", () => {
  test("AnalyzeResponseSchema parses valid response", () => {
    const result = AnalyzeResponseSchema.safeParse({ jobId: "job_abc123", status: "queued" });
    expect(result.success).toBe(true);
  });

  test("AnalyzeResponseSchema rejects invalid status", () => {
    const result = AnalyzeResponseSchema.safeParse({ jobId: "job_abc123", status: "done" });
    expect(result.success).toBe(false);
  });

  test("JobInfoSchema parses completed job with reportId", () => {
    const result = JobInfoSchema.safeParse({
      id: "job_abc", status: "completed",
      createdAt: "2026-04-28T00:00:00Z", updatedAt: "2026-04-28T00:00:00Z",
      error: null, reportId: "rep_xyz",
    });
    expect(result.success).toBe(true);
  });

  test("DeviceCodeResponseSchema parses valid response", () => {
    const result = DeviceCodeResponseSchema.safeParse({
      user_code: "ABC-123",
      verification_uri: "https://example.com/device",
      verification_uri_complete: "https://example.com/device?user_code=ABC-123",
      device_code: "dev_xyz",
    });
    expect(result.success).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test test/analyzer-schemas.test.ts`

**Step 3: Implement schemas**

Create `cli/core/analyzer/schemas.ts` with all schemas from `21_analyzer_integration.md`.

**Step 4: Run test to verify it passes**

Run: `bun test test/analyzer-schemas.test.ts`

**Checkpoint:** All API schemas parse correctly.

### Task 2.2: Create Credential Storage Module

**Files:**
- Create: `cli/core/analyzer/auth.ts`
- Test: `test/analyzer-auth.test.ts`

**Step 1: Write failing test**

```ts
import { describe, expect, test, afterEach } from "bun:test";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCredential, saveCredential, deleteCredential } from "../cli/core/analyzer/auth";

describe("credential storage", () => {
  let tempDir: string;

  afterEach(async () => {
    // cleanup
  });

  test("saveCredential creates file with 0600 permissions", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "bgng-auth-"));
    const credPath = join(tempDir, "credentials.json");
    await saveCredential(credPath, {
      accessToken: "tok_123",
      email: "test@example.com",
      name: "Test",
      userId: "user_123",
      expiresAt: "2026-05-05T00:00:00Z",
    });
    const stats = await stat(credPath);
    expect((stats.mode & 0o777).toString(8)).toBe("600");
  });

  test("loadCredential returns null when file does not exist", async () => {
    const result = await loadCredential("/nonexistent/path/credentials.json");
    expect(result).toBeNull();
  });

  test("loadCredential returns saved credential", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "bgng-auth-"));
    const credPath = join(tempDir, "credentials.json");
    await saveCredential(credPath, {
      accessToken: "tok_123",
      email: "test@example.com",
      name: "Test",
      userId: "user_123",
      expiresAt: "2026-05-05T00:00:00Z",
    });
    const result = await loadCredential(credPath);
    expect(result?.accessToken).toBe("tok_123");
  });

  test("deleteCredential removes the analyzer key", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "bgng-auth-"));
    const credPath = join(tempDir, "credentials.json");
    await saveCredential(credPath, {
      accessToken: "tok_123", email: "t@t.com", name: "T", userId: "u", expiresAt: "2026-05-05T00:00:00Z",
    });
    await deleteCredential(credPath);
    const result = await loadCredential(credPath);
    expect(result).toBeNull();
  });
});
```

**Step 3: Implement**

```ts
import { existsSync, mkdirSync, chmodSync } from "node:fs";
import { readFile, writeFile, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

export interface StoredCredential {
  accessToken: string;
  email: string;
  name: string;
  userId: string;
  expiresAt: string;
}

export async function loadCredential(path: string): Promise<StoredCredential | null> {
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(await readFile(path, "utf8")) as { analyzer?: StoredCredential };
    return raw.analyzer ?? null;
  } catch {
    return null;
  }
}

export async function saveCredential(path: string, credential: StoredCredential): Promise<void> {
  mkdirSync(dirname(path), { recursive: true });
  let existing: Record<string, unknown> = {};
  if (existsSync(path)) {
    try { existing = JSON.parse(await readFile(path, "utf8")); } catch { /* ignore */ }
  }
  existing.analyzer = credential;
  // Atomic write: write to temp, then rename
  const tmpPath = join(dirname(path), `.credentials.${Date.now()}.tmp`);
  await writeFile(tmpPath, JSON.stringify(existing, null, 2) + "\n");
  chmodSync(tmpPath, 0o600);
  await rename(tmpPath, path);
}

export async function deleteCredential(path: string): Promise<void> {
  if (!existsSync(path)) return;
  try {
    const existing = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    delete existing.analyzer;
    await writeFile(path, JSON.stringify(existing, null, 2) + "\n");
  } catch { /* ignore */ }
}
```

**Step 4: Run tests**

Run: `bun test test/analyzer-auth.test.ts`

**Checkpoint:** Credential CRUD works. File permissions are 0600. Atomic writes.

### Task 2.3: Create Auth Resolution Function

**Files:**
- Modify: `cli/core/analyzer/auth.ts`
- Test: `test/analyzer-auth.test.ts` (append)

**Step 1: Write failing test**

```ts
describe("resolveToken", () => {
  test("returns env var when BGNG_ANALYZER_TOKEN is set", async () => {
    const token = await resolveToken("/nonexistent", "env-token-123");
    expect(token).toBe("env-token-123");
  });

  test("returns stored credential token when available", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "bgng-auth-"));
    const credPath = join(tempDir, "credentials.json");
    await saveCredential(credPath, {
      accessToken: "stored-token",
      email: "t@t.com", name: "T", userId: "u",
      expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1hr from now
    });
    const token = await resolveToken(credPath, undefined);
    expect(token).toBe("stored-token");
  });

  test("returns null when no credential and no env var", async () => {
    const token = await resolveToken("/nonexistent", undefined);
    expect(token).toBeNull();
  });
});
```

**Step 3: Implement**

```ts
export async function resolveToken(
  credentialsPath: string,
  envToken: string | undefined,
): Promise<string | null> {
  if (envToken) return envToken;
  const credential = await loadCredential(credentialsPath);
  if (!credential) return null;
  // Check expiry (with 5 minute buffer)
  const expiresAt = new Date(credential.expiresAt).getTime();
  if (expiresAt < Date.now() + 5 * 60 * 1000) return null;
  return credential.accessToken;
}
```

**Checkpoint:** Token resolution follows the documented priority order.

### Task 2.4: Create API Client

**Files:**
- Create: `cli/core/analyzer/client.ts`
- Test: `test/analyzer-client.test.ts`

**Step 1: Write failing test**

```ts
import { describe, expect, test } from "bun:test";
import { createAnalyzerClient } from "../cli/core/analyzer/client";

describe("analyzer client", () => {
  test("getJob parses valid response", async () => {
    const mockFetch = async () => new Response(JSON.stringify({
      id: "job_abc", status: "completed",
      createdAt: "2026-04-28T00:00:00Z", updatedAt: "2026-04-28T00:00:00Z",
      error: null, reportId: "rep_xyz",
    }), { status: 200, headers: { "Content-Type": "application/json" } });

    const client = createAnalyzerClient("http://localhost:8787", mockFetch as typeof fetch);
    const job = await client.getJob("job_abc", "tok_123");
    expect(job.id).toBe("job_abc");
    expect(job.status).toBe("completed");
  });

  test("getJob throws on non-2xx response", async () => {
    const mockFetch = async () => new Response("Not found", { status: 404 });
    const client = createAnalyzerClient("http://localhost:8787", mockFetch as typeof fetch);
    expect(client.getJob("job_bad", "tok_123")).rejects.toThrow();
  });

  test("upload sends multipart form with bearer token", async () => {
    let capturedHeaders: Headers | undefined;
    let capturedBody: FormData | undefined;
    const mockFetch = async (input: string, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ jobId: "job_new", status: "queued" }),
        { status: 201, headers: { "Content-Type": "application/json" } });
    };

    const client = createAnalyzerClient("http://localhost:8787", mockFetch as typeof fetch);
    const result = await client.upload("/tmp/test.tar.gz", "tok_bearer");
    expect(result.jobId).toBe("job_new");
    expect(capturedHeaders?.get("Authorization")).toBe("Bearer tok_bearer");
  });
});
```

**Step 3: Implement**

```ts
import { AnalyzeResponseSchema, JobInfoSchema, AnalysisReportSchema, DeviceCodeResponseSchema, DeviceTokenResponseSchema, SessionResponseSchema } from "./schemas.ts";
import type { z } from "zod";

export function createAnalyzerClient(apiUrl: string, fetcher: typeof fetch = fetch) {
  async function request<T>(schema: z.ZodSchema<T>, url: string, init?: RequestInit): Promise<T> {
    const response = await fetcher(url, init);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${response.status}: ${text || response.statusText}`);
    }
    const json = await response.json();
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new Error("Invalid API response");
    return parsed.data;
  }

  function authHeaders(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
  }

  return {
    async upload(archivePath: string, token: string) {
      const file = Bun.file(archivePath);
      const formData = new FormData();
      formData.append("file", file);
      return request(AnalyzeResponseSchema, `${apiUrl}/api/analyze`, {
        method: "POST",
        body: formData,
        headers: authHeaders(token),
      });
    },

    async getJob(jobId: string, token: string) {
      return request(JobInfoSchema, `${apiUrl}/api/jobs/${encodeURIComponent(jobId)}`, {
        headers: authHeaders(token),
      });
    },

    async getReport(reportId: string, token: string) {
      return request(AnalysisReportSchema, `${apiUrl}/api/reports/${encodeURIComponent(reportId)}`, {
        headers: authHeaders(token),
      });
    },

    async requestDeviceCode(clientId: string) {
      return request(DeviceCodeResponseSchema, `${apiUrl}/api/auth/device/code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId }),
      });
    },

    async pollDeviceToken(deviceCode: string, clientId: string) {
      return request(DeviceTokenResponseSchema, `${apiUrl}/api/auth/device/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          device_code: deviceCode,
          client_id: clientId,
        }),
      });
    },

    async getSession(token: string) {
      return request(SessionResponseSchema, `${apiUrl}/api/auth/session`, {
        headers: authHeaders(token),
      });
    },

    async signOut(token: string) {
      await fetcher(`${apiUrl}/api/auth/sign-out`, {
        method: "POST",
        headers: authHeaders(token),
      });
    },
  };
}
```

**Step 4: Run tests**

Run: `bun test test/analyzer-client.test.ts`

**Checkpoint:** Client validates responses with Zod, sends auth headers, handles errors.

### Task 2.5: Create Session Log Discovery Module

**Files:**
- Create: `cli/core/analyzer/discovery.ts`
- Test: `test/analyzer-discovery.test.ts`

**Step 1: Write failing test**

```ts
import { describe, expect, test, afterEach } from "bun:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverSessionLogs } from "../cli/core/analyzer/discovery";

describe("session log discovery", () => {
  test("returns empty array when projects dir does not exist", async () => {
    const result = await discoverSessionLogs("/nonexistent");
    expect(result).toEqual([]);
  });

  test("finds project directories with .jsonl files", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "bgng-disc-"));
    const projectDir = join(homeDir, ".claude", "projects", "my-project");
    await mkdir(projectDir, { recursive: true });
    await writeFile(join(projectDir, "session1.jsonl"), "{}");
    await writeFile(join(projectDir, "session2.jsonl"), "{}");

    const result = await discoverSessionLogs(homeDir);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("my-project");
    expect(result[0].sessionCount).toBe(2);
  });

  test("ignores directories without .jsonl files", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "bgng-disc-"));
    const projectDir = join(homeDir, ".claude", "projects", "empty-project");
    await mkdir(projectDir, { recursive: true });
    await writeFile(join(projectDir, "notes.txt"), "hello");

    const result = await discoverSessionLogs(homeDir);
    expect(result).toEqual([]);
  });
});
```

**Step 3: Implement**

```ts
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { resolveClaudeProjectsDir } from "../paths.ts";

export interface ProjectLogDir {
  name: string;
  path: string;
  sessionCount: number;
}

export async function discoverSessionLogs(homeDir: string): Promise<ProjectLogDir[]> {
  const projectsDir = resolveClaudeProjectsDir(homeDir);
  if (!existsSync(projectsDir)) return [];

  const entries = await readdir(projectsDir, { withFileTypes: true });
  const projects: ProjectLogDir[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const projectPath = join(projectsDir, entry.name);
    const files = await readdir(projectPath);
    const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));
    if (jsonlFiles.length > 0) {
      projects.push({ name: entry.name, path: projectPath, sessionCount: jsonlFiles.length });
    }
  }

  return projects;
}
```

**Step 4: Run tests**

Run: `bun test test/analyzer-discovery.test.ts`

**Checkpoint:** Discovery finds projects, counts sessions, ignores non-JSONL dirs.

---

## Phase 3: Commands

### Task 3.1: Create Login Command

**Files:**
- Create: `cli/commands/login.ts`
- Test: `test/commands-login.test.ts`

**Step 1: Write failing test**

```ts
import { describe, expect, test } from "bun:test";

describe("LoginCommand", () => {
  test("command class has correct path", () => {
    expect(LoginCommand.paths).toEqual([["login"]]);
  });
});
```

**Step 3: Implement**

```ts
import { BaseCommand } from "./base.ts";

export class LoginCommand extends BaseCommand {
  static override paths = [["login"]];

  static override usage = BaseCommand.Usage({
    category: "Auth",
    description: "Authenticate with the session log analyzer.",
  });

  async execute() {
    const { resolveCredentialsPath } = await import("../core/paths.ts");
    const { saveCredential } = await import("../core/analyzer/auth.ts");
    const { createAnalyzerClient } = await import("../core/analyzer/client.ts");

    const config = await this.loadConfig();
    if (!config?.analyzer?.apiUrl) {
      this.context.stderr.write("No analyzer.apiUrl configured. Add it to config.json.\n");
      return 1;
    }

    const client = createAnalyzerClient(config.analyzer.apiUrl);
    const clientId = config.analyzer.clientId ?? "bgng-cli";

    // Step 1: Request device code
    const deviceCode = await client.requestDeviceCode(clientId);

    this.context.stdout.write(
      `To sign in, visit ${deviceCode.verification_uri}\n` +
      `and enter code: ${deviceCode.user_code}\n\n` +
      `Waiting for authorization...\n`
    );

    // Open browser (best effort)
    try {
      Bun.spawn(["open", deviceCode.verification_uri_complete], { stdout: "ignore", stderr: "ignore" });
    } catch { /* ignore */ }

    // Step 2: Poll for token
    let pollingInterval = 5;
    let token: string | null = null;

    while (!token) {
      await Bun.sleep(pollingInterval * 1000);
      try {
        const result = await client.pollDeviceToken(deviceCode.device_code, clientId);
        token = result.access_token;
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        if (message.includes("authorization_pending")) continue;
        if (message.includes("slow_down")) { pollingInterval += 5; continue; }
        if (message.includes("access_denied")) {
          this.context.stderr.write("Authorization denied.\n");
          return 1;
        }
        if (message.includes("expired_token")) {
          this.context.stderr.write("Authorization timed out. Try again.\n");
          return 1;
        }
        throw err;
      }
    }

    // Step 3: Verify token and get session info
    const session = await client.getSession(token);

    // Step 4: Save credential
    const credPath = resolveCredentialsPath(this.context.agentsDir);
    await saveCredential(credPath, {
      accessToken: token,
      email: session.user.email,
      name: session.user.name,
      userId: session.user.id,
      expiresAt: session.session.expiresAt,
    });

    this.context.stdout.write(`Authenticated as ${session.user.email}\n`);
    return 0;
  }

  private async loadConfig() {
    const { loadEffectiveConfig } = await import("../core/user-config.ts");
    const repoConfig = JSON.parse(
      await Bun.file(join(this.context.repoRoot, "config.json")).text()
    );
    const { config } = await loadEffectiveConfig(repoConfig, this.context.agentsDir);
    return config as import("../core/types.ts").CanonicalConfig;
  }
}
```

**Note:** The `loadConfig` helper is shown inline for clarity. If this pattern is useful across commands, extract to a shared utility.

**Checkpoint:** Login command compiles, has correct path.

### Task 3.2: Create Logout Command

**Files:**
- Create: `cli/commands/logout.ts`
- Test: `test/commands-logout.test.ts`

**Step 1: Write failing test**

```ts
test("command class has correct path", () => {
  expect(LogoutCommand.paths).toEqual([["logout"]]);
});
```

**Step 3: Implement**

```ts
import { BaseCommand } from "./base.ts";

export class LogoutCommand extends BaseCommand {
  static override paths = [["logout"]];

  static override usage = BaseCommand.Usage({
    category: "Auth",
    description: "Remove stored analyzer credentials.",
  });

  async execute() {
    const { resolveCredentialsPath } = await import("../core/paths.ts");
    const { loadCredential, deleteCredential } = await import("../core/analyzer/auth.ts");
    const { createAnalyzerClient } = await import("../core/analyzer/client.ts");

    const credPath = resolveCredentialsPath(this.context.agentsDir);
    const credential = await loadCredential(credPath);

    if (credential) {
      // Best-effort server-side sign-out
      try {
        const config = await this.loadConfig();
        if (config?.analyzer?.apiUrl) {
          const client = createAnalyzerClient(config.analyzer.apiUrl);
          await client.signOut(credential.accessToken);
        }
      } catch { /* ignore */ }
    }

    await deleteCredential(credPath);
    this.context.stdout.write("Logged out.\n");
    return 0;
  }
}
```

**Checkpoint:** Logout revokes server session, deletes local credential.

### Task 3.3: Create Whoami Command

**Files:**
- Create: `cli/commands/whoami.ts`
- Test: `test/commands-whoami.test.ts`

**Step 3: Implement**

```ts
import { Option } from "clipanion";
import { renderJson } from "../core/output.ts";
import { BaseCommand } from "./base.ts";

export class WhoamiCommand extends BaseCommand {
  static override paths = [["whoami"]];

  static override usage = BaseCommand.Usage({
    category: "Auth",
    description: "Display current analyzer identity.",
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const { resolveCredentialsPath } = await import("../core/paths.ts");
    const { loadCredential } = await import("../core/analyzer/auth.ts");

    const credPath = resolveCredentialsPath(this.context.agentsDir);
    const credential = await loadCredential(credPath);

    if (!credential) {
      this.context.stderr.write("Not authenticated. Run bgng login.\n");
      return 1;
    }

    if (this.json) {
      this.context.stdout.write(renderJson({
        email: credential.email,
        name: credential.name,
        userId: credential.userId,
        expiresAt: credential.expiresAt,
      }));
    } else {
      this.context.stdout.write(`${credential.email} (${credential.name})\n`);
    }
    return 0;
  }
}
```

**Checkpoint:** Whoami displays identity, supports --json.

### Task 3.4: Create Analyze Command

**Files:**
- Create: `cli/commands/analyze.ts`
- Test: `test/commands-analyze.test.ts`

**Step 1: Write failing test**

```ts
test("command class has correct path", () => {
  expect(AnalyzeCommand.paths).toEqual([["analyze"]]);
});
```

**Step 3: Implement**

```ts
import { Option } from "clipanion";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { rmSync } from "node:fs";
import { renderJson, renderTable } from "../core/output.ts";
import { BaseCommand } from "./base.ts";

export class AnalyzeCommand extends BaseCommand {
  static override paths = [["analyze"]];

  static override usage = BaseCommand.Usage({
    category: "Analyze",
    description: "Analyze Claude Code session logs.",
  });

  path = Option.String("--path", { required: false, description: "Path to session log directory." });
  json = Option.Boolean("--json", false, { description: "Emit machine-readable JSON output." });
  noPoll = Option.Boolean("--no-poll", false, { description: "Upload only, print job ID." });

  async execute() {
    const { resolveCredentialsPath } = await import("../core/paths.ts");
    const { resolveToken } = await import("../core/analyzer/auth.ts");
    const { createAnalyzerClient } = await import("../core/analyzer/client.ts");
    const { discoverSessionLogs } = await import("../core/analyzer/discovery.ts");

    // 1. Resolve config
    const config = await this.loadConfig();
    if (!config?.analyzer?.apiUrl) {
      this.context.stderr.write("No analyzer.apiUrl configured.\n");
      return 1;
    }

    // 2. Resolve auth
    const credPath = resolveCredentialsPath(this.context.agentsDir);
    const token = await resolveToken(credPath, process.env.BGNG_ANALYZER_TOKEN);
    if (!token) {
      this.context.stderr.write("Not authenticated. Run bgng login first.\n");
      return 1;
    }

    // 3. Discover or use provided path
    let targetDir: string;
    if (this.path) {
      targetDir = this.path;
    } else {
      const projects = await discoverSessionLogs(this.context.homeDir);
      if (projects.length === 0) {
        this.context.stderr.write("No session logs found. Use --path to specify a directory.\n");
        return 1;
      }
      if (projects.length > 1) {
        this.context.stderr.write("Multiple projects found. Specify one with --path:\n");
        for (const p of projects) {
          this.context.stderr.write(`  ${p.path} (${p.sessionCount} sessions)\n`);
        }
        return 1;
      }
      targetDir = projects[0].path;
    }

    // 4. Create tarball
    const tmpDir = await mkdtemp(join(tmpdir(), "bgng-analyze-"));
    const archivePath = join(tmpDir, "sessions.tar.gz");
    try {
      const parentDir = join(targetDir, "..");
      const dirName = targetDir.split("/").pop()!;
      const proc = Bun.spawn(["tar", "-czf", archivePath, "-C", parentDir, dirName], {
        stdout: "pipe", stderr: "pipe",
      });
      if (await proc.exited !== 0) {
        const stderr = await new Response(proc.stderr).text();
        this.context.stderr.write(`tar failed: ${stderr}\n`);
        return 1;
      }

      // 5. Upload
      const client = createAnalyzerClient(config.analyzer.apiUrl);
      const { jobId } = await client.upload(archivePath, token);

      if (this.noPoll) {
        this.context.stdout.write(this.json
          ? renderJson({ jobId, status: "queued" })
          : `Job ${jobId} queued.\n`);
        return 0;
      }

      // 6. Poll
      const maxPollMs = 5 * 60 * 1000;
      const start = Date.now();
      let job = await client.getJob(jobId, token);

      while (job.status === "queued" || job.status === "processing") {
        if (Date.now() - start > maxPollMs) {
          this.context.stderr.write(`Polling timeout. Check job ${jobId} manually.\n`);
          return 1;
        }
        await Bun.sleep(2000);
        job = await client.getJob(jobId, token);
      }

      if (job.status === "failed") {
        this.context.stderr.write(`Analysis failed: ${job.error ?? "Unknown error"}\n`);
        return 1;
      }

      // 7. Fetch and render report
      const report = await client.getReport(job.reportId!, token);

      if (this.json) {
        this.context.stdout.write(renderJson(report));
        return 0;
      }

      // Table output
      const m = report.metrics;
      const metricRows = [
        ["Sessions", m.totalSessions.toLocaleString()],
        ["Total Turns", m.totalTurns.toLocaleString()],
        ["User Chars", m.totalUserChars.toLocaleString()],
        ["Assistant Chars", m.totalAssistantChars.toLocaleString()],
        ["Authorship Ratio", m.authorshipRatio.toFixed(3)],
        ["Avg Prompt Length", m.avgPromptLength.toFixed(1)],
        ["Input Tokens", m.totalInputTokens.toLocaleString()],
        ["Output Tokens", m.totalOutputTokens.toLocaleString()],
        ["Cache Created", m.totalCacheCreationTokens.toLocaleString()],
        ["Cache Read", m.totalCacheReadTokens.toLocaleString()],
      ];
      this.context.stdout.write("\nSession Log Analysis Report\n");
      this.context.stdout.write(renderTable(["Metric", "Value"], metricRows));

      if (m.toolDelegation.length > 0) {
        this.context.stdout.write("\nTool Usage\n");
        const toolRows = m.toolDelegation.map((t) => [t.tool, t.count.toLocaleString()]);
        this.context.stdout.write(renderTable(["Tool", "Count"], toolRows));
      }

      return 0;
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}
```

**Checkpoint:** Analyze command compiles with correct path and options.

### Task 3.5: Register All Commands

**Files:**
- Modify: `cli/index.ts`

**Steps:**

1. Import all four commands:
   ```ts
   import { AnalyzeCommand } from "./commands/analyze.ts";
   import { LoginCommand } from "./commands/login.ts";
   import { LogoutCommand } from "./commands/logout.ts";
   import { WhoamiCommand } from "./commands/whoami.ts";
   ```
2. Register them:
   ```ts
   cli.register(AnalyzeCommand);
   cli.register(LoginCommand);
   cli.register(LogoutCommand);
   cli.register(WhoamiCommand);
   ```
3. Run: `bun run cli/index.ts --help` — verify new commands appear.
4. Run: `bun test` — verify all existing tests still pass.

**Checkpoint:** All commands registered and visible in help output.

---

## Phase 4: Add Analyzer Config To config.json

### Task 4.1: Add Dev Analyzer Config

**Files:**
- Modify: `config.json`

**Steps:**

1. Add analyzer section:
   ```json
   "analyzer": {
     "apiUrl": "http://localhost:8787",
     "clientId": "bgng-cli"
   }
   ```
2. Run: `bun run typecheck` — verify no type errors.
3. Run: `bun test` — verify no regressions.

**Checkpoint:** Config has analyzer section. All tests pass.

---

## Phase 5: Integration Testing

### Task 5.1: Manual End-To-End Login Flow

**Steps:**

1. Start analyzer backend: `cd /path/to/beginning-agents/backend && pnpm dev`
2. Start analyzer frontend: `cd /path/to/beginning-agents/frontend && pnpm dev`
3. Run: `bun run cli/index.ts login`
4. Verify device code displayed.
5. Visit URL in browser, sign in, approve device.
6. Verify CLI prints "Authenticated as <email>".
7. Verify `~/.agents/bgng/credentials.json` contains analyzer credential with 0600 permissions.

**Checkpoint:** Full login flow works.

### Task 5.2: Manual End-To-End Analyze Flow

**Steps:**

1. Ensure you're logged in (from Task 5.1).
2. Ensure Claude Code session logs exist at `~/.claude/projects/`.
3. Run: `bun run cli/index.ts analyze`
4. Verify tarball is created, uploaded, job is polled, report is displayed.
5. Run: `bun run cli/index.ts analyze --json`
6. Verify JSON report output.
7. Run: `bun run cli/index.ts whoami`
8. Verify identity displayed.
9. Run: `bun run cli/index.ts logout`
10. Verify "Logged out." and credential removed.
11. Run: `bun run cli/index.ts analyze`
12. Verify "Not authenticated. Run bgng login first."

**Checkpoint:** Full analyze flow works end-to-end.

---

## Open Items

| Item | Status | Notes |
|---|---|---|
| `loadConfig` helper shared across commands | Deferred | Extract to shared util if more than 2 commands need it |
| `--path` with a single .jsonl file | Deferred | Current impl expects a directory |
| Browser auto-open on Linux | Deferred | Use `xdg-open` instead of `open` |
| CI/CD via BGNG_ANALYZER_TOKEN | Deferred | Works by design but needs testing |
