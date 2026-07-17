// ABOUTME: Pure builders for drwn session-signal records emitted by the hook subcommands.
// ABOUTME: No I/O — given a parsed Claude hook payload, returns the JSON record to append.

import { basename, dirname, join } from "node:path";

export const SIGNAL_SCHEMA_VERSION = 2 as const;

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
  expansion_type?: string;
  prompt?: string; // intentionally never copied into a signal (privacy)
  agent_id?: string;
  agent_type?: string;
}

export interface CardRef {
  name: string;
  version: string;
  /** Content signature from the lock. Optional: v1 stamps predate it. */
  integrity?: string;
}

/** A Worker root, joined to the version and signature of its Card entry. */
export interface WorkerRootRef {
  name: string;
  version: string;
  kind: "card" | "blueprint";
  integrity: string;
}

/** The active Worker graph: the roots a session runs, plus every Card they reach. */
export interface ActiveWorkerGraph {
  cards: CardRef[];
  workerRoots: WorkerRootRef[];
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

export function buildCardUsageRecord(payload: HookPayload, graph: ActiveWorkerGraph, nowIso: string) {
  return {
    schema_version: SIGNAL_SCHEMA_VERSION,
    type: "card_usage",
    hook_event_name: payload.hook_event_name ?? "UserPromptSubmit",
    session_id: payload.session_id,
    ts: nowIso,
    cwd: payload.cwd,
    transcript_basename: transcriptBasename(payload),
    ...agentFields(payload),
    worker_roots: graph.workerRoots,
    cards: graph.cards,
  };
}

/** Build a skill signal, or null when the payload is partial/mismatched (no-op). */
export interface SkillRecordContext {
  cards?: CardRef[];
}

export function buildSkillRecord(payload: HookPayload, phase: SkillPhase, nowIso: string, context: SkillRecordContext = {}) {
  const expectedEvent = PHASE_EVENT[phase];
  // Phase is supplied by the registration; a payload whose event disagrees is a misfire.
  if (payload.hook_event_name && payload.hook_event_name !== expectedEvent) {
    return null;
  }

  const base = {
    schema_version: SIGNAL_SCHEMA_VERSION,
    type: PHASE_TYPE[phase],
    hook_event_name: expectedEvent,
    session_id: payload.session_id,
    ts: nowIso,
    transcript_basename: transcriptBasename(payload),
    ...agentFields(payload),
  };

  if (phase === "expansion") {
    if (!payload.command_name || !payload.command_source) return null;
    return {
      ...base,
      command_name: payload.command_name,
      command_source: payload.command_source,
      ...(payload.command_args !== undefined ? { command_args: payload.command_args } : {}),
      ...(payload.expansion_type ? { expansion_type: payload.expansion_type } : {}),
      ...(context.cards ? { cards: context.cards } : {}),
    };
  }

  // Tool phases require the Skill matcher and the anchor.
  if (payload.tool_name !== "Skill" || !payload.tool_use_id) return null;

  const skillId =
    payload.tool_input && typeof payload.tool_input.skill === "string" ? payload.tool_input.skill : undefined;

  return {
    ...base,
    ...(phase === "pre" && skillId ? { skill: skillId } : {}),
    ...(payload.tool_name ? { tool_name: payload.tool_name } : {}),
    tool_use_id: payload.tool_use_id,
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
  // Integrity is part of the key: a local Card can be edited without its version moving.
  const key = (c: CardRef) => `${c.name}@${c.version}#${c.integrity ?? ""}`;
  const sortedA = [...a].map(key).sort();
  const sortedB = [...b].map(key).sort();
  return sortedA.every((value, index) => value === sortedB[index]);
}
