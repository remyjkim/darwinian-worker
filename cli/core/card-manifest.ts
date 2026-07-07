// ABOUTME: Defines and validates Mind Card manifests.
// ABOUTME: Keeps authoring and consumer commands aligned on schema rules.

import type { ProjectExtensionConfig, ServerOverride, TargetName } from "./types";
import { isTargetName } from "./targets";
import { isStrictSemver, validRange } from "./semver-utils";
import { DrwnError } from "./errors";
import { parseUpstreamRef } from "./git-ref";

export interface CardManifest {
  $schema?: string;
  name: string;
  version: string;
  kind?: "card" | "blueprint";
  description?: string;
  license?: string;
  harness?: { minVersion?: string };
  bundles?: Record<string, string>;
  skills?: { include?: string[]; exclude?: string[]; shared?: string[]; upstream?: Record<string, string> };
  hooks?: { include?: string[]; exclude?: string[]; shared?: string[] };
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

export function isStringRecord(value: unknown): value is Record<string, string> {
  return isObject(value) && Object.values(value).every((entry) => typeof entry === "string");
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
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
  const upstream = manifest.skills?.upstream;
  if (upstream !== undefined) {
    if (!isObject(upstream)) {
      errors.push("skills.upstream must be an object");
    } else {
      const include = new Set(manifest.skills?.include ?? []);
      for (const [key, value] of Object.entries(upstream)) {
        if (!include.has(key)) {
          errors.push(`skills.upstream key ${key} is not listed in skills.include`);
        }
        if (typeof value !== "string" || value.length === 0) {
          errors.push(`skills.upstream.${key} must be a non-empty string`);
          continue;
        }
        try {
          parseUpstreamRef(value);
        } catch (error) {
          const message = error instanceof DrwnError ? error.message : String(error);
          if (error instanceof DrwnError && error.code === "UPSTREAM_LOCAL_PATH_REJECTED") {
            errors.push(`skills.upstream.${key} cannot be a local path`);
          } else {
            errors.push(`skills.upstream.${key} is invalid: ${message}`);
          }
        }
      }
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
  if (manifest.kind !== undefined && manifest.kind !== "card" && manifest.kind !== "blueprint") {
    errors.push("kind must be card or blueprint");
  }
  const record = input as Record<string, unknown>;
  for (const field of ["persona", "beliefs", "memory"] as const) {
    if (record[field] !== undefined) {
      errors.push(
        `${field} is no longer supported; advanced context management (persona/beliefs/memory) moved to a separate capability card`,
      );
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
  for (const [name, server] of Object.entries(manifest.servers ?? {})) {
    const headers = isObject(server) ? (server as Record<string, unknown>).headers : undefined;
    if (headers !== undefined && !isStringRecord(headers)) {
      errors.push(`servers.${name}.headers must be a string-to-string map`);
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
