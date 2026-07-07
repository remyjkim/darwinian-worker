// ABOUTME: Populates and reconciles committed vendor trees from the machine store.
// ABOUTME: Uses reflink-first file population and normalization-tolerant manifest verification.

import { constants, copyFileSync, existsSync, linkSync, mkdirSync, statSync } from "node:fs";
import { mkdir, readdir, rm, rename } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { computeContentManifest, verifyManifest, type ContentManifest } from "./content-manifest";
import {
  deleteVendorManifestSidecar,
  loadVendorManifestSidecar,
  resolveVendorManifestSidecarPathForVendorDir,
  validateSidecarSelfConsistency,
  verifyVendorTreeAgainstSidecar,
  type VendorManifestSidecar,
} from "./vendor-manifest";
import { splitCardName } from "./store-paths";

export type PopulateMechanism = "reflink" | "hardlink" | "copy";

export type VendorTreeResult =
  | { changed: false; reason: "verified" }
  | { changed: true; reason: "populated" | "repaired" };

export function resolveProjectVendorRoot(projectRoot: string) {
  return join(projectRoot, ".agents", "drwn", "vendor");
}

export function shortTreeSha(treeSha: string) {
  if (!/^[a-f0-9]{40}$/.test(treeSha)) {
    throw new Error(`invalid tree sha: ${treeSha}`);
  }
  return treeSha.slice(0, 12);
}

export function resolveProjectVendorTree(projectRoot: string, name: string, treeSha: string) {
  const parts = splitCardName(name);
  const shortSha = shortTreeSha(treeSha);
  if (parts.length === 1) {
    return join(resolveProjectVendorRoot(projectRoot), parts[0]!, shortSha);
  }
  return join(resolveProjectVendorRoot(projectRoot), parts[0]!, parts[1]!, shortSha);
}

export function populateFile(src: string, dst: string): PopulateMechanism {
  mkdirSync(dirname(dst), { recursive: true });
  try {
    copyFileSync(src, dst, constants.COPYFILE_FICLONE);
    return "reflink";
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOTSUP" && code !== "EXDEV" && code !== "EINVAL") {
      throw error;
    }
  }

  try {
    const srcMode = statSync(src).mode & 0o777;
    if ((srcMode & 0o222) === 0) {
      linkSync(src, dst);
      return "hardlink";
    }
  } catch {
    // fall through to copy
  }

  copyFileSync(src, dst);
  return "copy";
}

async function copyTreeContents(srcDir: string, dstDir: string) {
  await mkdir(dstDir, { recursive: true });
  for (const entry of await readdir(srcDir, { withFileTypes: true })) {
    const srcPath = join(srcDir, entry.name);
    const dstPath = join(dstDir, entry.name);
    if (entry.isDirectory()) {
      await copyTreeContents(srcPath, dstPath);
      continue;
    }
    if (entry.isFile() || entry.isSymbolicLink()) {
      populateFile(srcPath, dstPath);
    }
  }
}

export async function ensureVendorTree(options: {
  projectRoot: string;
  storeDir: string;
  vendorDir: string;
  manifest: ContentManifest;
  hadExistingTree?: boolean;
}): Promise<VendorTreeResult> {
  const { storeDir, vendorDir, manifest } = options;
  const hadExisting = options.hadExistingTree ?? existsSync(vendorDir);
  const current = hadExisting ? await verifyManifest(vendorDir, manifest) : { ok: false, mismatches: [] };
  if (current.ok) {
    return { changed: false, reason: "verified" };
  }

  const vendorRoot = resolveProjectVendorRoot(options.projectRoot);
  const shortSha = basename(vendorDir);
  const tmpDir = join(vendorRoot, `.tmp-${shortSha}-${process.pid}`);
  await rm(tmpDir, { recursive: true, force: true });
  await copyTreeContents(storeDir, tmpDir);

  await rm(vendorDir, { recursive: true, force: true });
  await mkdir(dirname(vendorDir), { recursive: true });
  await rename(tmpDir, vendorDir);

  const verified = await verifyManifest(vendorDir, manifest);
  if (!verified.ok) {
    throw new Error(`vendor tree failed verification after populate: ${vendorDir}`);
  }
  return { changed: true, reason: hadExisting ? "repaired" : "populated" };
}

export type VendorPruneWarning =
  | { kind: "unknown"; vendorDir: string }
  | { kind: "invalid-sidecar"; vendorDir: string }
  | { kind: "drifted"; vendorDir: string };

export async function pruneVendorTrees(options: {
  projectRoot: string;
  vendorRoot: string;
  desired: Set<string>;
}) {
  const preserved: string[] = [];
  const removed: string[] = [];
  const warnings: VendorPruneWarning[] = [];
  if (!existsSync(options.vendorRoot)) {
    return { preserved, removed, warnings };
  }

  async function walk(current: string) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (entry.name.startsWith(".tmp-")) {
        continue;
      }
      const abs = join(current, entry.name);
      if (!entry.isDirectory()) {
        continue;
      }
      if (/^[a-f0-9]{12}$/.test(entry.name)) {
        await pruneOne(abs);
        continue;
      }
      await walk(abs);
    }
  }

  async function pruneOne(vendorDir: string) {
    if (options.desired.has(vendorDir)) {
      return;
    }
    const sidecarPath = resolveVendorManifestSidecarPathForVendorDir(options.projectRoot, vendorDir);
    const sidecar = await loadVendorManifestSidecar(sidecarPath);
    if (!sidecar) {
      preserved.push(vendorDir);
      warnings.push({ kind: "unknown", vendorDir });
      return;
    }
    const consistency = validateSidecarSelfConsistency(sidecar, { projectRoot: options.projectRoot, vendorDir });
    if (!consistency.ok) {
      preserved.push(vendorDir);
      warnings.push({ kind: "invalid-sidecar", vendorDir });
      return;
    }
    const verified = await verifyVendorTreeAgainstSidecar(vendorDir, sidecar);
    if (verified.ok) {
      await rm(vendorDir, { recursive: true, force: true });
      await deleteVendorManifestSidecar(sidecarPath);
      removed.push(vendorDir);
      return;
    }
    preserved.push(vendorDir);
    warnings.push({ kind: "drifted", vendorDir });
  }

  await walk(options.vendorRoot);
  return { preserved, removed, warnings };
}

export async function manifestForStoreDir(storeDir: string) {
  return computeContentManifest(storeDir);
}

export async function loadSidecarForVendorDir(projectRoot: string, vendorDir: string) {
  const path = resolveVendorManifestSidecarPathForVendorDir(projectRoot, vendorDir);
  return loadVendorManifestSidecar(path);
}

export type { VendorManifestSidecar };
