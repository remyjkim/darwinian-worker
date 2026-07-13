// ABOUTME: Tests the session-signal hook orchestration (sink append + card-usage write-on-change).
// ABOUTME: Uses a real temp dir for the sink; injects card resolution and the clock.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emitCardUsage, emitSkillMarker, resolveActiveCardsFromLock } from "../cli/core/hook-runner";

const dirs: string[] = [];
function tempTranscript(): { transcriptPath: string; sinkPath: string; sessionId: string } {
  const dir = mkdtempSync(join(tmpdir(), "drwn-hook-"));
  dirs.push(dir);
  const sessionId = "sess1";
  return {
    transcriptPath: join(dir, `${sessionId}.jsonl`),
    sinkPath: join(dir, `${sessionId}.drwn-signals.jsonl`),
    sessionId,
  };
}
function readLines(path: string) {
  return readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("emitSkillMarker", () => {
  test("appends a skill_invocation line to the co-located sink", async () => {
    const t = tempTranscript();
    await emitSkillMarker(
      { session_id: t.sessionId, transcript_path: t.transcriptPath, hook_event_name: "PreToolUse", tool_name: "Skill", tool_use_id: "toolu_1", tool_input: { skill: "x" } },
      "pre",
      { now: () => "2026-06-23T00:00:00.000Z" },
    );
    const lines = readLines(t.sinkPath);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ type: "skill_invocation", tool_use_id: "toolu_1", skill: "x" });
  });

  test("does nothing when transcript_path is absent", async () => {
    await emitSkillMarker({ session_id: "s" }, "post", { now: () => "t" });
    // no throw, nothing to assert beyond not crashing
    expect(true).toBe(true);
  });

  test("no-ops on a partial payload (post without tool_use_id)", async () => {
    const t = tempTranscript();
    await emitSkillMarker({ session_id: t.sessionId, transcript_path: t.transcriptPath, hook_event_name: "PostToolUse", tool_name: "Skill" }, "post", { now: () => "t" });
    expect(existsSync(t.sinkPath)).toBe(false);
  });

  test("concurrent appends all land (append-mode safe)", async () => {
    const t = tempTranscript();
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        emitSkillMarker(
          { session_id: t.sessionId, transcript_path: t.transcriptPath, hook_event_name: "PreToolUse", tool_name: "Skill", tool_use_id: `t${i}` },
          "pre",
          { now: () => "t" },
        ),
      ),
    );
    expect(readLines(t.sinkPath)).toHaveLength(20);
  });

  test("adds active cards to slash expansions when a card lock is available", async () => {
    const t = tempTranscript();
    await emitSkillMarker(
      {
        session_id: t.sessionId,
        transcript_path: t.transcriptPath,
        cwd: "/p",
        hook_event_name: "UserPromptExpansion",
        command_name: "superpowers:verification-before-completion",
        command_source: "plugin",
        command_args: "smoke",
      },
      "expansion",
      {
        now: () => "2026-06-23T00:00:00.000Z",
        resolveActiveCards: async () => [{ name: "@scope/card-beta", version: "2.0.0" }],
      },
    );
    expect(readLines(t.sinkPath)[0]).toMatchObject({
      type: "slash_expansion",
      command_name: "superpowers:verification-before-completion",
      cards: [{ name: "@scope/card-beta", version: "2.0.0" }],
    });
  });

  test("omits cards from slash expansions when no card lock is available", async () => {
    const t = tempTranscript();
    await emitSkillMarker(
      {
        session_id: t.sessionId,
        transcript_path: t.transcriptPath,
        cwd: "/p",
        hook_event_name: "UserPromptExpansion",
        command_name: "superpowers:verification-before-completion",
        command_source: "plugin",
      },
      "expansion",
      {
        now: () => "2026-06-23T00:00:00.000Z",
        resolveActiveCards: async () => null,
      },
    );
    expect(readLines(t.sinkPath)[0]).not.toHaveProperty("cards");
  });
});

describe("emitCardUsage", () => {
  const deps = (cards: { name: string; version: string }[] | null) => ({
    now: () => "2026-06-23T00:00:00.000Z",
    resolveActiveCards: async () => cards,
  });

  test("writes a card_usage line on first prompt", async () => {
    const t = tempTranscript();
    await emitCardUsage({ session_id: t.sessionId, transcript_path: t.transcriptPath, cwd: "/p" }, deps([{ name: "a", version: "1.0.0" }]));
    const lines = readLines(t.sinkPath);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ type: "card_usage", cards: [{ name: "a", version: "1.0.0" }] });
  });

  test("does not append again when the card set is unchanged (write-on-change)", async () => {
    const t = tempTranscript();
    const payload = { session_id: t.sessionId, transcript_path: t.transcriptPath, cwd: "/p" };
    await emitCardUsage(payload, deps([{ name: "a", version: "1.0.0" }]));
    await emitCardUsage(payload, deps([{ name: "a", version: "1.0.0" }]));
    expect(readLines(t.sinkPath)).toHaveLength(1);
  });

  test("appends a new line when the card set changes", async () => {
    const t = tempTranscript();
    const payload = { session_id: t.sessionId, transcript_path: t.transcriptPath, cwd: "/p" };
    await emitCardUsage(payload, deps([{ name: "a", version: "1.0.0" }]));
    await emitCardUsage(payload, deps([{ name: "a", version: "1.0.0" }, { name: "b", version: "2.0.0" }]));
    expect(readLines(t.sinkPath)).toHaveLength(2);
  });

  test("write-on-change ignores interleaved skill records (finds last card_usage)", async () => {
    const t = tempTranscript();
    const payload = { session_id: t.sessionId, transcript_path: t.transcriptPath, cwd: "/p" };
    await emitCardUsage(payload, deps([{ name: "a", version: "1.0.0" }]));
    await emitSkillMarker({ ...payload, hook_event_name: "PreToolUse", tool_name: "Skill", tool_use_id: "t" }, "pre", { now: () => "t" });
    await emitCardUsage(payload, deps([{ name: "a", version: "1.0.0" }]));
    const cardUsage = readLines(t.sinkPath).filter((l) => l.type === "card_usage");
    expect(cardUsage).toHaveLength(1);
  });

  test("skips silently when there is no card.lock (resolveActiveCards → null)", async () => {
    const t = tempTranscript();
    await emitCardUsage({ session_id: t.sessionId, transcript_path: t.transcriptPath, cwd: "/p" }, deps(null));
    expect(existsSync(t.sinkPath)).toBe(false);
  });

  test("skips a prototype card.lock instead of reading it", async () => {
    const root = mkdtempSync(join(tmpdir(), "drwn-hook-prototype-lock-"));
    dirs.push(root);
    const stateDir = join(root, ".agents", "drwn");
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(
      join(stateDir, "card.lock"),
      JSON.stringify({ lockfileVersion: 2, cards: [{ name: "@scope/improve", version: "1.2.3" }] }),
    );

    expect(await resolveActiveCardsFromLock(root)).toBeNull();
  });
});
