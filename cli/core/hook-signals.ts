// ABOUTME: Pure builders for drwn session-signal records emitted by the hook subcommands.
// ABOUTME: No I/O — given a parsed Claude hook payload, returns the JSON record to append.

import { basename, dirname, join } from "node:path";

export const SIGNAL_SCHEMA_VERSION = 1 as const;

export type SkillPhase = "pre" | "post" | "fail" | "expansion";

export interface HookPayload {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_use_id?: string;
  command_name?: string;
  command_source?: string;
  command_args?: string;
  agent_id?: string;
  agent_type?: string;
}

export interface CardRef {
  name: string;
  version: string;
}

const PHASE_EVENT: Record<SkillPhase, string> = {
  pre: "PreToolUse",
  post: "PostToolUse",
  fail: "PostToolUseFailure",
  expansion: "UserPromptExpansion",
};

const PHASE_TYPE: Record<SkillPhase, string> = {
  pre: "skill_invocation",
  post: "skill_result",
  fail: "skill_failure",
  expansion: "slash_expansion",
};

/** Co-located sidecar path next to the transcript, or null if the payload lacks the keys. */
export function resolveSinkPath(payload: HookPayload): string | null {
  if (!payload.session_id || !payload.transcript_path) {
    return null;
  }
  return join(dirname(payload.transcript_path), `${payload.session_id}.drwn-signals.jsonl`);
}

function agentFields(payload: HookPayload): Record<string, string> {
  const fields: Record<string, string> = {};
  if (payload.agent_id) fields.agent_id = payload.agent_id;
  if (payload.agent_type) fields.agent_type = payload.agent_type;
  return fields;
}

function transcriptBasename(payload: HookPayload): string {
  return payload.transcript_path ? basename(payload.transcript_path) : "";
}

export function buildCardUsageRecord(payload: HookPayload, cards: CardRef[], nowIso: string) {
  return {
    schema_version: SIGNAL_SCHEMA_VERSION,
    type: "card_usage",
    hook_event_name: payload.hook_event_name ?? "UserPromptSubmit",
    session_id: payload.session_id,
    ts: nowIso,
    cwd: payload.cwd,
    transcript_basename: transcriptBasename(payload),
    ...agentFields(payload),
    cards,
  };
}

export function buildSkillRecord(payload: HookPayload, phase: SkillPhase, nowIso: string) {
  const base = {
    schema_version: SIGNAL_SCHEMA_VERSION,
    type: PHASE_TYPE[phase],
    hook_event_name: payload.hook_event_name ?? PHASE_EVENT[phase],
    session_id: payload.session_id,
    ts: nowIso,
    transcript_basename: transcriptBasename(payload),
    ...agentFields(payload),
  };

  if (phase === "expansion") {
    return {
      ...base,
      command_name: payload.command_name,
      command_source: payload.command_source,
      command_args: payload.command_args,
    };
  }

  const skillId =
    payload.tool_input && typeof payload.tool_input.skill === "string" ? payload.tool_input.skill : undefined;

  return {
    ...base,
    ...(phase === "pre" && skillId ? { skill: skillId } : {}),
    ...(payload.tool_name ? { tool_name: payload.tool_name } : {}),
    ...(payload.tool_use_id ? { tool_use_id: payload.tool_use_id } : {}),
  };
}

/** Parse the cards from the LAST `card_usage` line in a (possibly mixed) sink. */
export function parseLastCardUsageCards(sinkText: string): CardRef[] | null {
  const lines = sinkText.split("\n");
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]?.trim();
    if (!line) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (parsed && typeof parsed === "object" && (parsed as { type?: string }).type === "card_usage") {
      const cards = (parsed as { cards?: unknown }).cards;
      return Array.isArray(cards) ? (cards as CardRef[]) : [];
    }
  }
  return null;
}

export function cardsEqual(a: CardRef[], b: CardRef[]): boolean {
  if (a.length !== b.length) return false;
  const key = (c: CardRef) => `${c.name}@${c.version}`;
  const sortedA = [...a].map(key).sort();
  const sortedB = [...b].map(key).sort();
  return sortedA.every((value, index) => value === sortedB[index]);
}
