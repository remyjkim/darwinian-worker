// ABOUTME: Reconciles committed vendor trees against the effective lock-derived desired set.
// ABOUTME: Verifies current trees offline via card.lock integrity; sidecars enable stale prune.

import { existsSync } from "node:fs";
import type { CardLockEntry } from "./card-lock";
import type { EffectiveState } from "./effective-state";
import { ensureExtracted } from "./card-store";
import { resolveCardBareRepoPath } from "./store-paths";
import {
  buildVendorManifestSidecar,
  ensureSidecarForVerifiedVendor,
  verifyStoreDirAgainstLock,
  verifyVendorTreeAgainstLock,
  writeVendorManifestSidecar,
  resolveVendorManifestSidecarPath,
} from "./vendor-manifest";
import {
  ensureVendorTree,
  pruneVendorTrees,
  resolveProjectVendorRoot,
  resolveProjectVendorTree,
} from "./vendor";
import type { SyncResult } from "./types";

function offlineVendorRepairMessage(card: CardLockEntry) {
  return (
    `Cannot repair vendored content for ${card.name}@${card.version}: vendor tree is missing or corrupt and the machine store is unavailable. ` +
    `Restore committed vendor bytes from git, or run drwn card update on a networked machine.`
  );
}

export async function buildDesiredVendorSet(state: EffectiveState) {
  const desired = new Set<string>();
  if (!state.projectRoot) {
    return { desired, entries: [] as CardLockEntry[] };
  }

  const entries: CardLockEntry[] = [];
  for (const card of state.lockedCards) {
    const mode = state.cardModes[card.name];
    if (!mode?.vendorEligible || !card.treeSha) {
      continue;
    }
    const vendorDir = resolveProjectVendorTree(state.projectRoot, card.name, card.treeSha);
    desired.add(vendorDir);
    entries.push(card);
  }
  return { desired, entries };
}

async function reconcileOneVendorCard(
  state: EffectiveState,
  card: CardLockEntry,
  result: SyncResult,
) {
  const projectRoot = state.projectRoot!;
  const vendorDir = resolveProjectVendorTree(projectRoot, card.name, card.treeSha!);
  const verified = await verifyVendorTreeAgainstLock(vendorDir, card.integrity);

  if (verified.ok) {
    await ensureSidecarForVerifiedVendor({ projectRoot, card, manifest: verified.manifest });
    return;
  }

  const barePath = resolveCardBareRepoPath(state.scopedOptions.agentsDir, card.name);
  if (!existsSync(barePath)) {
    throw new Error(offlineVendorRepairMessage(card));
  }

  const storeDir = await ensureExtracted(state.scopedOptions.agentsDir, barePath, card.treeSha!);
  const storeManifest = await verifyStoreDirAgainstLock(storeDir, card.integrity);
  const populate = await ensureVendorTree({
    projectRoot,
    storeDir,
    vendorDir,
    manifest: storeManifest,
    hadExistingTree: verified.reason === "corrupt",
  });
  const sidecarPath = resolveVendorManifestSidecarPath(projectRoot, card.name, card.treeSha!);
  await writeVendorManifestSidecar(sidecarPath, buildVendorManifestSidecar(card, storeManifest));
  if (populate.changed) {
    result.changes.push(`vendor ${vendorDir}`);
  }
}

export async function reconcileVendorTrees(state: EffectiveState, result: SyncResult) {
  if (!state.projectRoot || state.normalized.dryRun) {
    return;
  }
  const { desired, entries } = await buildDesiredVendorSet(state);
  for (const card of entries) {
    await reconcileOneVendorCard(state, card, result);
  }
  const vendorRoot = resolveProjectVendorRoot(state.projectRoot);
  const pruned = await pruneVendorTrees({ projectRoot: state.projectRoot, vendorRoot, desired });
  for (const removed of pruned.removed) {
    result.changes.push(`prune vendor ${removed}`);
  }
  for (const warning of pruned.warnings) {
    if (warning.kind === "unknown") {
      result.warnings.push(`unknown vendor tree (no manifest record): ${warning.vendorDir}`);
    } else if (warning.kind === "invalid-sidecar") {
      result.warnings.push(`invalid vendor manifest sidecar: ${warning.vendorDir}`);
    } else {
      result.warnings.push(`preserved drifted vendor tree: ${warning.vendorDir}`);
    }
  }
}
