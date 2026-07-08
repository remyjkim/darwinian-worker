// ABOUTME: Classifies Mind Card content visibility and Git push safety.
// ABOUTME: Keeps privacy-oriented push gates independent from command plumbing.

import { isAbsolute } from "node:path";
import type { CardManifest, MindContentVisibility } from "../card-manifest";

export type Visibility = MindContentVisibility;
export type RemoteVisibility = Visibility | "unknown";

export interface PushGateInput {
  cardVisibility: Visibility | null;
  remoteVisibility: RemoteVisibility;
  unsafePushPublic: boolean;
}

export interface PushGateResult {
  ok: boolean;
  reason?: string;
  warning?: string;
}

const rank: Record<Visibility, number> = {
  private: 0,
  internal: 1,
  public: 2,
};

export function strictest(visibilities: Visibility[]): Visibility | null {
  if (visibilities.length === 0) {
    return null;
  }
  return visibilities.reduce((current, next) => (rank[next] < rank[current] ? next : current));
}

export function classifyRemoteUrl(url: string): RemoteVisibility {
  if (url.startsWith("file://") || isAbsolute(url) || url.startsWith("./") || url.startsWith("../")) {
    return "private";
  }
  return "unknown";
}

export function cardManifestStrictestVisibility(manifest: CardManifest): Visibility | null {
  const visibilities: Visibility[] = [];
  if ((manifest.persona?.include?.length ?? 0) > 0 && manifest.persona?.visibility) {
    visibilities.push(manifest.persona.visibility);
  }
  if ((manifest.beliefs?.include?.length ?? 0) > 0 && manifest.beliefs?.visibility) {
    visibilities.push(manifest.beliefs.visibility);
  }
  return strictest(visibilities);
}

export function parseRemoteVisibility(value: string): RemoteVisibility {
  if (value === "private" || value === "internal" || value === "public" || value === "unknown") {
    return value;
  }
  throw new Error(`Invalid remote visibility: ${value}. Expected private, internal, public, or unknown.`);
}

export function evaluatePushGate(input: PushGateInput): PushGateResult {
  if (input.cardVisibility === null) {
    return { ok: true };
  }
  if (input.unsafePushPublic) {
    return {
      ok: true,
      warning: `unsafe visibility override: pushing ${input.cardVisibility} mind content to ${input.remoteVisibility} remote`,
    };
  }
  if (input.remoteVisibility === "unknown") {
    return {
      ok: false,
      reason: `remote visibility is unknown for ${input.cardVisibility} mind content; pass --remote-visibility or --unsafe-push-public`,
    };
  }
  if (rank[input.remoteVisibility] > rank[input.cardVisibility]) {
    return {
      ok: false,
      reason: `remote visibility ${input.remoteVisibility} is less restrictive than card visibility ${input.cardVisibility}`,
    };
  }
  return { ok: true };
}
