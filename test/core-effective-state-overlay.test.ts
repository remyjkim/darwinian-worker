// ABOUTME: Verifies card.lock.local overlay lane merge and local-wins semantics.
// ABOUTME: Ensures local-only cards stay out of the vendored desired set.

import { afterEach, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { writeCardLock } from "../cli/core/card-lock";
import { writeCardLockLocal } from "../cli/core/config-local";
import { buildEffectiveState } from "../cli/core/effective-state";
import { resolveCard } from "../cli/core/card-store";
import { buildDesiredVendorSet } from "../cli/core/vendor-reconcile";
import { cleanupTempRoots, publishCardWithSkills, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

function envFor(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  return {
    repoRoot: fixture.repoRoot,
    agentsDir: fixture.agentsDir,
    homeDir: fixture.homeDir,
  };
}

async function scaffoldProject(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>, config: Record<string, unknown>) {
  const projectDir = join(fixture.root, "project");
  const configPath = join(projectDir, ".agents", "drwn", "config.json");
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return projectDir;
}

test("local-only card enters lockedCards as overlay and is absent from DESIRED_VENDOR", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/personal", skills: ["solo"] });
  const resolved = await resolveCard(fixture.agentsDir, "@me/personal@1.0.0");
  const projectDir = await scaffoldProject(fixture, { version: 1, skills: { include: ["solo"] } });

  await writeCardLockLocal(projectDir, [
    {
      name: resolved.name,
      requested: "@me/personal@1.0.0",
      version: resolved.version,
      path: resolved.dir,
      integrity: resolved.integrity,
      treeSha: resolved.treeSha!,
      manifest: resolved.manifest,
      skills: ["solo"],
      hooks: [],
      registry: null,
      origin: "store",
      git: resolved.git!,
    },
  ]);

  const state = await buildEffectiveState({ ...envFor(fixture), cwd: projectDir });
  expect(state.lockedCards.map((card) => card.name)).toEqual(["@me/personal"]);
  expect(state.cardLanes["@me/personal"]).toBe("localOverlay");
  expect(state.cardModes["@me/personal"]?.mode).toBe("overlay");
  expect(state.cardModes["@me/personal"]?.vendorEligible).toBe(false);
  expect(state.vendorEligible.has("@me/personal")).toBe(false);
  expect(state.contentRootsByCard["@me/personal"]).toBe(resolved.dir);

  const desired = await buildDesiredVendorSet(state);
  expect(desired.entries).toHaveLength(0);
});

test("name collision: card.lock.local wins with warning", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/shared", skills: ["alpha"] });
  const resolved = await resolveCard(fixture.agentsDir, "@me/shared@1.0.0");
  const projectDir = await scaffoldProject(fixture, {
    version: 1,
    cards: ["@me/shared@1.0.0"],
    activeWorkers: ["@me/shared"],
  });

  await writeCardLock(projectDir, [
    {
      name: resolved.name,
      requested: "@me/shared@1.0.0",
      version: resolved.version,
      path: resolved.dir,
      integrity: resolved.integrity,
      treeSha: resolved.treeSha!,
      manifest: resolved.manifest,
      skills: ["alpha"],
      hooks: [],
      registry: null,
      origin: "store",
      git: resolved.git!,
    },
  ]);

  const localPath = join(fixture.agentsDir, "drwn", "extracted", "b".repeat(40));
  await writeCardLockLocal(projectDir, [
    {
      ...resolved,
      path: localPath,
      treeSha: "b".repeat(40),
      requested: "@me/shared@1.0.0",
      skills: ["alpha"],
      hooks: [],
      registry: null,
      origin: "store",
      git: resolved.git!,
    },
  ]);

  const state = await buildEffectiveState({ ...envFor(fixture), cwd: projectDir });
  expect(state.lockedCards).toHaveLength(1);
  expect(state.lockedCards[0]?.path).toBe(localPath);
  expect(state.cardLanes["@me/shared"]).toBe("localOverlay");
  expect(state.overlayWarnings.some((warning) => warning.includes("card.lock.local overrides"))).toBe(true);
  expect(state.vendorEligible.has("@me/shared")).toBe(false);
});

test("config.local activate overrides committed active stack", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/one", skills: ["one"] });
  await publishCardWithSkills(fixture, { name: "@me/two", skills: ["two"] });
  const one = await resolveCard(fixture.agentsDir, "@me/one@1.0.0");
  const two = await resolveCard(fixture.agentsDir, "@me/two@1.0.0");
  const projectDir = await scaffoldProject(fixture, {
    version: 1,
    cards: ["@me/one@1.0.0", "@me/two@1.0.0"],
    activeWorkers: ["@me/one"],
  });

  await writeCardLock(projectDir, [
    {
      name: one.name,
      requested: "@me/one@1.0.0",
      version: one.version,
      path: one.dir,
      integrity: one.integrity,
      treeSha: one.treeSha!,
      manifest: one.manifest,
      skills: ["one"],
      hooks: [],
      registry: null,
      origin: "store",
      git: one.git!,
    },
    {
      name: two.name,
      requested: "@me/two@1.0.0",
      version: two.version,
      path: two.dir,
      integrity: two.integrity,
      treeSha: two.treeSha!,
      manifest: two.manifest,
      skills: ["two"],
      hooks: [],
      registry: null,
      origin: "store",
      git: two.git!,
    },
  ]);

  const { writeConfigLocal } = await import("../cli/core/config-local");
  await writeConfigLocal(projectDir, {
    schema: "drwn.project-local",
    schemaVersion: 1,
    activeWorker: "@me/two",
  });

  const state = await buildEffectiveState({ ...envFor(fixture), cwd: projectDir });
  expect(state.activeCards.map((card) => card.name)).toEqual(["@me/two"]);
  expect(state.cardLanes["@me/one"]).toBe("committed");
  expect(state.cardLanes["@me/two"]).toBe("committed");
  expect(state.vendorEligible.has("@me/one")).toBe(true);
  expect(state.vendorEligible.has("@me/two")).toBe(true);
});
