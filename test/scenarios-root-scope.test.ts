// ABOUTME: Verifies `drwn write --root` materializes machine defaults into user-scope tool configs.
// ABOUTME: Protects per-server MCP ownership, drift detection, removal, and project isolation.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function readJson(pathValue: string) {
  return JSON.parse(await readFile(pathValue, "utf8")) as Record<string, any>;
}

async function writeJson(pathValue: string, value: unknown) {
  await mkdir(dirname(pathValue), { recursive: true });
  await writeFile(pathValue, `${JSON.stringify(value, null, 2)}\n`);
}

async function runWriteRoot(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>, args: string[] = [], cwd?: string) {
  return await runAgentsCli(["write", "--root", "--mcp-only", "--json", ...args], envFor(fixture), cwd);
}

async function ensureContext7Default(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  const result = await runAgentsCli(["library", "defaults", "add", "mcp", "context7", "--json"], envFor(fixture));
  expect(result.exitCode).toBe(0);
}

test("write --root surgically adds default MCPs to user-scope tool configs", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: [] });
  tempRoots.push(fixture.root);
  await ensureContext7Default(fixture);
  await writeJson(fixture.claudeUserMcp, {
    numStartups: 482,
    userID: "user-abc",
    mcpServers: {
      manual: { type: "http", url: "https://manual.example/mcp" },
    },
    projects: { "/tmp/project": { lastActive: "2026-06-24" } },
  });

  const result = await runWriteRoot(fixture);

  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout) as { changes: string[]; managedPaths?: Array<any> };
  expect(parsed.changes.some((change) => change.includes(fixture.claudeUserMcp))).toBe(true);
  expect(parsed.changes.some((change) => change.includes(fixture.codexConfig))).toBe(true);
  expect(parsed.changes.some((change) => change.includes(fixture.cursorConfig))).toBe(true);

  const claude = await readJson(fixture.claudeUserMcp);
  expect(claude.numStartups).toBe(482);
  expect(claude.userID).toBe("user-abc");
  expect(claude.projects).toEqual({ "/tmp/project": { lastActive: "2026-06-24" } });
  expect(claude.mcpServers.manual).toEqual({ type: "http", url: "https://manual.example/mcp" });
  expect(claude.mcpServers.context7.command).toBe("npx");
  expect(claude._drwn).toBeUndefined();

  expect(await readFile(fixture.codexConfig, "utf8")).toContain("[mcp_servers.context7]");
  expect((await lstat(fixture.cursorConfig)).isSymbolicLink()).toBe(true);

  const record = await readJson(join(fixture.agentsDir, "drwn", "global-write-record.json"));
  const claudeEntry = record.managedPaths.find((entry: any) => entry.path === ".claude.json");
  expect(claudeEntry?.kind).toBe("managed-fields");
  expect(claudeEntry?.fields).toEqual(["mcpServers:context7"]);
  expect(claudeEntry?.fieldHashes?.["mcpServers:context7"]).toStartWith("sha256-");
});

test("write --root detects drift only for drwn-owned MCP server entries", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: [] });
  tempRoots.push(fixture.root);
  await ensureContext7Default(fixture);
  await writeJson(fixture.claudeUserMcp, {
    mcpServers: {
      manual: { type: "http", url: "https://manual.example/mcp" },
    },
  });
  expect((await runWriteRoot(fixture)).exitCode).toBe(0);

  const siblingEdited = await readJson(fixture.claudeUserMcp);
  siblingEdited.mcpServers.manual.url = "https://changed.example/mcp";
  await writeJson(fixture.claudeUserMcp, siblingEdited);

  const siblingResult = await runWriteRoot(fixture);
  expect(siblingResult.exitCode).toBe(0);
  expect((await readJson(fixture.claudeUserMcp)).mcpServers.manual.url).toBe("https://changed.example/mcp");

  const ownedEdited = await readJson(fixture.claudeUserMcp);
  ownedEdited.mcpServers.context7.command = "node";
  await writeJson(fixture.claudeUserMcp, ownedEdited);

  const drift = await runWriteRoot(fixture);
  expect(drift.exitCode).not.toBe(0);
  expect(`${drift.stdout}\n${drift.stderr}`).toContain("context7");

  const forced = await runWriteRoot(fixture, ["--force"]);
  expect(forced.exitCode).toBe(0);
  expect((await readJson(fixture.claudeUserMcp)).mcpServers.context7.command).toBe("npx");
});

test("write --root removes the last drwn-owned MCP entry without touching hand-managed siblings", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: [] });
  tempRoots.push(fixture.root);
  await ensureContext7Default(fixture);
  await writeJson(fixture.claudeUserMcp, {
    mcpServers: {
      manual: { type: "http", url: "https://manual.example/mcp" },
    },
  });
  expect((await runWriteRoot(fixture)).exitCode).toBe(0);

  const remove = await runAgentsCli(["library", "defaults", "remove", "mcp", "context7", "--json"], envFor(fixture));
  expect(remove.exitCode).toBe(0);
  const rewrite = await runWriteRoot(fixture);
  expect(rewrite.exitCode).toBe(0);

  const claude = await readJson(fixture.claudeUserMcp);
  expect(claude.mcpServers.context7).toBeUndefined();
  expect(claude.mcpServers.manual).toEqual({ type: "http", url: "https://manual.example/mcp" });
  const record = await readJson(join(fixture.agentsDir, "drwn", "global-write-record.json"));
  expect(record.managedPaths.some((entry: any) => entry.path === ".claude.json")).toBe(false);
});

test("write --root with no machine MCP defaults leaves user-scope MCP files unchanged", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: [] });
  tempRoots.push(fixture.root);
  const repoConfig = await readJson(join(fixture.repoRoot, "registry", "config.json"));
  repoConfig.defaults = { ...(repoConfig.defaults ?? {}), mcpServers: [] };
  await writeJson(join(fixture.agentsDir, "drwn", "config.json"), repoConfig);
  await writeJson(fixture.claudeUserMcp, {
    numStartups: 3,
    mcpServers: {
      manual: { type: "http", url: "https://manual.example/mcp" },
    },
  });
  const beforeClaude = await readFile(fixture.claudeUserMcp, "utf8");
  const beforeCodex = await readFile(fixture.codexConfig, "utf8");

  const result = await runWriteRoot(fixture);

  expect(result.exitCode).toBe(0);
  expect(await readFile(fixture.claudeUserMcp, "utf8")).toBe(beforeClaude);
  expect(await readFile(fixture.codexConfig, "utf8")).toBe(beforeCodex);
  expect(JSON.parse(result.stdout).warnings.join("\n")).toContain("no machine-default MCP servers");
});

test("write --root ignores project config and leaves project MCP files untouched", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: [] });
  tempRoots.push(fixture.root);
  await ensureContext7Default(fixture);
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
  await writeJson(join(projectDir, ".agents", "drwn", "config.json"), {
    version: 1,
    servers: { context7: { enabled: false } },
  });

  const result = await runWriteRoot(fixture, [], projectDir);

  expect(result.exitCode).toBe(0);
  expect((await readJson(fixture.claudeUserMcp)).mcpServers.context7).toBeDefined();
  expect(existsSync(join(projectDir, ".mcp.json"))).toBe(false);
  expect(existsSync(join(projectDir, ".codex", "config.toml"))).toBe(false);
});

test("doctor reports user-scope Claude MCP drift from the per-server write record", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: [] });
  tempRoots.push(fixture.root);
  await ensureContext7Default(fixture);
  expect((await runWriteRoot(fixture)).exitCode).toBe(0);
  const edited = await readJson(fixture.claudeUserMcp);
  edited.mcpServers.context7.command = "node";
  await writeJson(fixture.claudeUserMcp, edited);

  const doctor = await runAgentsCli(["doctor", "--json"], envFor(fixture));

  expect(doctor.exitCode).toBe(0);
  const report = JSON.parse(doctor.stdout) as { mcpDrift: string[] };
  expect(report.mcpDrift.some((item) => item.includes(".claude.json"))).toBe(true);
});

// ───────────────────────────────────────────────────────────────────────────
// Task 51 — must-have additions (M2, M3a, M3b)
// ───────────────────────────────────────────────────────────────────────────

test("write --root does not flag drift after ~/.claude.json is re-serialized with different key ordering", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: [] });
  tempRoots.push(fixture.root);
  await ensureContext7Default(fixture);
  expect((await runWriteRoot(fixture)).exitCode).toBe(0);

  // Simulate Claude Code rewriting the file with sorted keys (it does this on UI
  // settings changes — keys can get re-sorted and whitespace can change).
  const parsed = await readJson(fixture.claudeUserMcp);
  const sortKeys = (value: any): any => {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortKeys(value[k])]));
    }
    return value;
  };
  await writeJson(fixture.claudeUserMcp, sortKeys(parsed));

  const second = await runWriteRoot(fixture);
  expect(second.exitCode).toBe(0);
  expect(`${second.stdout}\n${second.stderr}`).not.toContain("Drift detected");
  // The owned entry survives the round-trip intact.
  expect((await readJson(fixture.claudeUserMcp)).mcpServers.context7.command).toBe("npx");
});

test("write rejects passing both --root and --user simultaneously", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: [] });
  tempRoots.push(fixture.root);

  const result = await runAgentsCli(
    ["write", "--root", "--user", "--mcp-only", "--json"],
    envFor(fixture),
  );
  expect(result.exitCode).not.toBe(0);
  expect(`${result.stdout}\n${result.stderr}`).toMatch(/--root or --user/i);
});

test("write --user behaves identically to write --root", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: [] });
  tempRoots.push(fixture.root);
  await ensureContext7Default(fixture);

  const result = await runAgentsCli(
    ["write", "--user", "--mcp-only", "--json"],
    envFor(fixture),
  );
  expect(result.exitCode).toBe(0);
  expect((await readJson(fixture.claudeUserMcp)).mcpServers.context7).toBeDefined();

  // Side-table records --user write the same way --root does.
  const record = await readJson(join(fixture.agentsDir, "drwn", "global-write-record.json"));
  expect(record.managedPaths.some((entry: any) => entry.path === ".claude.json")).toBe(true);
});

// ───────────────────────────────────────────────────────────────────────────
// Task 51 — should-have additions (S1, S2a/b/c, S4, S5)
// ───────────────────────────────────────────────────────────────────────────

test("write --root --dry-run produces a plan but does not modify any user-scope file", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: [] });
  tempRoots.push(fixture.root);
  await ensureContext7Default(fixture);
  const beforeClaude = await readFile(fixture.claudeUserMcp, "utf8");
  const beforeCodex = await readFile(fixture.codexConfig, "utf8");
  const writeRecordPath = join(fixture.agentsDir, "drwn", "global-write-record.json");

  const result = await runAgentsCli(
    ["write", "--root", "--mcp-only", "--dry-run", "--json"],
    envFor(fixture),
  );

  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout) as { changes: string[] };
  expect(parsed.changes.length).toBeGreaterThan(0);
  expect(parsed.changes.some((c) => c.includes(fixture.claudeUserMcp))).toBe(true);

  // No actual writes, no write-record persistence.
  expect(await readFile(fixture.claudeUserMcp, "utf8")).toBe(beforeClaude);
  expect(await readFile(fixture.codexConfig, "utf8")).toBe(beforeCodex);
  expect(existsSync(writeRecordPath)).toBe(false);
});

test("write --root --target=claude writes only ~/.claude.json", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: [] });
  tempRoots.push(fixture.root);
  await ensureContext7Default(fixture);
  const beforeCodex = await readFile(fixture.codexConfig, "utf8");

  const result = await runAgentsCli(
    ["write", "--root", "--target=claude", "--mcp-only", "--json"],
    envFor(fixture),
  );

  expect(result.exitCode).toBe(0);
  expect((await readJson(fixture.claudeUserMcp)).mcpServers.context7).toBeDefined();
  expect(await readFile(fixture.codexConfig, "utf8")).toBe(beforeCodex);
});

test("write --root --target=codex writes only ~/.codex/config.toml", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: [] });
  tempRoots.push(fixture.root);
  await ensureContext7Default(fixture);
  const beforeClaude = await readFile(fixture.claudeUserMcp, "utf8");

  const result = await runAgentsCli(
    ["write", "--root", "--target=codex", "--mcp-only", "--json"],
    envFor(fixture),
  );

  expect(result.exitCode).toBe(0);
  expect(await readFile(fixture.codexConfig, "utf8")).toContain("[mcp_servers.context7]");
  expect(await readFile(fixture.claudeUserMcp, "utf8")).toBe(beforeClaude);
});

test("write --root --target=cursor writes only ~/.cursor/mcp.json", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: [] });
  tempRoots.push(fixture.root);
  await ensureContext7Default(fixture);
  const beforeClaude = await readFile(fixture.claudeUserMcp, "utf8");
  const beforeCodex = await readFile(fixture.codexConfig, "utf8");

  const result = await runAgentsCli(
    ["write", "--root", "--target=cursor", "--mcp-only", "--json"],
    envFor(fixture),
  );

  expect(result.exitCode).toBe(0);
  expect((await lstat(fixture.cursorConfig)).isSymbolicLink()).toBe(true);
  expect(await readFile(fixture.claudeUserMcp, "utf8")).toBe(beforeClaude);
  expect(await readFile(fixture.codexConfig, "utf8")).toBe(beforeCodex);
});

test("write --root with empty defaults but prior ownership prunes without emitting the no-defaults warning", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: [] });
  tempRoots.push(fixture.root);
  await ensureContext7Default(fixture);
  expect((await runWriteRoot(fixture)).exitCode).toBe(0);

  // Confirm both Claude and Codex own context7 after the first write.
  expect(await readFile(fixture.codexConfig, "utf8")).toContain("[mcp_servers.context7]");
  expect((await readJson(fixture.claudeUserMcp)).mcpServers.context7).toBeDefined();

  // Remove the default via the CLI — empties the active server set but the
  // write-record still records prior ownership.
  const remove = await runAgentsCli(
    ["library", "defaults", "remove", "mcp", "context7", "--json"],
    envFor(fixture),
  );
  expect(remove.exitCode).toBe(0);

  const result = await runWriteRoot(fixture);

  expect(result.exitCode).toBe(0);
  const warnings = (JSON.parse(result.stdout).warnings as string[]).join("\n");
  expect(warnings).not.toContain("no machine-default MCP servers");
  // Cleanup actually ran across both targets.
  expect(await readFile(fixture.codexConfig, "utf8")).not.toContain("[mcp_servers.context7]");
  expect((await readJson(fixture.claudeUserMcp)).mcpServers?.context7).toBeUndefined();
});

test("write --root leaves no orphaned .tmp files after a successful write", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: [] });
  tempRoots.push(fixture.root);
  await ensureContext7Default(fixture);

  expect((await runWriteRoot(fixture)).exitCode).toBe(0);

  // Atomic write contract: every <path>.tmp must have been renamed away.
  expect(existsSync(`${fixture.claudeUserMcp}.tmp`)).toBe(false);
  expect(existsSync(`${fixture.codexConfig}.tmp`)).toBe(false);
  const generatedCursor = join(fixture.agentsDir, "drwn", "generated", "cursor-mcp.json");
  expect(existsSync(`${generatedCursor}.tmp`)).toBe(false);
});
