// ABOUTME: Tests the session-signal hook orchestration (sink append + card-usage write-on-change).
// ABOUTME: Uses a real temp dir for the sink; injects card resolution and the clock.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emitCardUsage, emitSkillMarker } from "../cli/core/hook-runner";

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
});
