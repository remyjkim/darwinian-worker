// ABOUTME: Verifies store GC keeps pinned vendor and lock treeShas.
// ABOUTME: Plans pruning of stale extracted directories only.

import { afterEach, expect, test } from "bun:test";
import { mkdir, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { writeVendorManifestSidecar, buildVendorManifestSidecar } from "../cli/core/vendor-manifest";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const tempRoots: string[] = [];
afterEach(async () => cleanupTempRoots(tempRoots));

test("planGc keeps referenced treeSha extractions", async () => {
  const root = await createTempRoot("store-gc-");
  tempRoots.push(root);
  const agentsDir = join(root, "agents");
  const projectRoot = join(root, "project");
  const treeSha = "a".repeat(40);
  await mkdir(join(projectRoot, ".agents", "drwn"), { recursive: true });
  await writeFile(
    join(projectRoot, ".agents", "drwn", "card.lock"),
    `${JSON.stringify({
      lockfileVersion: 5,
      cards: [{ name: "@me/x", requested: "x", version: "1.0.0", path: "/x", integrity: "sha256-x", treeSha, manifest: { name: "@me/x", version: "1.0.0" }, skills: [], hooks: [], registry: null, origin: "store", git: { commit: "b".repeat(40) } }],
    }, null, 2)}\n`,
  );
  await mkdir(join(agentsDir, "drwn", "extracted", treeSha), { recursive: true });
  await mkdir(join(agentsDir, "drwn", "extracted", "c".repeat(40)), { recursive: true });
  const sidecarPath = join(projectRoot, ".agents", "drwn", "vendor-manifests", "@me", "x", `${treeSha.slice(0, 12)}.json`);
  await writeVendorManifestSidecar(
    sidecarPath,
    buildVendorManifestSidecar(
      {
        name: "@me/x",
        requested: "x",
        version: "1.0.0",
        path: "/x",
        integrity: "sha256-x",
        treeSha,
        manifest: { name: "@me/x", version: "1.0.0" },
        skills: [],
        hooks: [],
        registry: null,
        origin: "store",
        git: { commit: "b".repeat(40) },
      },
      { files: [] },
    ),
  );
  const { planGc } = await import("../cli/core/store-gc");
  const plan = await planGc({ agentsDir, projectRoot });
  expect(plan.keep.some((path) => path.endsWith(treeSha))).toBe(true);
  expect(plan.prune.some((path) => path.endsWith("c".repeat(40)))).toBe(true);
});

test("planGc does not keep unknown short vendor shas without sidecars", async () => {
  const root = await createTempRoot("store-gc-unknown-");
  tempRoots.push(root);
  const agentsDir = join(root, "agents");
  const projectRoot = join(root, "project");
  const shortSha = "a".repeat(12);
  await mkdir(join(projectRoot, ".agents", "drwn", "vendor", "@me", "x", shortSha), { recursive: true });
  await mkdir(join(agentsDir, "drwn", "extracted", shortSha), { recursive: true });
  const { planGc } = await import("../cli/core/store-gc");
  const plan = await planGc({ agentsDir, projectRoot });
  expect(plan.keep.some((path) => path.endsWith(shortSha))).toBe(false);
  expect(plan.warnings.some((warning) => warning.includes("unknown vendor short SHA"))).toBe(true);
});

test("planGc honors retentionDays via extraction mtime", async () => {
  const root = await createTempRoot("store-gc-retention-");
  tempRoots.push(root);
  const agentsDir = join(root, "agents");
  const staleSha = "d".repeat(40);
  const stalePath = join(agentsDir, "drwn", "extracted", staleSha);
  await mkdir(stalePath, { recursive: true });
  const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
  await utimes(stalePath, old, old);
  const { planGc } = await import("../cli/core/store-gc");
  const plan = await planGc({ agentsDir, retentionDays: 7 });
  expect(plan.prune.some((path) => path.endsWith(staleSha))).toBe(true);
});
