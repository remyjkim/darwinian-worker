// ABOUTME: Command-level tests for `drwn analyze sessions`.
// ABOUTME: Verifies auth handoff, hybrid archive selection, output modes, and error mapping.

import { afterEach, describe, expect, test } from "bun:test";
import { Cli } from "clipanion";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Writable } from "node:stream";
import { AnalyzeSessionsCommand } from "../cli/commands/analyze/sessions";
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
  AnalyzeSessionsCommand.testDeps = undefined;
  await cleanupTempRoots(tempRoots);
});

async function runAnalyze(args: string[], options?: { withCredentials?: boolean }) {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  if (options?.withCredentials !== false) {
    await writeCredentials(resolveCredentialsPath(fixture.agentsDir), {
      api_url: "https://api.test",
      access_token: "TOK",
      user_email: "x@y.z",
      saved_at: "2026-06-03T00:00:00Z",
    });
  }

  const stdout = new CaptureStream();
  const stderr = new CaptureStream();
  const context: AgentsContext = {
    repoRoot: fixture.repoRoot,
    agentsDir: fixture.agentsDir,
    homeDir: fixture.homeDir,
    cwd: fixture.repoRoot,
    projectConfigPath: null,
    stdin: process.stdin,
    stdout,
    stderr,
    env: {},
    colorDepth: 1,
  };
  const cli = new Cli({ binaryName: "drwn", binaryLabel: "drwn", binaryVersion: "0.0.0" });
  cli.register(AnalyzeSessionsCommand);
  const exitCode = await cli.run(["analyze", "sessions", ...args], context);
  return { fixture, stdout: stdout.text(), stderr: stderr.text(), exitCode };
}

async function writeArchive(path: string, content = "archive") {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

describe("drwn analyze sessions", () => {
  test("default path uses an existing archive", async () => {
    const result = await runAnalyze([], { withCredentials: true });
    const archive = join(result.fixture.repoRoot, ".agents", "drwn", "session-log-exports", "x.tar.gz");
    await writeArchive(archive);
    AnalyzeSessionsCommand.testDeps = {
      env: { DRWN_ANALYZER_WEB_URL: "https://app.test" },
      fetch: (async () => Response.json({ jobId: "job_x", status: "queued" }, { status: 201 })) as unknown as typeof fetch,
    };

    const rerun = await runAnalyzeWithFixture(result.fixture, []);

    expect(rerun.exitCode).toBe(0);
    expect(rerun.stdout).toContain("Using existing archive:");
    expect(rerun.stdout).toContain("Job queued. Watch progress here:");
    expect(rerun.stdout).toContain("https://app.test/processing/job_x");
  });

  test("--dry-run with no archive is non-mutating and does not require auth", async () => {
    let uploadCalled = false;
    let inlineCalled = false;
    AnalyzeSessionsCommand.testDeps = {
      fetch: (async () => {
        uploadCalled = true;
        return Response.json({});
      }) as unknown as typeof fetch,
      inlineExport: async () => {
        inlineCalled = true;
        return "/never";
      },
    };

    const result = await runAnalyze(["--dry-run"], { withCredentials: false });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Would build inline gzip archive");
    expect(uploadCalled).toBe(false);
    expect(inlineCalled).toBe(false);
  });

  test("--archive validates and uploads the explicit path", async () => {
    let uploadCalled = false;
    AnalyzeSessionsCommand.testDeps = {
      env: { DRWN_ANALYZER_WEB_URL: "https://app.test" },
      fetch: (async () => {
        uploadCalled = true;
        return Response.json({ jobId: "job_x", status: "queued" }, { status: 201 });
      }) as unknown as typeof fetch,
    };
    const result = await runAnalyze([]);
    const archive = join(result.fixture.root, "explicit.tar.gz");
    await writeArchive(archive);

    const rerun = await runAnalyzeWithFixture(result.fixture, ["--archive", archive]);

    expect(rerun.exitCode).toBe(0);
    expect(uploadCalled).toBe(true);
  });

  test("--archive validation failure exits before upload", async () => {
    let uploadCalled = false;
    AnalyzeSessionsCommand.testDeps = {
      fetch: (async () => {
        uploadCalled = true;
        return Response.json({});
      }) as unknown as typeof fetch,
    };
    const result = await runAnalyze([]);
    const archive = join(result.fixture.root, "bad.zip");
    await writeArchive(archive);

    const rerun = await runAnalyzeWithFixture(result.fixture, ["--archive", archive]);

    expect(rerun.exitCode).toBe(1);
    expect(rerun.stderr).toContain("Unsupported archive extension");
    expect(uploadCalled).toBe(false);
  });

  test("--wait --json emits report URL", async () => {
    const responses = [
      Response.json({ jobId: "job_x", status: "queued" }, { status: 201 }),
      Response.json({
        id: "job_x",
        status: "completed",
        createdAt: "2026-06-03T00:00:00Z",
        updatedAt: "2026-06-03T00:01:00Z",
        error: null,
        reportId: "rep_x",
      }),
    ];
    AnalyzeSessionsCommand.testDeps = {
      env: { DRWN_ANALYZER_WEB_URL: "https://app.test" },
      fetch: (async () => responses.shift() ?? Response.json({})) as unknown as typeof fetch,
      sleep: async () => {},
      now: () => 0,
    };
    const result = await runAnalyze([]);
    const archive = join(result.fixture.repoRoot, ".agents", "drwn", "session-log-exports", "x.tar.gz");
    await writeArchive(archive);

    const rerun = await runAnalyzeWithFixture(result.fixture, ["--wait", "--json"]);
    const parsed = JSON.parse(rerun.stdout);

    expect(rerun.exitCode).toBe(0);
    expect(parsed).toEqual({
      jobId: "job_x",
      processingUrl: "https://app.test/processing/job_x",
      reportUrl: "https://app.test/report/rep_x",
    });
  });

  test("maps 401 and 413 upload errors", async () => {
    AnalyzeSessionsCommand.testDeps = {
      fetch: (async () => new Response("no", { status: 401 })) as unknown as typeof fetch,
    };
    const result = await runAnalyze([]);
    const archive = join(result.fixture.repoRoot, ".agents", "drwn", "session-log-exports", "x.tar.gz");
    await writeArchive(archive);

    const expired = await runAnalyzeWithFixture(result.fixture, []);
    expect(expired.exitCode).toBe(1);
    expect(expired.stderr).toContain("Session expired. Run `drwn login`.");

    AnalyzeSessionsCommand.testDeps = {
      fetch: (async () => new Response("too big", { status: 413 })) as unknown as typeof fetch,
    };
    const tooLarge = await runAnalyzeWithFixture(result.fixture, []);
    expect(tooLarge.exitCode).toBe(1);
    expect(tooLarge.stderr).toContain("Archive exceeds server limit");
  });

  test("--open without webBaseUrl does not spawn and prints a hint", async () => {
    let opened = false;
    AnalyzeSessionsCommand.testDeps = {
      fetch: (async () => Response.json({ jobId: "job_x", status: "queued" }, { status: 201 })) as unknown as typeof fetch,
      openBrowser: () => { opened = true; },
    };
    const result = await runAnalyze([]);
    const archive = join(result.fixture.repoRoot, ".agents", "drwn", "session-log-exports", "x.tar.gz");
    await writeArchive(archive);

    const rerun = await runAnalyzeWithFixture(result.fixture, ["--open"]);

    expect(rerun.exitCode).toBe(0);
    expect(opened).toBe(false);
    expect(rerun.stderr).toContain("No analyzer.webBaseUrl configured; cannot open browser.");
  });
});

async function runAnalyzeWithFixture(
  fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>,
  args: string[],
) {
  const stdout = new CaptureStream();
  const stderr = new CaptureStream();
  const context: AgentsContext = {
    repoRoot: fixture.repoRoot,
    agentsDir: fixture.agentsDir,
    homeDir: fixture.homeDir,
    cwd: fixture.repoRoot,
    projectConfigPath: null,
    stdin: process.stdin,
    stdout,
    stderr,
    env: {},
    colorDepth: 1,
  };
  const cli = new Cli({ binaryName: "drwn", binaryLabel: "drwn", binaryVersion: "0.0.0" });
  cli.register(AnalyzeSessionsCommand);
  const exitCode = await cli.run(["analyze", "sessions", ...args], context);
  return { stdout: stdout.text(), stderr: stderr.text(), exitCode };
}
