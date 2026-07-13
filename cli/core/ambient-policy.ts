// ABOUTME: Classifies same-ID project and user-home MCP definitions using target-native semantics.
// ABOUTME: Keeps normalized definitions private and returns only redacted provenance and stable policy results.

import { DrwnError } from "./errors";
import type { TargetName } from "./types";

export type AmbientDisposition = "identical" | "warning" | "fatal";

export type AmbientReasonCode =
  | "AMBIENT_IDENTICAL"
  | "CLAUDE_SCOPE_SHADOW"
  | "CODEX_PROJECT_AUGMENTS_USER"
  | "CODEX_INCOMPATIBLE_TRANSPORTS"
  | "CURSOR_PROJECT_MERGES_USER"
  | "CURSOR_PROJECT_TRANSPORT_OVERRIDE";

export type AmbientDefinitionSource = "user" | "project" | "local";
export type AmbientTransport = "stdio" | "http" | "sse" | "ws" | "invalid";

export interface AmbientMcpDefinition {
  target: TargetName;
  id: string;
  source: AmbientDefinitionSource;
  path: string;
  value: unknown;
}

export interface AmbientDefinitionRef {
  source: AmbientDefinitionSource;
  path: string;
  transport: AmbientTransport;
}

export interface AmbientCollision {
  target: TargetName;
  id: string;
  disposition: AmbientDisposition;
  reasonCode: AmbientReasonCode;
  declared: AmbientDefinitionRef;
  ambient: AmbientDefinitionRef;
  remediation: string | null;
}

export interface AmbientCollisionInput {
  declared: AmbientMcpDefinition;
  ambient: AmbientMcpDefinition;
}

export class AmbientMcpCollisionError extends DrwnError {
  constructor(public readonly collisions: AmbientCollision[]) {
    super(
      "AMBIENT_MCP_COLLISION",
      [
        "Ambient MCP preflight found an invalid selected-target configuration:",
        ...collisions.map((entry) =>
          `- ${entry.reasonCode}: ${entry.target}/${entry.id} project ${entry.declared.transport} (${entry.declared.path}) conflicts with ${entry.ambient.source} ${entry.ambient.transport} (${entry.ambient.path})`
        ),
      ].join("\n"),
    );
  }

  override toJSON(): object {
    return { code: this.code, message: this.message, collisions: this.collisions };
  }
}

interface NormalizedDefinition {
  transport: AmbientTransport;
  value: Record<string, unknown>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isEmptyObject(value: unknown): value is Record<string, never> {
  return isObject(value) && Object.keys(value).length === 0;
}

function normalizedTransport(value: Record<string, unknown>): AmbientTransport {
  const hasCommand = typeof value.command === "string";
  const hasUrl = typeof value.url === "string";
  if (("command" in value && !hasCommand) || ("url" in value && !hasUrl) || hasCommand === hasUrl) {
    return "invalid";
  }
  if (hasCommand) {
    return value.type === undefined || value.type === "stdio" ? "stdio" : "invalid";
  }
  if (value.type === undefined || value.type === "http" || value.type === "streamable-http") return "http";
  if (value.type === "sse") return "sse";
  if (value.type === "ws" || value.type === "websocket") return "ws";
  return "invalid";
}

function normalizeJsonDefinition(value: unknown): NormalizedDefinition | null {
  if (!isObject(value)) return null;
  const transport = normalizedTransport(value);
  if (transport === "invalid") return null;
  const normalized: Record<string, unknown> = { ...value, type: transport };
  for (const key of ["args", "env", "headers"] as const) {
    const field = normalized[key];
    if ((Array.isArray(field) && field.length === 0) || isEmptyObject(field)) {
      delete normalized[key];
    }
  }
  return { transport, value: normalized };
}

function normalizeCodexDefinition(value: unknown): NormalizedDefinition | null {
  if (!isObject(value)) return null;
  const transport = normalizedTransport(value);
  if (transport === "invalid") return null;
  return { transport, value: structuredClone(value) };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  );
}

function definitionsEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function deepMerge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const merged = structuredClone(base);
  for (const [key, value] of Object.entries(override)) {
    const current = merged[key];
    merged[key] = isObject(current) && isObject(value)
      ? deepMerge(current, value)
      : structuredClone(value);
  }
  return merged;
}

function reference(definition: AmbientMcpDefinition, transport: AmbientTransport): AmbientDefinitionRef {
  return { source: definition.source, path: definition.path, transport };
}

function collision(
  input: AmbientCollisionInput,
  normalizedDeclared: NormalizedDefinition,
  normalizedAmbient: NormalizedDefinition,
  disposition: AmbientDisposition,
  reasonCode: AmbientReasonCode,
  remediation: string | null,
): AmbientCollision {
  return {
    target: input.declared.target,
    id: input.declared.id,
    disposition,
    reasonCode,
    declared: reference(input.declared, normalizedDeclared.transport),
    ambient: reference(input.ambient, normalizedAmbient.transport),
    remediation,
  };
}

export function classifyAmbientMcpCollision(input: AmbientCollisionInput): AmbientCollision | null {
  if (
    input.declared.target !== input.ambient.target ||
    input.declared.id !== input.ambient.id ||
    input.declared.source !== "project" ||
    input.ambient.source === "project"
  ) {
    return null;
  }

  const target = input.declared.target;
  const normalize = target === "codex" ? normalizeCodexDefinition : normalizeJsonDefinition;
  const declared = normalize(input.declared.value);
  const ambient = normalize(input.ambient.value);
  if (!declared || !ambient) return null;

  if (definitionsEqual(declared.value, ambient.value)) {
    return collision(input, declared, ambient, "identical", "AMBIENT_IDENTICAL", null);
  }

  if (target === "claude") {
    return collision(
      input,
      declared,
      ambient,
      "warning",
      "CLAUDE_SCOPE_SHADOW",
      "Claude selects one whole server entry by scope; align or rename the duplicate if shadowing is unintended.",
    );
  }

  if (target === "codex") {
    const effective = deepMerge(ambient.value, declared.value);
    if (typeof effective.command === "string" && typeof effective.url === "string") {
      return collision(
        input,
        declared,
        ambient,
        "fatal",
        "CODEX_INCOMPATIBLE_TRANSPORTS",
        "Rename one server ID or remove one of the conflicting transport definitions.",
      );
    }
    return collision(
      input,
      declared,
      ambient,
      "warning",
      "CODEX_PROJECT_AUGMENTS_USER",
      "Codex merges same-ID configuration fields; align or rename the duplicate if augmentation is unintended.",
    );
  }

  const transportChanged = declared.transport !== ambient.transport;
  return collision(
    input,
    declared,
    ambient,
    "warning",
    transportChanged ? "CURSOR_PROJECT_TRANSPORT_OVERRIDE" : "CURSOR_PROJECT_MERGES_USER",
    transportChanged
      ? "Cursor selects the project transport while inheriting compatible user fields; align or rename the duplicate if unintended."
      : "Cursor inherits omitted same-ID user fields; align or rename the duplicate if unintended.",
  );
}

const targetOrder: Record<TargetName, number> = { claude: 0, codex: 1, cursor: 2 };
const sourceOrder: Record<AmbientDefinitionSource, number> = { local: 0, project: 1, user: 2 };

export function sortAmbientCollisions(collisions: AmbientCollision[]): AmbientCollision[] {
  return [...collisions].sort((left, right) =>
    targetOrder[left.target] - targetOrder[right.target] ||
    left.id.localeCompare(right.id) ||
    sourceOrder[left.ambient.source] - sourceOrder[right.ambient.source] ||
    left.ambient.path.localeCompare(right.ambient.path)
  );
}

export function classifyAmbientMcpCollisions(inputs: AmbientCollisionInput[]): AmbientCollision[] {
  return sortAmbientCollisions(
    inputs.flatMap((input) => {
      const classified = classifyAmbientMcpCollision(input);
      return classified ? [classified] : [];
    }),
  );
}

export function formatAmbientCollision(collision: AmbientCollision): string {
  const remediation = collision.remediation ? ` ${collision.remediation}` : "";
  return `${collision.reasonCode}: ${collision.target}/${collision.id} project ${collision.declared.transport} (${collision.declared.path}) vs ${collision.ambient.source} ${collision.ambient.transport} (${collision.ambient.path}).${remediation}`;
}
