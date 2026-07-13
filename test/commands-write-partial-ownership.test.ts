// ABOUTME: Exercises partial project writes after a complete projection record exists.
// ABOUTME: Ensures unselected target bytes and ownership survive every supported partial mode.

import { afterEach, describe, expect, test } from "bun:test";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  cleanupTempRoots,
  envFor,
  installProjectWorkers,
  publishCardWithSkills,
  runAgentsCli,
  scaffoldCliFixture,
} from "./helpers";
import { loadWriteRecord, resolveProjectWriteRecordPath } from "../cli/core/write-record";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function completeProject() {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, {
    name: "@me/complete",
    skills: ["alpha"],
    servers: {
      context7: {
        description: "Docs",
        transport: "stdio",
        command: "npx",
        args: ["-y", "@upstash/context7-mcp"],
        optional: false,
      },
    },
  });
  const projectRoot = join(fixture.root, "project");
  await installProjectWorkers(projectRoot, fixture.agentsDir, ["@me/complete@1.0.0"], "@me/complete");
  const full = await runAgentsCli(["write", "--json"], envFor(fixture), projectRoot);
  expect(full.exitCode).toBe(0);
  return { fixture, projectRoot };
}

const paths = {
  claudeMcp: ".mcp.json",
  codexMcp: ".codex/config.toml",
  cursorMcp: ".cursor/mcp.json",
  claudeSkill: ".claude/skills/alpha/SKILL.md",
  codexSkill: ".codex/skills/alpha/SKILL.md",
};

async function snapshot(projectRoot: string, selected: Array<keyof typeof paths>) {
  return Object.fromEntries(await Promise.all(selected.map(async (key) => {
    const absolute = join(projectRoot, paths[key]);
    return [key, { bytes: await readFile(absolute), mtimeMs: (await stat(absolute)).mtimeMs }];
  })));
}

describe("partial project projection ownership", () => {
  test.each([
    [["--mcp-only"], ["claudeSkill", "codexSkill"]],
    [["--skills-only"], ["claudeMcp", "codexMcp", "cursorMcp"]],
    [["--target=claude"], ["codexMcp", "cursorMcp", "codexSkill"]],
    [["--target=codex"], ["claudeMcp", "cursorMcp", "claudeSkill"]],
    [["--target=cursor"], ["claudeMcp", "codexMcp", "claudeSkill", "codexSkill"]],
    [["--mcp-only", "--target=claude"], ["codexMcp", "cursorMcp", "claudeSkill", "codexSkill"]],
    [["--mcp-only", "--target=codex"], ["claudeMcp", "cursorMcp", "claudeSkill", "codexSkill"]],
    [["--mcp-only", "--target=cursor"], ["claudeMcp", "codexMcp", "claudeSkill", "codexSkill"]],
    [["--skills-only", "--target=claude"], ["claudeMcp", "codexMcp", "cursorMcp", "codexSkill"]],
    [["--skills-only", "--target=codex"], ["claudeMcp", "codexMcp", "cursorMcp", "claudeSkill"]],
    [["--skills-only", "--target=cursor"], ["claudeMcp", "codexMcp", "cursorMcp", "claudeSkill", "codexSkill"]],
  ] as const)("%j preserves unselected bytes and ownership", async (args, unselected) => {
    const { fixture, projectRoot } = await completeProject();
    const before = await snapshot(projectRoot, [...unselected]);
    const recordPath = resolveProjectWriteRecordPath(projectRoot);
    const configPath = join(projectRoot, ".agents", "drwn", "config.json");
    const lockPath = join(projectRoot, ".agents", "drwn", "card.lock");
    const configBefore = { bytes: await readFile(configPath), mtimeMs: (await stat(configPath)).mtimeMs };
    const lockBefore = { bytes: await readFile(lockPath), mtimeMs: (await stat(lockPath)).mtimeMs };
    const prior = loadWriteRecord(recordPath, "project")!;
    const priorUnselected = prior.managedPaths.filter((item) =>
      Object.values(paths).some((path) => item.path === path || path.startsWith(`${item.path}/`))
    );

    const result = await runAgentsCli(["write", "--json", ...args], envFor(fixture), projectRoot);

    expect(result.exitCode).toBe(0);
    const after = await snapshot(projectRoot, [...unselected]);
    for (const key of unselected) {
      expect(after[key]!.bytes).toEqual(before[key]!.bytes);
      expect(after[key]!.mtimeMs).toBe(before[key]!.mtimeMs);
    }
    expect(await readFile(configPath)).toEqual(configBefore.bytes);
    expect((await stat(configPath)).mtimeMs).toBe(configBefore.mtimeMs);
    expect(await readFile(lockPath)).toEqual(lockBefore.bytes);
    expect((await stat(lockPath)).mtimeMs).toBe(lockBefore.mtimeMs);
    const next = loadWriteRecord(recordPath, "project")!;
    for (const owned of priorUnselected) {
      if (unselected.some((key) => paths[key] === owned.path || paths[key].startsWith(`${owned.path}/`))) {
        expect(next.managedPaths).toContainEqual(owned);
      }
    }
  });

  test("a partial write without a prior record claims only emitted ownership", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectRoot = join(fixture.root, "project");
    await installProjectWorkers(projectRoot, fixture.agentsDir, [], null, {
      mcpServers: { context7: { enabled: true } },
    });

    const result = await runAgentsCli(["write", "--mcp-only", "--target=cursor", "--json"], envFor(fixture), projectRoot);

    expect(result.exitCode).toBe(0);
    const record = loadWriteRecord(resolveProjectWriteRecordPath(projectRoot), "project")!;
    expect(record.managedPaths.filter((entry) => entry.surface !== "worker"))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ surface: "mcp", target: "cursor" }),
      ]));
    expect(record.managedPaths.filter((entry) => entry.surface !== "worker")
      .every((entry) => entry.surface === "mcp" && entry.target === "cursor")).toBe(true);
  });

  test("selected stale ownership is cleaned while unselected targets remain unchanged", async () => {
    const { fixture, projectRoot } = await completeProject();
    const claudeBefore = await readFile(join(projectRoot, paths.claudeMcp));
    const configPath = join(projectRoot, ".agents", "drwn", "config.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.mcpServers = { context7: { enabled: false } };
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);

    const result = await runAgentsCli(["write", "--mcp-only", "--target=cursor", "--json"], envFor(fixture), projectRoot);

    expect(result.exitCode).toBe(0);
    expect(await readFile(join(projectRoot, paths.claudeMcp))).toEqual(claudeBefore);
    const cursor = JSON.parse(await readFile(join(projectRoot, paths.cursorMcp), "utf8"));
    expect(cursor.mcpServers?.context7).toBeUndefined();
    const next = loadWriteRecord(resolveProjectWriteRecordPath(projectRoot), "project")!;
    expect(next.managedPaths.some((entry) => entry.surface === "mcp" && entry.target === "cursor")).toBe(false);
    expect(next.managedPaths.some((entry) => entry.surface === "mcp" && entry.target === "claude")).toBe(true);
  });

  test("selected changed output is reconciled without rewriting unselected targets", async () => {
    const { fixture, projectRoot } = await completeProject();
    const claudePath = join(projectRoot, paths.claudeMcp);
    const claudeBefore = { bytes: await readFile(claudePath), mtimeMs: (await stat(claudePath)).mtimeMs };
    const cursorPath = join(projectRoot, paths.cursorMcp);
    const cursorBefore = await readFile(cursorPath);
    const configPath = join(projectRoot, ".agents", "drwn", "config.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.mcpServers = {
      context7: {
        description: "Changed docs",
        transport: "stdio",
        command: "node",
        args: ["changed-server.mjs"],
        optional: false,
      },
    };
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);

    const result = await runAgentsCli(["write", "--mcp-only", "--target=cursor", "--json"], envFor(fixture), projectRoot);

    expect(result.exitCode).toBe(0);
    expect(await readFile(cursorPath)).not.toEqual(cursorBefore);
    expect(JSON.parse(await readFile(cursorPath, "utf8")).mcpServers.context7.command).toBe("node");
    expect(await readFile(claudePath)).toEqual(claudeBefore.bytes);
    expect((await stat(claudePath)).mtimeMs).toBe(claudeBefore.mtimeMs);
  });

  test("partial dry-run is byte- and mtime-read-only and the next full plan is idempotent", async () => {
    const { fixture, projectRoot } = await completeProject();
    const tracked = [
      ...Object.values(paths).map((path) => join(projectRoot, path)),
      join(projectRoot, ".agents", "drwn", "config.json"),
      join(projectRoot, ".agents", "drwn", "card.lock"),
      resolveProjectWriteRecordPath(projectRoot),
    ];
    const before = await Promise.all(tracked.map(async (path) => ({
      path,
      bytes: await readFile(path),
      mtimeMs: (await stat(path)).mtimeMs,
    })));

    const dryRun = await runAgentsCli(["write", "--mcp-only", "--target=cursor", "--dry-run", "--json"], envFor(fixture), projectRoot);

    expect(dryRun.exitCode).toBe(0);
    for (const prior of before) {
      expect(await readFile(prior.path)).toEqual(prior.bytes);
      expect((await stat(prior.path)).mtimeMs).toBe(prior.mtimeMs);
    }
    expect((JSON.parse(dryRun.stdout) as { changes: string[] }).changes).toEqual([]);

    const partial = await runAgentsCli(["write", "--skills-only", "--target=claude", "--json"], envFor(fixture), projectRoot);
    expect(partial.exitCode).toBe(0);
    const fullPlan = await runAgentsCli(["write", "--dry-run", "--json"], envFor(fixture), projectRoot);
    expect(fullPlan.exitCode).toBe(0);
    expect((JSON.parse(fullPlan.stdout) as { changes: string[] }).changes).toEqual([]);
  });
});
