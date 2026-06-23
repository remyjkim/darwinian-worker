// ABOUTME: Integration tests for the `drwn hook` subcommands invoked as real spawned processes.
// ABOUTME: Verifies stdin-driven signal emission, silence, exit 0, and card.lock-less / misconfigured-repo behavior.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAgentsCli } from "./helpers";

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function project(withLock: boolean) {
  const root = mkdtempSync(join(tmpdir(), "drwn-hookcmd-"));
  dirs.push(root);
  if (withLock) {
    const drwnDir = join(root, ".agents", "drwn");
    mkdirSync(drwnDir, { recursive: true });
    writeFileSync(
      join(drwnDir, "card.lock"),
      JSON.stringify({ lockfileVersion: 2, cards: [{ name: "@scope/improve", version: "1.2.3" }] }),
    );
  }
  const sessionId = "sess-x";
  const transcriptPath = join(root, `${sessionId}.jsonl`);
  return { root, sessionId, transcriptPath, sinkPath: join(root, `${sessionId}.drwn-signals.jsonl`) };
}

function readSink(path: string) {
  return readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

// No AGENTS_* env on purpose: hooks must run silently even when the repo root is not a drwn checkout.
const BARE_ENV: Record<string, string> = {};

describe("drwn hook card-usage", () => {
  test("emits a card_usage record from stdin and stays silent, exit 0", async () => {
    const p = project(true);
    const payload = JSON.stringify({
      session_id: p.sessionId,
      transcript_path: p.transcriptPath,
      cwd: p.root,
      hook_event_name: "UserPromptSubmit",
    });

    const result = await runAgentsCli(["hook", "card-usage"], BARE_ENV, p.root, { stdin: payload });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
    const lines = readSink(p.sinkPath);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      type: "card_usage",
      session_id: p.sessionId,
      cards: [{ name: "@scope/improve", version: "1.2.3" }],
    });
  });

  test("skips silently when there is no card.lock", async () => {
    const p = project(false);
    const payload = JSON.stringify({ session_id: p.sessionId, transcript_path: p.transcriptPath, cwd: p.root });
    const result = await runAgentsCli(["hook", "card-usage"], BARE_ENV, p.root, { stdin: payload });
    expect(result.exitCode).toBe(0);
    expect(existsSync(p.sinkPath)).toBe(false);
  });
});

describe("drwn hook skill-marker", () => {
  test("emits skill_invocation for a PreToolUse Skill payload", async () => {
    const p = project(false);
    const payload = JSON.stringify({
      session_id: p.sessionId,
      transcript_path: p.transcriptPath,
      hook_event_name: "PreToolUse",
      tool_name: "Skill",
      tool_use_id: "toolu_42",
      tool_input: { skill: "superpowers:brainstorming" },
    });
    const result = await runAgentsCli(["hook", "skill-marker", "--phase", "pre"], BARE_ENV, p.root, { stdin: payload });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
    const lines = readSink(p.sinkPath);
    expect(lines[0]).toMatchObject({
      type: "skill_invocation",
      tool_use_id: "toolu_42",
      skill: "superpowers:brainstorming",
    });
  });

  test("emits raw slash_expansion for UserPromptExpansion", async () => {
    const p = project(false);
    const payload = JSON.stringify({
      session_id: p.sessionId,
      transcript_path: p.transcriptPath,
      hook_event_name: "UserPromptExpansion",
      command_name: "brainstorming",
      command_source: "plugin",
    });
    const result = await runAgentsCli(["hook", "skill-marker", "--phase", "expansion"], BARE_ENV, p.root, { stdin: payload });
    expect(result.exitCode).toBe(0);
    const lines = readSink(p.sinkPath);
    expect(lines[0]).toMatchObject({ type: "slash_expansion", command_name: "brainstorming" });
    expect(lines[0]).not.toHaveProperty("skill");
  });
});

describe("drwn hook robustness", () => {
  test("malformed stdin → exit 0, no output, no sink written", async () => {
    const p = project(true);
    const result = await runAgentsCli(["hook", "card-usage"], BARE_ENV, p.root, { stdin: "not json {{{" });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
    expect(existsSync(p.sinkPath)).toBe(false);
  });

  test("missing transcript_path → exit 0, no sink", async () => {
    const p = project(true);
    const payload = JSON.stringify({ session_id: p.sessionId, cwd: p.root });
    const result = await runAgentsCli(["hook", "card-usage"], BARE_ENV, p.root, { stdin: payload });
    expect(result.exitCode).toBe(0);
    expect(existsSync(p.sinkPath)).toBe(false);
  });
});
