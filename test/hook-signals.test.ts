// ABOUTME: Unit tests for the pure session-signal builders used by the drwn hook subcommands.
// ABOUTME: Covers sink resolution, record shapes per skill phase, and card-usage write-on-change parsing.

import { describe, expect, test } from "bun:test";
import {
  SIGNAL_SCHEMA_VERSION,
  buildCardUsageRecord,
  buildSkillRecord,
  cardsEqual,
  parseLastCardUsageCards,
  resolveSinkPath,
} from "../cli/core/hook-signals";

const NOW = "2026-06-23T12:00:00.000Z";

describe("resolveSinkPath", () => {
  test("returns a sidecar co-located with the transcript", () => {
    const path = resolveSinkPath({
      session_id: "abc",
      transcript_path: "/home/u/.claude/projects/slug/abc.jsonl",
    });
    expect(path).toBe("/home/u/.claude/projects/slug/abc.drwn-signals.jsonl");
  });

  test("returns null without transcript_path", () => {
    expect(resolveSinkPath({ session_id: "abc" })).toBeNull();
  });

  test("returns null without session_id", () => {
    expect(resolveSinkPath({ transcript_path: "/x/abc.jsonl" })).toBeNull();
  });
});

describe("buildCardUsageRecord", () => {
  test("builds a card_usage record with resolved cards", () => {
    const record = buildCardUsageRecord(
      { session_id: "abc", transcript_path: "/x/abc.jsonl", cwd: "/proj", hook_event_name: "UserPromptSubmit" },
      [{ name: "@scope/improve", version: "1.2.3" }],
      NOW,
    );
    expect(record).toEqual({
      schema_version: SIGNAL_SCHEMA_VERSION,
      type: "card_usage",
      hook_event_name: "UserPromptSubmit",
      session_id: "abc",
      ts: NOW,
      cwd: "/proj",
      transcript_basename: "abc.jsonl",
      cards: [{ name: "@scope/improve", version: "1.2.3" }],
    });
  });
});

describe("buildSkillRecord", () => {
  test("pre → skill_invocation with skill, tool_name, tool_use_id", () => {
    const record = buildSkillRecord(
      {
        session_id: "abc",
        transcript_path: "/x/abc.jsonl",
        hook_event_name: "PreToolUse",
        tool_name: "Skill",
        tool_use_id: "toolu_1",
        tool_input: { skill: "superpowers:brainstorming" },
      },
      "pre",
      NOW,
    );
    expect(record).toEqual({
      schema_version: SIGNAL_SCHEMA_VERSION,
      type: "skill_invocation",
      hook_event_name: "PreToolUse",
      session_id: "abc",
      ts: NOW,
      transcript_basename: "abc.jsonl",
      skill: "superpowers:brainstorming",
      tool_name: "Skill",
      tool_use_id: "toolu_1",
    });
  });

  test("post → skill_result (pure flag)", () => {
    const record = buildSkillRecord(
      { session_id: "abc", transcript_path: "/x/abc.jsonl", hook_event_name: "PostToolUse", tool_name: "Skill", tool_use_id: "toolu_1" },
      "post",
      NOW,
    );
    expect(record).toMatchObject({ type: "skill_result", tool_use_id: "toolu_1", tool_name: "Skill" });
    expect(record).not.toHaveProperty("skill");
  });

  test("fail → skill_failure", () => {
    const record = buildSkillRecord(
      { session_id: "abc", transcript_path: "/x/abc.jsonl", hook_event_name: "PostToolUseFailure", tool_name: "Skill", tool_use_id: "toolu_1" },
      "fail",
      NOW,
    );
    expect(record).toMatchObject({ type: "skill_failure", tool_use_id: "toolu_1" });
  });

  test("expansion → raw slash_expansion (no drwn-derived skill)", () => {
    const record = buildSkillRecord(
      {
        session_id: "abc",
        transcript_path: "/x/abc.jsonl",
        hook_event_name: "UserPromptExpansion",
        command_name: "brainstorming",
        command_source: "plugin",
        command_args: "foo",
      },
      "expansion",
      NOW,
    );
    expect(record).toEqual({
      schema_version: SIGNAL_SCHEMA_VERSION,
      type: "slash_expansion",
      hook_event_name: "UserPromptExpansion",
      session_id: "abc",
      ts: NOW,
      transcript_basename: "abc.jsonl",
      command_name: "brainstorming",
      command_source: "plugin",
      command_args: "foo",
    });
    expect(record).not.toHaveProperty("skill");
  });

  test("includes agent_id/agent_type only when present", () => {
    const withAgent = buildSkillRecord(
      { session_id: "abc", transcript_path: "/x/abc.jsonl", hook_event_name: "PreToolUse", tool_name: "Skill", tool_use_id: "t", agent_id: "ag1", agent_type: "Explore" },
      "pre",
      NOW,
    );
    expect(withAgent).toMatchObject({ agent_id: "ag1", agent_type: "Explore" });

    const withoutAgent = buildSkillRecord(
      { session_id: "abc", transcript_path: "/x/abc.jsonl", hook_event_name: "PreToolUse", tool_name: "Skill", tool_use_id: "t" },
      "pre",
      NOW,
    );
    expect(withoutAgent).not.toHaveProperty("agent_id");
    expect(withoutAgent).not.toHaveProperty("agent_type");
  });
});

describe("parseLastCardUsageCards", () => {
  test("returns the cards from the last card_usage line in a mixed sink", () => {
    const sink = [
      JSON.stringify({ type: "card_usage", cards: [{ name: "a", version: "1.0.0" }] }),
      JSON.stringify({ type: "skill_invocation", tool_use_id: "t1" }),
      JSON.stringify({ type: "card_usage", cards: [{ name: "a", version: "1.0.0" }, { name: "b", version: "2.0.0" }] }),
      JSON.stringify({ type: "skill_result", tool_use_id: "t1" }),
    ].join("\n") + "\n";
    expect(parseLastCardUsageCards(sink)).toEqual([
      { name: "a", version: "1.0.0" },
      { name: "b", version: "2.0.0" },
    ]);
  });

  test("returns null when there is no card_usage line", () => {
    const sink = JSON.stringify({ type: "skill_invocation", tool_use_id: "t1" }) + "\n";
    expect(parseLastCardUsageCards(sink)).toBeNull();
  });

  test("returns null for empty input", () => {
    expect(parseLastCardUsageCards("")).toBeNull();
  });
});

describe("cardsEqual", () => {
  test("is order-insensitive", () => {
    expect(
      cardsEqual(
        [{ name: "a", version: "1.0.0" }, { name: "b", version: "2.0.0" }],
        [{ name: "b", version: "2.0.0" }, { name: "a", version: "1.0.0" }],
      ),
    ).toBe(true);
  });

  test("detects a version change", () => {
    expect(
      cardsEqual([{ name: "a", version: "1.0.0" }], [{ name: "a", version: "1.0.1" }]),
    ).toBe(false);
  });
});
