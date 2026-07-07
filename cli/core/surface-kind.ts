// ABOUTME: Classifies drwn-managed surfaces as projection or merge targets.
// ABOUTME: Follows write-record kind semantics from analysis 97 PD-1.

import type { ManagedPath } from "./write-record";

export type SurfaceKind = "projection" | "merge";

export function surfaceKind(entry: ManagedPath): SurfaceKind {
  if (entry.kind === "managed-fields") {
    return "merge";
  }
  if (entry.kind === "managed-content" || entry.kind === "managed-directory") {
    return "projection";
  }
  return "projection";
}

export function surfaceKindForPath(relPath: string, kind: ManagedPath["kind"]): SurfaceKind {
  return surfaceKind({ path: relPath, kind } as ManagedPath);
}
