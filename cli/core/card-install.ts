// ABOUTME: Ensures locked Cards are present in the local Git-backed store.
// ABOUTME: Supports drwn install bootstrap semantics without command-layer filesystem logic.

import { existsSync } from "node:fs";
import { computeCardIntegrity, ensureExtracted } from "./card-store";
import type { CardLockEntry } from "./card-lock";
import { DrwnError } from "./errors";
import * as git from "./git";
import { assertStoreWritable, resolveCardBareRepoPath } from "./store-paths";
import { resolveProjectVendorTree } from "./vendor";
import { verifyVendorTreeAgainstLock } from "./vendor-manifest";

export async function ensureCardPresentFromLock(
  agentsDir: string,
  entry: CardLockEntry,
  frozen: boolean,
  options: { projectRoot?: string | null } = {},
): Promise<{ changed: boolean }> {
  if (entry.origin === "file") {
    if (!existsSync(entry.path)) {
      throw new DrwnError("CARD_FILE_MISSING", `file-origin card path missing: ${entry.path}`);
    }
    return { changed: false };
  }

  if (entry.origin === "npm") {
    throw new DrwnError("CARD_NPM_NOT_IMPLEMENTED", "npm origin not supported in Wave 1");
  }

  if (!entry.git?.commit) {
    throw new DrwnError("CARD_LOCK_MISSING_COMMIT", `lockfile entry for ${entry.name} missing git.commit`);
  }

  let frozenVendorMissing = false;
  if (frozen && options.projectRoot) {
    if (!entry.treeSha) {
      throw new DrwnError("FROZEN_VIOLATION", `--frozen but ${entry.name} lockfile treeSha would change`);
    }
    const vendorDir = resolveProjectVendorTree(options.projectRoot, entry.name, entry.treeSha);
    const vendor = await verifyVendorTreeAgainstLock(vendorDir, entry.integrity);
    if (vendor.ok) {
      return { changed: false };
    }
    if (vendor.reason === "corrupt") {
      throw new DrwnError(
        "INTEGRITY_MISMATCH",
        `committed vendor tree for ${entry.name}@${entry.version} is corrupt; expected ${entry.integrity}`,
      );
    }
    frozenVendorMissing = true;
  }

  const barePath = resolveCardBareRepoPath(agentsDir, entry.name);
  if (!existsSync(barePath)) {
    if (!entry.git.url) {
      throw new DrwnError("CARD_NO_REMOTE_URL", `cannot fetch ${entry.name}: no URL recorded in lockfile and no local bare repo`);
    }
    if (frozen) {
      throw new DrwnError(
        "FROZEN_VIOLATION",
        frozenVendorMissing
          ? `--frozen but committed vendor tree for ${entry.name} is missing and no local store is available`
          : `--frozen but ${entry.name} requires clone`,
      );
    }
    assertStoreWritable();
    await git.cloneBare(entry.git.url, barePath);
    await git.configSet(barePath, "drwn.cardName", entry.name);
    await git.configSet(barePath, "drwn.originUrl", entry.git.url);
  }

  try {
    await git.revParse(barePath, entry.git.commit);
  } catch (error) {
    if (!entry.git.url) {
      throw error;
    }
    if (frozen) {
      throw new DrwnError("FROZEN_VIOLATION", `--frozen but ${entry.name} requires fetch`);
    }
    assertStoreWritable();
    await git.fetchWithLockRetry(barePath, "origin", ["refs/heads/*:refs/heads/*", "refs/tags/*:refs/tags/*"]);
    await git.revParse(barePath, entry.git.commit);
  }

  const treeSha = await git.getCommitTree(barePath, entry.git.commit);

  if (existsSync(entry.path)) {
    const actual = await computeCardIntegrity(entry.path);
    if (actual === entry.integrity) {
      let changed = false;
      if (!entry.treeSha) {
        if (frozen) {
          throw new DrwnError("FROZEN_VIOLATION", `--frozen but ${entry.name} lockfile treeSha would change`);
        }
        entry.treeSha = treeSha;
        changed = true;
      }
      return { changed };
    }
  }

  const extractedDir = await ensureExtracted(agentsDir, barePath, treeSha);
  const actual = await computeCardIntegrity(extractedDir);
  if (actual !== entry.integrity) {
    throw new DrwnError(
      "INTEGRITY_MISMATCH",
      `integrity mismatch for ${entry.name}@${entry.version}: expected ${entry.integrity}, got ${actual}`,
    );
  }
  let changed = false;
  if (!entry.treeSha) {
    if (frozen) {
      throw new DrwnError("FROZEN_VIOLATION", `--frozen but ${entry.name} lockfile treeSha would change`);
    }
    entry.treeSha = treeSha;
    changed = true;
  }
  if (entry.path !== extractedDir) {
    if (frozen) {
      throw new DrwnError("FROZEN_VIOLATION", `--frozen but ${entry.name} lockfile path would change`);
    }
    entry.path = extractedDir;
    changed = true;
  }
  return { changed };
}
