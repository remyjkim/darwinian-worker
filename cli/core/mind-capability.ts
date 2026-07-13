// ABOUTME: Defines the one predicate for optional Worker Mind capability.
// ABOUTME: Computes the lock and deploy version floor from complete Card closures.

import type { CardManifest } from "./card-manifest";

export const PROJECT_WORKER_MIN_DRWN_VERSION = "0.8.0";
export const WORKER_MIND_MIN_DRWN_VERSION = "0.9.0";

export function cardDeclaresMind(manifest: CardManifest): boolean {
  return (
    (manifest.persona?.include?.length ?? 0) > 0
    || (manifest.beliefs?.include?.length ?? 0) > 0
    || manifest.memory?.observations !== undefined
    || manifest.memory?.insights !== undefined
  );
}

export function minimumDrwnVersionForManifests(manifests: Iterable<CardManifest>): string {
  for (const manifest of manifests) {
    if (cardDeclaresMind(manifest)) return WORKER_MIND_MIN_DRWN_VERSION;
  }
  return PROJECT_WORKER_MIN_DRWN_VERSION;
}
