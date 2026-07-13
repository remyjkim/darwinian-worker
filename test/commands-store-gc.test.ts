// ABOUTME: Verifies drwn store gc command surfaces planned prune/keep counts.
// ABOUTME: Exercises sidecar-backed vendor root resolution in the GC plan.

import { afterEach, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { writeVendorManifestSidecar, buildVendorManifestSidecar } from "../cli/core/vendor-manifest";
import { cleanupTempRoots, scaffoldCliFixture, runAgentsCli, writeTestCardLock } from "./helpers";

const tempRoots: string[] = [];
afterEach(async () => cleanupTempRoots(tempRoots));

test("store gc dry-run reports keep and prune counts", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectRoot = join(fixture.root, "project");
  const treeSha = "d".repeat(40);
  await mkdir(join(projectRoot, ".agents", "drwn"), { recursive: true });
  const card = {
    name: "@me/gc",
    requested: "@me/gc@1.0.0",
    version: "1.0.0",
    path: "/x",
    integrity: "sha256-x",
    treeSha,
    manifest: { name: "@me/gc", version: "1.0.0" },
    skills: [],
    hooks: [],
    registry: null,
    origin: "store" as const,
    git: { commit: "e".repeat(40) },
  };
  await writeTestCardLock(projectRoot, [card]);
  await mkdir(join(fixture.agentsDir, "drwn", "extracted", treeSha), { recursive: true });
  await mkdir(join(fixture.agentsDir, "drwn", "extracted", "f".repeat(40)), { recursive: true });
  const sidecarPath = join(projectRoot, ".agents", "drwn", "vendor-manifests", "@me", "gc", `${treeSha.slice(0, 12)}.json`);
  await writeVendorManifestSidecar(
    sidecarPath,
    buildVendorManifestSidecar(
      card,
      { files: [] },
    ),
  );

  const result = await runAgentsCli(["store", "gc"], {
    AGENTS_REPO_ROOT: fixture.repoRoot,
    AGENTS_HOME_DIR: fixture.homeDir,
    AGENTS_DIR: fixture.agentsDir,
  }, projectRoot);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toMatch(/GC plan: keep/);
  expect(result.stdout).toMatch(/prune/);
});
