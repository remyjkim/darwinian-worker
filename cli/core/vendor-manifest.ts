// ABOUTME: Committed per-tree vendor manifest sidecars for stale prune and store GC.
// ABOUTME: Lives outside vendor content roots; current trees verify via card.lock.integrity.

import { existsSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { CardLockEntry } from "./card-lock";
import {
  computeContentManifest,
  manifestIntegrityDigest,
  verifyManifest,
  type ContentManifest,
} from "./content-manifest";
import { writeAtomically } from "./fs";
import { splitCardName } from "./store-paths";
import { resolveProjectVendorTree, shortTreeSha } from "./vendor";

export type VendorManifestSidecar = {
  card: string;
  treeSha: string;
  integrity: string;
  manifest: ContentManifest;
};

export function resolveVendorManifestsRoot(projectRoot: string) {
  return join(projectRoot, ".agents", "drwn", "vendor-manifests");
}

export function resolveVendorManifestSidecarPath(projectRoot: string, cardName: string, treeSha: string) {
  const parts = splitCardName(cardName);
  const shortSha = shortTreeSha(treeSha);
  const root = resolveVendorManifestsRoot(projectRoot);
  if (parts.length === 1) {
    return join(root, parts[0]!, `${shortSha}.json`);
  }
  return join(root, parts[0]!, parts[1]!, `${shortSha}.json`);
}

export function resolveVendorManifestSidecarPathForVendorDir(projectRoot: string, vendorDir: string) {
  const vendorRoot = join(projectRoot, ".agents", "drwn", "vendor");
  if (!vendorDir.startsWith(vendorRoot)) {
    throw new Error(`vendor dir outside project vendor root: ${vendorDir}`);
  }
  const relative = vendorDir.slice(vendorRoot.length + 1);
  const segments = relative.split("/").filter(Boolean);
  if (segments.length < 2) {
    throw new Error(`invalid vendor dir for sidecar mapping: ${vendorDir}`);
  }
  return join(resolveVendorManifestsRoot(projectRoot), ...segments.slice(0, -1), `${segments.at(-1)!}.json`);
}

export function buildVendorManifestSidecar(card: CardLockEntry, manifest: ContentManifest): VendorManifestSidecar {
  if (!card.treeSha) {
    throw new Error(`card ${card.name} missing treeSha for vendor manifest sidecar`);
  }
  return {
    card: card.name,
    treeSha: card.treeSha,
    integrity: manifestIntegrityDigest(manifest),
    manifest,
  };
}

export function validateSidecarSelfConsistency(
  sidecar: VendorManifestSidecar,
  options: { projectRoot: string; vendorDir: string },
): { ok: true } | { ok: false; reason: string } {
  const shortSha = basename(options.vendorDir);
  if (sidecar.treeSha.slice(0, 12) !== shortSha) {
    return { ok: false, reason: "treeSha prefix does not match vendor directory short sha" };
  }
  if (sidecar.integrity !== manifestIntegrityDigest(sidecar.manifest)) {
    return { ok: false, reason: "integrity does not match manifest digest" };
  }
  const expectedVendor = resolveProjectVendorTree(options.projectRoot, sidecar.card, sidecar.treeSha);
  if (options.vendorDir !== expectedVendor) {
    return { ok: false, reason: "sidecar card path does not match vendor tree path" };
  }
  return { ok: true };
}

export async function loadVendorManifestSidecar(path: string): Promise<VendorManifestSidecar | null> {
  if (!existsSync(path)) {
    return null;
  }
  return JSON.parse(await readFile(path, "utf8")) as VendorManifestSidecar;
}

export async function writeVendorManifestSidecar(path: string, sidecar: VendorManifestSidecar) {
  await mkdir(dirname(path), { recursive: true });
  await writeAtomically(path, `${JSON.stringify(sidecar, null, 2)}\n`);
  return path;
}

export async function deleteVendorManifestSidecar(path: string) {
  await rm(path, { force: true });
}

export async function verifyVendorTreeAgainstLock(vendorDir: string, integrity: string) {
  if (!existsSync(vendorDir)) {
    return { ok: false as const, reason: "missing" as const };
  }
  const manifest = await computeContentManifest(vendorDir);
  const digest = manifestIntegrityDigest(manifest);
  if (digest !== integrity) {
    return { ok: false as const, reason: "corrupt" as const };
  }
  return { ok: true as const, manifest };
}

export async function verifyStoreDirAgainstLock(storeDir: string, integrity: string) {
  const manifest = await computeContentManifest(storeDir);
  const digest = manifestIntegrityDigest(manifest);
  if (digest !== integrity) {
    throw new Error(
      "store content for repair does not match card.lock integrity; re-fetch the card (drwn card update) before re-vendoring",
    );
  }
  return manifest;
}

export async function ensureSidecarForVerifiedVendor(options: {
  projectRoot: string;
  card: CardLockEntry;
  manifest: ContentManifest;
}) {
  const sidecarPath = resolveVendorManifestSidecarPath(options.projectRoot, options.card.name, options.card.treeSha!);
  if (existsSync(sidecarPath)) {
    return sidecarPath;
  }
  return writeVendorManifestSidecar(sidecarPath, buildVendorManifestSidecar(options.card, options.manifest));
}

export async function verifyVendorTreeAgainstSidecar(vendorDir: string, sidecar: VendorManifestSidecar) {
  return verifyManifest(vendorDir, sidecar.manifest);
}
