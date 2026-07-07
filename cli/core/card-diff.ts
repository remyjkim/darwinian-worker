// ABOUTME: Classifies structural differences between two Card manifests.
// ABOUTME: Gives authors deterministic version-bump guidance before publishing.

import type { CardManifest } from "./card-manifest";
import { ALL_TARGET_NAMES } from "./targets";

export type CardDiffClassification = "major" | "minor" | "patch";

export interface CardDiffChange {
  kind: "added" | "removed" | "changed";
  path: string;
  before?: unknown;
  after?: unknown;
}

export interface CardDiffResult {
  classification: CardDiffClassification;
  changes: CardDiffChange[];
}

function sortedValues(values?: string[]) {
  return [...(values ?? [])].sort((a, b) => a.localeCompare(b));
}

function diffStringSet(path: string, beforeValues: string[] | undefined, afterValues: string[] | undefined) {
  const before = new Set(beforeValues ?? []);
  const after = new Set(afterValues ?? []);
  const changes: CardDiffChange[] = [];

  for (const value of [...before].sort((a, b) => a.localeCompare(b))) {
    if (!after.has(value)) {
      changes.push({ kind: "removed", path: `${path}.${value}`, before: value });
    }
  }
  for (const value of [...after].sort((a, b) => a.localeCompare(b))) {
    if (!before.has(value)) {
      changes.push({ kind: "added", path: `${path}.${value}`, after: value });
    }
  }

  return changes;
}

function diffRecordKeys(path: string, beforeRecord?: Record<string, unknown>, afterRecord?: Record<string, unknown>) {
  const before = new Set(Object.keys(beforeRecord ?? {}));
  const after = new Set(Object.keys(afterRecord ?? {}));
  const changes: CardDiffChange[] = [];

  for (const key of [...before].sort((a, b) => a.localeCompare(b))) {
    if (!after.has(key)) {
      changes.push({ kind: "removed", path: `${path}.${key}`, before: beforeRecord?.[key] });
    }
  }
  for (const key of [...after].sort((a, b) => a.localeCompare(b))) {
    if (!before.has(key)) {
      changes.push({ kind: "added", path: `${path}.${key}`, after: afterRecord?.[key] });
    }
  }

  return changes;
}

function diffTargets(before?: CardManifest["targets"], after?: CardManifest["targets"]) {
  const changes: CardDiffChange[] = [];
  for (const target of ALL_TARGET_NAMES) {
    const beforeEnabled = before?.[target]?.enabled;
    const afterEnabled = after?.[target]?.enabled;
    if (beforeEnabled === afterEnabled) {
      continue;
    }
    changes.push({
      kind: beforeEnabled === true && afterEnabled !== true ? "removed" : "added",
      path: `targets.${target}.enabled`,
      before: beforeEnabled,
      after: afterEnabled,
    });
  }
  return changes;
}

export function diffCards(before: CardManifest, after: CardManifest): CardDiffResult {
  const changes: CardDiffChange[] = [
    ...diffStringSet("skills.include", sortedValues(before.skills?.include), sortedValues(after.skills?.include)),
    ...diffStringSet("hooks.include", sortedValues(before.hooks?.include), sortedValues(after.hooks?.include)),
    ...diffStringSet("composedFrom", sortedValues(before.composedFrom), sortedValues(after.composedFrom)),
    ...diffRecordKeys("servers", before.servers, after.servers),
    ...diffRecordKeys("extensions", before.extensions, after.extensions),
    ...diffTargets(before.targets, after.targets),
  ];

  let classification: CardDiffClassification = "patch";
  if (changes.some((change) => change.kind === "removed")) {
    classification = "major";
  } else if (changes.some((change) => change.kind === "added")) {
    classification = "minor";
  }

  return { classification, changes };
}
