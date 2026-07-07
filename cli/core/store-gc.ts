// ABOUTME: Computes store GC roots from projects, vendor pins, and local sources.
// ABOUTME: Plans extraction pruning without touching referenced treeShas.

import { existsSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { loadCardLock } from "./card-lock";
import { resolveExtractedRoot } from "./store-paths";
import { resolveProjectVendorRoot } from "./vendor";
import { resolveProjectsIndexPath } from "./project-registry";
import {
  loadVendorManifestSidecar,
  resolveVendorManifestSidecarPathForVendorDir,
  resolveVendorManifestsRoot,
} from "./vendor-manifest";

export async function computeGcRoots(options: {
  agentsDir: string;
  projectRoot?: string | null;
  warnings?: string[];
}) {
  const roots = new Set<string>();
  const warnings = options.warnings ?? [];

  async function addProjectRoots(project: string) {
    roots.add(project);
    const lock = await loadCardLock(project);
    for (const card of lock?.cards ?? []) {
      if (card.treeSha) {
        roots.add(card.treeSha);
      }
    }
    await collectVendorTreeShas(project, roots, warnings);
  }

  if (options.projectRoot) {
    await addProjectRoots(options.projectRoot);
  }

  const indexPath = resolveProjectsIndexPath(options.agentsDir);
  if (existsSync(indexPath)) {
    const index = JSON.parse(await (await import("node:fs/promises")).readFile(indexPath, "utf8")) as {
      projects?: string[];
    };
    for (const project of index.projects ?? []) {
      if (project === options.projectRoot) {
        continue;
      }
      await addProjectRoots(project);
    }
  }
  return roots;
}

async function collectVendorTreeShas(projectRoot: string, roots: Set<string>, warnings: string[]) {
  const manifestsRoot = resolveVendorManifestsRoot(projectRoot);
  if (existsSync(manifestsRoot)) {
    async function walkManifests(current: string) {
      for (const entry of await readdir(current, { withFileTypes: true })) {
        const abs = join(current, entry.name);
        if (entry.isDirectory()) {
          await walkManifests(abs);
          continue;
        }
        if (!entry.name.endsWith(".json")) {
          continue;
        }
        const sidecar = await loadVendorManifestSidecar(abs);
        if (sidecar?.treeSha) {
          roots.add(sidecar.treeSha);
        }
      }
    }
    await walkManifests(manifestsRoot);
  }

  const vendorRoot = resolveProjectVendorRoot(projectRoot);
  if (!existsSync(vendorRoot)) {
    return;
  }

  async function walkVendor(current: string) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const abs = join(current, entry.name);
      if (!entry.isDirectory()) {
        continue;
      }
      if (/^[a-f0-9]{12}$/.test(entry.name)) {
        const sidecarPath = resolveVendorManifestSidecarPathForVendorDir(projectRoot, abs);
        const sidecar = await loadVendorManifestSidecar(sidecarPath);
        if (sidecar?.treeSha) {
          roots.add(sidecar.treeSha);
        } else {
          warnings.push(`unknown vendor short SHA (no sidecar): ${entry.name}`);
        }
        continue;
      }
      await walkVendor(abs);
    }
  }
  await walkVendor(vendorRoot);
}

export async function planGc(options: {
  agentsDir: string;
  projectRoot?: string | null;
  retentionDays?: number;
}) {
  const warnings: string[] = [];
  const keepRoots = await computeGcRoots({ ...options, warnings });
  const extractedRoot = resolveExtractedRoot(options.agentsDir);
  const prune: string[] = [];
  const keep: string[] = [];
  if (!existsSync(extractedRoot)) {
    return { prune, keep, warnings };
  }
  const retentionMs = options.retentionDays ? options.retentionDays * 24 * 60 * 60 * 1000 : null;
  const cutoff = retentionMs ? Date.now() - retentionMs : null;

  for (const entry of await readdir(extractedRoot, { withFileTypes: true })) {
    const abs = join(extractedRoot, entry.name);
    if (entry.name.includes(".tmp.")) {
      prune.push(abs);
      continue;
    }
    if (keepRoots.has(entry.name)) {
      keep.push(abs);
      continue;
    }
    if (!entry.isDirectory()) {
      continue;
    }
    if (cutoff) {
      const mtime = statSync(abs).mtimeMs;
      if (mtime >= cutoff) {
        keep.push(abs);
        continue;
      }
    }
    prune.push(abs);
  }
  return { prune, keep, warnings };
}
