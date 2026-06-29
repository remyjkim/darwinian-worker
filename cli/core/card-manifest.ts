// ABOUTME: Defines and validates Mind Card manifests.
// ABOUTME: Keeps authoring and consumer commands aligned on schema rules.

import type { ProjectExtensionConfig, ServerOverride, TargetName } from "./types";
import { isTargetName } from "./targets";
import { isStrictSemver, validRange } from "./semver-utils";
import { isSafePathPart } from "./store-paths";

export type MindContentVisibility = "private" | "internal" | "public";
export type MemoryLayerName = "l4" | "l5" | "l6";
export type MemoryFormat = "md" | "jsonl" | "mixed";

export interface MindContentManifest {
  include?: string[];
  visibility?: MindContentVisibility;
  exclude?: string[];
  shared?: string[];
}

export type PersonaManifest = MindContentManifest;
export type BeliefsManifest = MindContentManifest;

export interface MemoryLayerManifest extends MindContentManifest {
  format?: MemoryFormat;
}

export type MemoryManifest = Partial<Record<MemoryLayerName, MemoryLayerManifest>>;

export interface CardManifest {
  $schema?: string;
  name: string;
  version: string;
  description?: string;
  license?: string;
  harness?: { minVersion?: string };
  bundles?: Record<string, string>;
  skills?: { include?: string[]; exclude?: string[]; shared?: string[] };
  hooks?: { include?: string[]; exclude?: string[]; shared?: string[] };
  persona?: PersonaManifest;
  beliefs?: BeliefsManifest;
  memory?: MemoryManifest;
  servers?: Record<string, ServerOverride>;
  extensions?: Record<string, ProjectExtensionConfig>;
  targets?: Partial<Record<TargetName, { enabled: boolean }>>;
  stability?: "experimental" | "stable" | "production";
  lastValidatedWith?: string;
  testStatusBadge?: string;
}

export interface CardManifestValidationResult {
  ok: boolean;
  errors: string[];
}

export function isCardScopeName(name: string) {
  return /^@[a-z0-9-]+\/[a-z0-9-]+$/.test(name);
}

export function isCardUnscopedName(name: string) {
  return /^[a-z0-9-]+$/.test(name);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function validateMindContentSection(
  label: string,
  input: unknown,
  errors: string[],
  options: { allowFormat?: boolean } = {},
) {
  if (input === undefined) {
    return;
  }
  if (!isObject(input)) {
    errors.push(`${label} must be an object`);
    return;
  }
  if (input.exclude !== undefined) {
    errors.push(`${label}.exclude is not allowed in card manifests`);
  }
  if (input.shared !== undefined) {
    errors.push(`${label}.shared is not allowed in card manifests`);
  }
  const include = input.include;
  if (include !== undefined && !Array.isArray(include)) {
    errors.push(`${label}.include must be an array`);
  }
  if (Array.isArray(include)) {
    for (const entry of include) {
      if (typeof entry !== "string" || !isSafePathPart(entry)) {
        errors.push(`${label}.include contains invalid entry: ${String(entry)}`);
      }
    }
    if (include.length > 0 && input.visibility === undefined) {
      errors.push(`${label}.visibility is required when include is non-empty`);
    }
  }
  if (
    input.visibility !== undefined &&
    (typeof input.visibility !== "string" || !["private", "internal", "public"].includes(input.visibility))
  ) {
    errors.push(`${label}.visibility must be private, internal, or public`);
  }
  if (options.allowFormat) {
    if (input.format !== undefined && (typeof input.format !== "string" || !["md", "jsonl", "mixed"].includes(input.format))) {
      errors.push(`${label}.format must be md, jsonl, or mixed`);
    }
  } else if (input.format !== undefined) {
    errors.push(`${label}.format is not allowed in card manifests`);
  }
}

export function validateCardManifest(input: unknown): CardManifestValidationResult {
  const errors: string[] = [];
  if (!isObject(input)) {
    return { ok: false, errors: ["manifest must be an object"] };
  }
  const manifest = input as Partial<CardManifest>;
  if (!manifest.name || typeof manifest.name !== "string") {
    errors.push("name is required");
  } else if (!isCardScopeName(manifest.name) && !isCardUnscopedName(manifest.name)) {
    errors.push("name must be @scope/name or name");
  }
  if (!manifest.version || typeof manifest.version !== "string") {
    errors.push("version is required");
  } else if (!isStrictSemver(manifest.version)) {
    errors.push("version must be strict semver");
  }
  if (manifest.harness?.minVersion && !isStrictSemver(manifest.harness.minVersion)) {
    errors.push("harness.minVersion must be strict semver");
  }
  if (
    manifest.stability !== undefined &&
    (typeof manifest.stability !== "string" || !["experimental", "stable", "production"].includes(manifest.stability))
  ) {
    errors.push("stability must be experimental, stable, or production");
  }
  if (manifest.lastValidatedWith !== undefined) {
    if (typeof manifest.lastValidatedWith !== "string" || !isStrictSemver(manifest.lastValidatedWith)) {
      errors.push("lastValidatedWith must be strict semver");
    }
  }
  if (manifest.testStatusBadge !== undefined) {
    if (typeof manifest.testStatusBadge !== "string" || !isHttpUrl(manifest.testStatusBadge)) {
      errors.push("testStatusBadge must be an http(s) URL");
    }
  }
  if (manifest.skills?.exclude) {
    errors.push("skills.exclude is not allowed in card manifests");
  }
  if (manifest.skills?.include && !Array.isArray(manifest.skills.include)) {
    errors.push("skills.include must be an array");
  }
  if (manifest.skills?.shared !== undefined) {
    if (!Array.isArray(manifest.skills.shared)) {
      errors.push("skills.shared must be an array");
    } else if (manifest.skills.shared.length > 0) {
      errors.push("skills.shared is reserved for Wave 2 (registry references). Wave 1 supports only bundled skills.");
    }
  }
  if (manifest.hooks?.exclude) {
    errors.push("hooks.exclude is not allowed in card manifests");
  }
  if (manifest.hooks?.shared) {
    errors.push("hooks.shared is not allowed in card manifests");
  }
  if (manifest.hooks?.include && !Array.isArray(manifest.hooks.include)) {
    errors.push("hooks.include must be an array");
  }
  validateMindContentSection("persona", (input as Record<string, unknown>).persona, errors);
  validateMindContentSection("beliefs", (input as Record<string, unknown>).beliefs, errors);
  const memory = (input as Record<string, unknown>).memory;
  if (memory !== undefined) {
    if (!isObject(memory)) {
      errors.push("memory must be an object");
    } else {
      for (const [layer, section] of Object.entries(memory)) {
        if (layer !== "l4" && layer !== "l5" && layer !== "l6") {
          errors.push(`unsupported memory layer: ${layer}`);
          continue;
        }
        validateMindContentSection(`memory.${layer}`, section, errors, { allowFormat: true });
      }
    }
  }
  for (const [bundle, range] of Object.entries(manifest.bundles ?? {})) {
    if (!bundle || typeof range !== "string" || !validRange(range)) {
      errors.push(`invalid bundle range for ${bundle}`);
    }
  }
  for (const target of Object.keys(manifest.targets ?? {})) {
    if (!isTargetName(target)) {
      errors.push(`unsupported target: ${target}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function assertValidCardManifest(input: unknown): asserts input is CardManifest {
  const result = validateCardManifest(input);
  if (!result.ok) {
    throw new Error(result.errors.join("; "));
  }
}
