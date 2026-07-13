// ABOUTME: Verifies project status and doctor report the same plan as a full dry-run.
// ABOUTME: Guards read-only diagnostics for missing, stale, and invalid projection state.

import { afterEach, describe, expect, test } from "bun:test";
import { readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture, writeSupportedProjectConfig } from "./helpers";
import {
  hashManagedContent,
  loadWriteRecord,
  resolveProjectWriteRecordPath,
  saveWriteRecord,
} from "../cli/core/write-record";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function projectWithMcp() {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectRoot = join(fixture.root, "project");
  await writeSupportedProjectConfig(projectRoot, {
    mcpServers: { context7: { enabled: true } },
  });
  return { fixture, projectRoot, recordPath: resolveProjectWriteRecordPath(projectRoot) };
}

async function status(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>, projectRoot: string) {
  const result = await runAgentsCli(["status", "--json"], envFor(fixture), projectRoot);
  expect(result.exitCode, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as {
    projection: { current: boolean; issues: string[] };
    sections: { writeRecord: { present: boolean; corrupt: boolean } };
  };
}

async function doctor(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>, projectRoot: string) {
  const result = await runAgentsCli(["doctor", "--json"], envFor(fixture), projectRoot);
  expect(result.exitCode, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as {
    projection: { current: boolean; issues: string[] };
    projectConfigIssues: string[];
    writeRecord: { present: boolean; corrupt: boolean };
  };
}

describe("project projection diagnostics", () => {
  test("record presence alone is not current when a full write plans output", async () => {
    const { fixture, projectRoot, recordPath } = await projectWithMcp();
    saveWriteRecord(recordPath, {
      schema: "drwn.write-record",
      schemaVersion: 1,
      scope: "project",
      lastWriteAt: "2026-07-13T00:00:00.000Z",
      lastWriteHarnessVersion: "0.8.0",
      managedPaths: [],
    });

    const report = await status(fixture, projectRoot);

    expect(report.projection.current).toBe(false);
    expect(report.projection.issues).toEqual(expect.arrayContaining([
      expect.stringContaining("PROJECT_PROJECTION_CHANGE"),
    ]));
  });

  test("missing selected output is stale and status agrees with doctor", async () => {
    const { fixture, projectRoot } = await projectWithMcp();
    expect((await runAgentsCli(["write", "--json"], envFor(fixture), projectRoot)).exitCode).toBe(0);
    await rm(join(projectRoot, ".mcp.json"));

    const [statusReport, doctorReport] = await Promise.all([
      status(fixture, projectRoot),
      doctor(fixture, projectRoot),
    ]);

    expect(statusReport.projection.current).toBe(false);
    expect(statusReport.projection.issues.some((issue) => issue.includes(".mcp.json"))).toBe(true);
    expect(doctorReport.projection).toEqual(statusReport.projection);
    expect(doctorReport.projectConfigIssues).toEqual(expect.arrayContaining(statusReport.projection.issues));
  });

  test("same-path representation handoff is stale even when projected bytes match", async () => {
    const { fixture, projectRoot, recordPath } = await projectWithMcp();
    expect((await runAgentsCli(["write", "--json"], envFor(fixture), projectRoot)).exitCode).toBe(0);
    const record = loadWriteRecord(recordPath, "project")!;
    const cursorPath = join(projectRoot, ".cursor", "mcp.json");
    const cursorIndex = record.managedPaths.findIndex((entry) => entry.path === ".cursor/mcp.json");
    record.managedPaths[cursorIndex] = {
      path: ".cursor/mcp.json",
      kind: "managed-content",
      surface: "mcp",
      target: "cursor",
      contentHash: hashManagedContent(await readFile(cursorPath)),
    };
    saveWriteRecord(recordPath, record);
    const cursorBefore = await readFile(cursorPath);

    const report = await status(fixture, projectRoot);

    expect(report.projection.current).toBe(false);
    expect(report.projection.issues).toEqual(expect.arrayContaining([
      expect.stringContaining("PROJECT_PROJECTION_OWNERSHIP_STALE"),
    ]));
    expect(await readFile(cursorPath)).toEqual(cursorBefore);
  });

  test("invalid prototype records are reported without rewriting them", async () => {
    const { fixture, projectRoot, recordPath } = await projectWithMcp();
    const prototype = `${JSON.stringify({
      writeRecordVersion: 1,
      lastWriteAt: "2026-07-13T00:00:00.000Z",
      lastWriteHarnessVersion: "0.8.0",
      managedPaths: [],
    }, null, 2)}\n`;
    await writeFile(recordPath, prototype);

    const [statusReport, doctorReport] = await Promise.all([
      status(fixture, projectRoot),
      doctor(fixture, projectRoot),
    ]);

    expect(statusReport.projection).toMatchObject({ current: false });
    expect(statusReport.projection.issues.join("\n")).toContain("WRITE_RECORD_INVALID");
    expect(statusReport.sections.writeRecord).toEqual(expect.objectContaining({ present: true, corrupt: true }));
    expect(doctorReport.writeRecord).toEqual(expect.objectContaining({ present: true, corrupt: true }));
    expect(await readFile(recordPath, "utf8")).toBe(prototype);
  });

  test("status and doctor preserve bytes and mtimes and become current after full write", async () => {
    const { fixture, projectRoot, recordPath } = await projectWithMcp();
    expect((await runAgentsCli(["write", "--json"], envFor(fixture), projectRoot)).exitCode).toBe(0);
    const paths = [
      join(projectRoot, ".agents", "drwn", "config.json"),
      recordPath,
      join(projectRoot, ".mcp.json"),
      join(projectRoot, ".codex", "config.toml"),
      join(projectRoot, ".cursor", "mcp.json"),
    ];
    const before = await Promise.all(paths.map(async (path) => ({
      path,
      bytes: await readFile(path),
      mtimeMs: (await stat(path)).mtimeMs,
    })));

    const statusReport = await status(fixture, projectRoot);
    const doctorReport = await doctor(fixture, projectRoot);

    expect(statusReport.projection).toEqual({ current: true, issues: [] });
    expect(doctorReport.projection).toEqual(statusReport.projection);
    expect(doctorReport.projectConfigIssues).not.toEqual(expect.arrayContaining([
      expect.stringContaining("PROJECT_PROJECTION_"),
    ]));
    for (const prior of before) {
      expect(await readFile(prior.path)).toEqual(prior.bytes);
      expect((await stat(prior.path)).mtimeMs).toBe(prior.mtimeMs);
    }
  });
});
