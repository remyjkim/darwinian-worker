// ABOUTME: Verifies local Worker overlays remain explicit in effective project state.
// ABOUTME: Protects selection, replacement, local-root, and source provenance reporting.

import { afterEach, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { writeCardLock, type CardLockEntry, type WorkerRootLockEntry } from "../cli/core/card-lock";
import { writeCardLockLocal, writeConfigLocal } from "../cli/core/config-local";
import { buildProjectStatusV1 } from "../cli/core/diagnostics";
import { buildEffectiveState } from "../cli/core/effective-state";
import {
  cleanupTempRoots,
  scaffoldCliFixture,
  writeSupportedProjectConfig,
} from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

function card(name: string, path: string, integrity: string): CardLockEntry {
  return {
    name,
    requested: `${name}@1.0.0`,
    version: "1.0.0",
    path,
    integrity,
    manifest: { name, version: "1.0.0" },
    skills: [],
    hooks: [],
    registry: null,
    origin: "file",
  };
}

function root(entry: CardLockEntry): WorkerRootLockEntry {
  return { name: entry.name, requested: entry.requested, kind: "card", members: [] };
}

test("effective state reports every supported local overlay lane with provenance", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectRoot = join(fixture.root, "project");
  const committedPath = join(fixture.root, "cards", "committed");
  const replacementPath = join(fixture.root, "cards", "replacement");
  const localPath = join(fixture.root, "cards", "local");
  await Promise.all([committedPath, replacementPath, localPath].map((path) => mkdir(path, { recursive: true })));

  const committed = card("@me/committed", committedPath, "sha256-committed");
  const replacement = card("@me/committed", replacementPath, "sha256-replacement");
  const localOnly = card("@me/local", localPath, "sha256-local");
  const configPath = await writeSupportedProjectConfig(projectRoot, {
    workers: [committed.requested],
    activeWorker: committed.name,
  });
  await writeCardLock(projectRoot, { workerRoots: [root(committed)], cards: [committed] });
  await writeConfigLocal(projectRoot, {
    schema: "drwn.project-local",
    schemaVersion: 1,
    activeWorker: localOnly.name,
    cardReplacements: { [committed.name]: `file:${replacementPath}` },
    localOnlyRoots: [localOnly.name],
    sourceOverrides: { [committed.name]: `file:${replacementPath}` },
  });
  await writeCardLockLocal(projectRoot, {
    workerRoots: [root(replacement), root(localOnly)],
    cards: [replacement, localOnly],
  });

  const state = await buildEffectiveState({
    repoRoot: fixture.repoRoot,
    agentsDir: fixture.agentsDir,
    homeDir: fixture.homeDir,
    cwd: projectRoot,
  });
  const status = await buildProjectStatusV1({
    repoRoot: fixture.repoRoot,
    agentsDir: fixture.agentsDir,
    homeDir: fixture.homeDir,
    projectConfigPath: configPath,
  });

  expect(state.workerSelection?.selectionSource).toBe("local");
  expect(state.workerSelection?.activeWorker).toBe(localOnly.name);
  expect(state.cardLanes[committed.name]).toBe("localOverlay");
  expect(state.cardLanes[localOnly.name]).toBe("localOverlay");
  expect(status?.selectionSource).toBe("local");
  expect(status?.localOverrides).toEqual({
    activeWorker: localOnly.name,
    cardReplacements: [committed.name],
    localOnlyRoots: [localOnly.name],
    sourceOverrides: [committed.name],
  });
  expect(status?.installedWorkers.map(({ id, sourceKind }) => ({ id, sourceKind }))).toEqual([
    { id: committed.name, sourceKind: "local-overlay" },
    { id: localOnly.name, sourceKind: "local-overlay" },
  ]);
  expect(status?.activeCards.map(({ id, sourceKind }) => ({ id, sourceKind }))).toEqual([
    { id: localOnly.name, sourceKind: "local-overlay" },
  ]);
});
