// ABOUTME: Resolves a Worker Blueprint ref into a pinned member set + governance for the deploy handoff.
// ABOUTME: CLI-side composition (D-D) so the deployment server materializes a fixed set without resolving composedFrom.

import { resolveProjectCards } from "./card-project";
import type { ResolveCardOptions } from "./card-store";

export interface BlueprintDeployMember {
  name: string;
  version: string;
  integrity: string;
  treeSha?: string;
  requested: string;
}

export interface BlueprintDeployPayload {
  members: BlueprintDeployMember[];
  governance: {
    composedFrom: string[];
    tools?: unknown;
    permissions?: unknown;
    evals?: unknown;
    escalation?: unknown;
    contextMounts?: unknown;
    identity?: unknown;
  };
}

// Returns the pinned members + governance when cardRef resolves to a kind:"blueprint",
// or null for a bare card (degenerate deploy — the server handles the ref as today).
export async function resolveBlueprintDeployPayload(
  agentsDir: string,
  cardRef: string,
  options: ResolveCardOptions = {},
): Promise<BlueprintDeployPayload | null> {
  const locked = await resolveProjectCards(agentsDir, [cardRef], options);
  const top = locked[0];
  if (!top || top.manifest.kind !== "blueprint") {
    return null;
  }
  const members: BlueprintDeployMember[] = locked
    .filter((entry) => entry.manifest.kind !== "blueprint")
    .map((entry) => ({
      name: entry.name,
      version: entry.version,
      integrity: entry.integrity,
      ...(entry.treeSha ? { treeSha: entry.treeSha } : {}),
      requested: entry.requested,
    }));
  const manifest = top.manifest;
  return {
    members,
    governance: {
      composedFrom: manifest.composedFrom ?? [],
      ...(manifest.tools ? { tools: manifest.tools } : {}),
      ...(manifest.permissions ? { permissions: manifest.permissions } : {}),
      ...(manifest.evals ? { evals: manifest.evals } : {}),
      ...(manifest.escalation ? { escalation: manifest.escalation } : {}),
      ...(manifest.contextMounts ? { contextMounts: manifest.contextMounts } : {}),
      ...(manifest.identity ? { identity: manifest.identity } : {}),
    },
  };
}
