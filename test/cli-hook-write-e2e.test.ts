// ABOUTME: Verifies drwn write materializes card hook composers end to end.
// ABOUTME: Protects source-to-publish-to-project hook wiring across runtimes.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { cleanupTempRoots, envFor, installProjectWorkers, runAgentsCli, scaffoldCliFixture, writeSupportedProjectConfig } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function runComposer(path: string, payload: unknown) {
  const proc = Bun.spawn([(Bun.which("bun") ?? process.execPath), path], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  proc.stdin.write(JSON.stringify(payload));
  proc.stdin.end();
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

async function publishHookPolicyCard(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  expect((await runAgentsCli(["card", "new", "@me/policy", "--no-git"], envFor(fixture))).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "source", "add-hook", "@me/policy", "guard"], envFor(fixture))).exitCode).toBe(0);
  const sourceDir = join(fixture.agentsDir, "drwn", "sources", "@me", "policy");
  const policyPath = join(sourceDir, "hooks", "guard", "policy.ts");
  await writeFile(policyPath, `
    import { defineToolPolicy } from "darwinian/hook-policy";
    export default defineToolPolicy({
      policyKind: "enforcement",
      matcher: "Bash",
      beforeToolCall() {
        return { action: "deny", reason: "blocked" };
      },
    });
  `);
  expect((await runAgentsCli(["card", "publish", "@me/policy"], envFor(fixture))).exitCode).toBe(0);
  return JSON.parse(await readFile(join(sourceDir, "card.json"), "utf8")) as { version: string };
}

async function createProjectWithTrustedHookCard(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  const manifest = await publishHookPolicyCard(fixture);
  const projectDir = join(fixture.root, "project");
  await installProjectWorkers(projectDir, fixture.agentsDir, [`@me/policy@${manifest.version}`], "@me/policy");
  expect((await runAgentsCli(["card", "trust", "@me/policy", "--hooks"], envFor(fixture), projectDir)).exitCode).toBe(0);
  return projectDir;
}

test("drwn write materializes card hook composers and runtime settings", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  expect((await runAgentsCli(["card", "new", "@me/policy", "--no-git"], envFor(fixture))).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "source", "add-hook", "@me/policy", "guard"], envFor(fixture))).exitCode).toBe(0);
  const sourceDir = join(fixture.agentsDir, "drwn", "sources", "@me", "policy");
  const policyPath = join(sourceDir, "hooks", "guard", "policy.ts");
  await writeFile(policyPath, `
    import { defineToolPolicy } from "darwinian/hook-policy";
    export default defineToolPolicy({
      policyKind: "enforcement",
      matcher: "Bash",
      beforeToolCall(event) {
        return { action: "deny", reason: \`blocked by \${event.runtime}\` };
      },
    });
  `);
  expect((await runAgentsCli(["card", "publish", "@me/policy"], envFor(fixture))).exitCode).toBe(0);
  const manifest = JSON.parse(await readFile(join(sourceDir, "card.json"), "utf8"));

  const projectDir = join(fixture.root, "project");
  await installProjectWorkers(projectDir, fixture.agentsDir, [`@me/policy@${manifest.version}`], "@me/policy");
  expect((await runAgentsCli(["card", "trust", "@me/policy", "--hooks"], envFor(fixture), projectDir)).exitCode).toBe(0);

  const write = await runAgentsCli(["write", "--json"], envFor(fixture), projectDir);

  expect(write.exitCode).toBe(0);
  const writeResult = JSON.parse(write.stdout);
  expect(writeResult.warnings.join("\n")).toContain("/hooks");
  const claudeComposer = join(projectDir, ".agents", "drwn", "generated", "hooks", "claude", "composer.mjs");
  const codexComposer = join(projectDir, ".agents", "drwn", "generated", "hooks", "codex", "composer.mjs");
  expect(existsSync(claudeComposer)).toBe(true);
  expect(existsSync(codexComposer)).toBe(true);
  const resolvedClaudeComposer = await realpath(claudeComposer);
  const resolvedCodexComposer = await realpath(codexComposer);
  const claudeSettings = JSON.parse(await readFile(join(projectDir, ".claude", "settings.json"), "utf8"));
  expect(claudeSettings.hooks.PreToolUse[0].hooks[0].args).toEqual([resolvedClaudeComposer]);
  const codexHooks = JSON.parse(await readFile(join(projectDir, ".codex", "hooks.json"), "utf8"));
  expect(codexHooks.hooks.PreToolUse[0].hooks[0].command).toContain(resolvedCodexComposer);

  const composer = await runComposer(claudeComposer, {
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: "rm -rf /" },
  });
  expect(composer.exitCode).toBe(0);
  expect(JSON.parse(composer.stdout).hookSpecificOutput).toMatchObject({
    permissionDecision: "deny",
    permissionDecisionReason: "blocked by claude-code",
  });
});

test("drwn write skips untrusted hooks and --strict-hooks fails", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  expect((await runAgentsCli(["card", "new", "@me/policy", "--no-git"], envFor(fixture))).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "source", "add-hook", "@me/policy", "guard"], envFor(fixture))).exitCode).toBe(0);
  const sourceDir = join(fixture.agentsDir, "drwn", "sources", "@me", "policy");
  await writeFile(join(sourceDir, "hooks", "guard", "policy.ts"), `
    import { defineToolPolicy } from "darwinian/hook-policy";
    export default defineToolPolicy({
      policyKind: "enforcement",
      beforeToolCall() { return { action: "deny", reason: "blocked" }; },
    });
  `);
  expect((await runAgentsCli(["card", "publish", "@me/policy"], envFor(fixture))).exitCode).toBe(0);
  const manifest = JSON.parse(await readFile(join(sourceDir, "card.json"), "utf8"));
  const projectDir = join(fixture.root, "project");
  await installProjectWorkers(projectDir, fixture.agentsDir, [`@me/policy@${manifest.version}`], "@me/policy");

  const write = await runAgentsCli(["write", "--json"], envFor(fixture), projectDir);
  const strict = await runAgentsCli(["write", "--strict-hooks"], envFor(fixture), projectDir);

  expect(write.exitCode).toBe(0);
  const result = JSON.parse(write.stdout);
  expect(result.warnings.join("\n")).toContain("drwn card trust @me/policy --hooks");
  expect(existsSync(join(projectDir, ".agents", "drwn", "generated", "hooks", "claude", "composer.mjs"))).toBe(false);
  expect(strict.exitCode).not.toBe(0);
  expect(strict.stderr).toContain("drwn card trust @me/policy --hooks");
});

test("drwn write --mcp-only preserves existing Claude hook entries", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = await createProjectWithTrustedHookCard(fixture);
  expect((await runAgentsCli(["write", "--json"], envFor(fixture), projectDir)).exitCode).toBe(0);
  const before = JSON.parse(await readFile(join(projectDir, ".claude", "settings.json"), "utf8"));

  const mcpOnly = await runAgentsCli(["write", "--mcp-only", "--json"], envFor(fixture), projectDir);

  expect(mcpOnly.exitCode).toBe(0);
  const after = JSON.parse(await readFile(join(projectDir, ".claude", "settings.json"), "utf8"));
  expect(after.hooks).toEqual(before.hooks);
});

test("drwn write cleans only owned Claude hooks when policies become inactive", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = await createProjectWithTrustedHookCard(fixture);
  expect((await runAgentsCli(["write", "--json"], envFor(fixture), projectDir)).exitCode).toBe(0);
  const settingsPath = join(projectDir, ".claude", "settings.json");
  const settings = JSON.parse(await readFile(settingsPath, "utf8"));
  const foreign = { matcher: "Skill", hooks: [{ type: "command", command: "/usr/local/bin/foreign-signal", timeout: 5 }] };
  settings.hooks.PreToolUse.unshift(foreign);
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  const configPath = join(projectDir, ".agents", "drwn", "config.json");
  const projectConfig = JSON.parse(await readFile(configPath, "utf8"));
  projectConfig.hooks = { exclude: ["@me/policy:guard"] };
  await writeFile(
    configPath,
    JSON.stringify(projectConfig, null, 2),
  );

  const write = await runAgentsCli(["write", "--json"], envFor(fixture), projectDir);

  expect(write.exitCode).toBe(0);
  const cleaned = JSON.parse(await readFile(settingsPath, "utf8"));
  expect(cleaned.hooks.PreToolUse).toEqual([foreign]);
  expect(cleaned.hooks.PostToolUse).toBeUndefined();
  expect(cleaned._drwn.ownedHooks).toBeUndefined();
});

test("drwn write leaves session-signal hooks off by default", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = join(fixture.root, "project");
  await writeSupportedProjectConfig(projectDir);

  const write = await runAgentsCli(["write", "--json"], envFor(fixture), projectDir);

  expect(write.exitCode).toBe(0);
  expect(existsSync(join(projectDir, ".claude", "settings.json"))).toBe(false);
});

test("drwn write materializes enabled session-signal hooks with absolute invocation", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = join(fixture.root, "project");
  await writeSupportedProjectConfig(projectDir, { hooks: { signals: { enabled: true } } });

  const write = await runAgentsCli(["write", "--json"], envFor(fixture), projectDir);

  expect(write.exitCode).toBe(0);
  const settings = JSON.parse(await readFile(join(projectDir, ".claude", "settings.json"), "utf8"));
  const cardUsage = settings.hooks.UserPromptSubmit[0].hooks[0];
  expect(isAbsolute(cardUsage.command)).toBe(true);
  expect(cardUsage.command).not.toBe("drwn");
  expect(cardUsage.args.slice(-2)).toEqual(["hook", "card-usage"]);
  expect(settings.hooks.UserPromptExpansion[0].hooks[0].args.slice(-4)).toEqual(["hook", "skill-marker", "--phase", "expansion"]);
  expect(settings.hooks.PreToolUse).toMatchObject([{ matcher: "Skill" }]);
  expect(settings.hooks.PostToolUse).toMatchObject([{ matcher: "Skill" }]);
  expect(settings.hooks.PostToolUseFailure).toBeUndefined();
});

test("drwn write composes and removes session signals without disturbing card or foreign hooks", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = await createProjectWithTrustedHookCard(fixture);
  const configPath = join(projectDir, ".agents", "drwn", "config.json");
  const projectConfig = JSON.parse(await readFile(configPath, "utf8"));
  projectConfig.hooks = { signals: { enabled: true } };
  await writeFile(configPath, `${JSON.stringify(projectConfig, null, 2)}\n`);
  const settingsPath = join(projectDir, ".claude", "settings.json");
  const foreign = { matcher: "Bash", hooks: [{ type: "command", command: "/usr/local/bin/foreign-audit", timeout: 5 }] };
  await mkdir(join(projectDir, ".claude"), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify({ hooks: { PreToolUse: [foreign] } }, null, 2)}\n`);

  const enabled = await runAgentsCli(["write", "--json"], envFor(fixture), projectDir);

  expect(enabled.exitCode).toBe(0);
  const withSignals = JSON.parse(await readFile(settingsPath, "utf8"));
  expect(withSignals.hooks.PreToolUse.map((entry: { matcher?: string }) => entry.matcher)).toEqual(["Bash", ".*", "Skill"]);
  expect(withSignals.hooks.PostToolUse.map((entry: { matcher?: string }) => entry.matcher)).toEqual([".*", "Skill"]);
  expect(withSignals.hooks.UserPromptSubmit).toBeDefined();

  projectConfig.hooks = { signals: { enabled: false } };
  await writeFile(configPath, `${JSON.stringify(projectConfig, null, 2)}\n`);
  const disabled = await runAgentsCli(["write", "--json"], envFor(fixture), projectDir);

  expect(disabled.exitCode).toBe(0);
  const withoutSignals = JSON.parse(await readFile(settingsPath, "utf8"));
  expect(withoutSignals.hooks.PreToolUse.map((entry: { matcher?: string }) => entry.matcher)).toEqual(["Bash", ".*"]);
  expect(withoutSignals.hooks.PostToolUse.map((entry: { matcher?: string }) => entry.matcher)).toEqual([".*"]);
  expect(withoutSignals.hooks.UserPromptSubmit).toBeUndefined();
});

test("drwn write honors project hooks.exclude entries", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  expect((await runAgentsCli(["card", "new", "@me/policy", "--no-git"], envFor(fixture))).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "source", "add-hook", "@me/policy", "guard"], envFor(fixture))).exitCode).toBe(0);
  const sourceDir = join(fixture.agentsDir, "drwn", "sources", "@me", "policy");
  await writeFile(join(sourceDir, "hooks", "guard", "policy.ts"), `
    import { defineToolPolicy } from "darwinian/hook-policy";
    export default defineToolPolicy({
      policyKind: "enforcement",
      beforeToolCall() { return { action: "deny", reason: "blocked" }; },
    });
  `);
  expect((await runAgentsCli(["card", "publish", "@me/policy"], envFor(fixture))).exitCode).toBe(0);
  const manifest = JSON.parse(await readFile(join(sourceDir, "card.json"), "utf8"));

  const projectDir = join(fixture.root, "project");
  await installProjectWorkers(projectDir, fixture.agentsDir, [`@me/policy@${manifest.version}`], "@me/policy", {
    hooks: { exclude: ["@me/policy:guard"] },
  });

  const write = await runAgentsCli(["write", "--json"], envFor(fixture), projectDir);

  expect(write.exitCode).toBe(0);
  expect(existsSync(join(projectDir, ".agents", "drwn", "generated", "hooks", "claude", "composer.mjs"))).toBe(false);
  expect(existsSync(join(projectDir, ".claude", "settings.json"))).toBe(false);
  const claudeMcp = JSON.parse(await readFile(join(projectDir, ".mcp.json"), "utf8"));
  expect(claudeMcp.mcpServers.context7).toBeDefined();
});
