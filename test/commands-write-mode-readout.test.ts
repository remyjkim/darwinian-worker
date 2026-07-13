// ABOUTME: Verifies write emits structured cardModes for linked and overlay cards.
// ABOUTME: Ensures absent-source fallbacks remain warnings, not mode info lines.

import { afterEach, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { writeConfigLocal } from "../cli/core/config-local";
import { buildEffectiveState } from "../cli/core/effective-state";
import { syncRepository } from "../cli/core/sync";
import { renderSyncResult } from "../cli/core/output";
import { cleanupTempRoots, publishCardWithSkills, scaffoldCliFixture, writeTestCardLock } from "./helpers";

const tempRoots: string[] = [];
afterEach(async () => cleanupTempRoots(tempRoots));

test("syncRepository exposes linked/overlay cardModes and keeps absent-source warnings", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/modes", skills: ["alpha"] });
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
  await writeFile(
    join(projectDir, ".agents", "drwn", "config.json"),
    `${JSON.stringify({ version: 1, cards: ["@me/modes@1.0.0"] }, null, 2)}\n`,
  );
  const { resolveCard } = await import("../cli/core/card-store");
  const resolved = await resolveCard(fixture.agentsDir, "@me/modes@1.0.0");
  await writeTestCardLock(projectDir, [
    {
      name: resolved.name,
      requested: "@me/modes@1.0.0",
      version: resolved.version,
      path: resolved.dir,
      integrity: resolved.integrity,
      treeSha: resolved.treeSha!,
      manifest: resolved.manifest,
      skills: ["alpha"],
      hooks: [],
      registry: null,
      origin: resolved.origin,
      ...(resolved.git ? { git: resolved.git } : {}),
    },
  ]);
  const sourceDir = join(fixture.root, "linked-source");
  await mkdir(join(sourceDir, "skills", "alpha"), { recursive: true });
  await writeFile(join(sourceDir, "card.json"), `${JSON.stringify({ name: "@me/modes", version: "1.0.0", skills: { include: ["alpha"] } }, null, 2)}\n`);
  await writeFile(join(sourceDir, "skills", "alpha", "SKILL.md"), "---\nname: alpha\ndescription: alpha\n---\n");
  await writeConfigLocal(projectDir, {
    schema: "drwn.project-local",
    schemaVersion: 1,
    sourceOverrides: { "@me/modes": `file:${sourceDir}` },
  });

  const overlayState = await buildEffectiveState({
    repoRoot: fixture.repoRoot,
    agentsDir: fixture.agentsDir,
    homeDir: fixture.homeDir,
    cwd: projectDir,
  });
  expect(overlayState.cardModes["@me/modes"]?.mode).toBe("overlay");

  const overlayResult = await syncRepository({
    repoRoot: fixture.repoRoot,
    agentsDir: fixture.agentsDir,
    homeDir: fixture.homeDir,
    cwd: projectDir,
    dryRun: true,
    mcpOnly: true,
  });
  expect(overlayResult.cardModes?.["@me/modes"]?.mode).toBe("overlay");
  expect(renderSyncResult(overlayResult)).toContain("Modes:");

  const absentProject = join(fixture.root, "project-absent");
  await mkdir(join(absentProject, ".agents", "drwn"), { recursive: true });
  await writeFile(
    join(absentProject, ".agents", "drwn", "config.json"),
    `${JSON.stringify({ version: 1, materialization: "linked", cards: ["@me/modes@1.0.0"] }, null, 2)}\n`,
  );
  await writeTestCardLock(absentProject, [
    {
      name: resolved.name,
      requested: "@me/modes@1.0.0",
      version: resolved.version,
      path: resolved.dir,
      integrity: resolved.integrity,
      treeSha: resolved.treeSha!,
      manifest: resolved.manifest,
      skills: ["alpha"],
      hooks: [],
      registry: null,
      origin: resolved.origin,
      ...(resolved.git ? { git: resolved.git } : {}),
    },
  ]);
  const absentResult = await syncRepository({
    repoRoot: fixture.repoRoot,
    agentsDir: fixture.agentsDir,
    homeDir: fixture.homeDir,
    cwd: absentProject,
    dryRun: true,
    mcpOnly: true,
  });
  expect(absentResult.cardModes?.["@me/modes"]?.mode).toBe("vendored");
  expect(absentResult.cardModes?.["@me/modes"]?.reason).toMatch(/source absent/i);
  expect(absentResult.warnings.some((warning) => warning.includes("absent"))).toBe(true);

  const vendoredResult = await syncRepository({
    repoRoot: fixture.repoRoot,
    agentsDir: fixture.agentsDir,
    homeDir: fixture.homeDir,
    cwd: projectDir,
    dryRun: true,
    mcpOnly: true,
  });
  expect(vendoredResult.cardModes?.["@me/modes"]?.mode).toBe("overlay");
  expect(renderSyncResult(vendoredResult)).toContain("@me/modes");
});
