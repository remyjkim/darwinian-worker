// ABOUTME: Verifies active mind stack selection feeds project projection.
// ABOUTME: Protects explicit activation from implicit all-installed card merging.

import { afterEach, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { buildEffectiveState } from "../cli/core/effective-state";
import { cleanupTempRoots, publishCardWithSkills, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("buildEffectiveState projects only the ordered active mind stack", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, {
    name: "@me/base",
    skills: ["alpha"],
    servers: {
      shared: { description: "base", transport: "stdio", command: "base-server", optional: false },
    },
  });
  await publishCardWithSkills(fixture, {
    name: "@me/overlay",
    skills: ["beta"],
    servers: {
      shared: { description: "overlay", transport: "stdio", command: "overlay-server", optional: false },
    },
  });
  const projectDir = join(fixture.root, "project");
  const configPath = join(projectDir, ".agents", "drwn", "config.json");
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(
    configPath,
    JSON.stringify(
      {
        version: 1,
        cards: ["@me/base@1.0.0", "@me/overlay@1.0.0"],
        activeMinds: ["@me/base", "@me/overlay"],
      },
      null,
      2,
    ),
  );

  const state = await buildEffectiveState({
    repoRoot: fixture.repoRoot,
    agentsDir: fixture.agentsDir,
    homeDir: fixture.homeDir,
    cwd: projectDir,
  });

  expect(state.lockedCards.map((card) => card.name).sort()).toEqual(["@me/base", "@me/overlay"]);
  expect(state.activeCards.map((card) => card.name)).toEqual(["@me/base", "@me/overlay"]);
  expect(state.skillSelection?.include).toEqual(["alpha", "beta"]);
  expect(state.activeServers.shared?.command).toBe("overlay-server");
});

test("buildEffectiveState leaves installed but inactive cards out of projection", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/base", skills: ["alpha"] });
  const projectDir = join(fixture.root, "project");
  const configPath = join(projectDir, ".agents", "drwn", "config.json");
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify({ version: 1, cards: ["@me/base@1.0.0"] }, null, 2));

  const state = await buildEffectiveState({
    repoRoot: fixture.repoRoot,
    agentsDir: fixture.agentsDir,
    homeDir: fixture.homeDir,
    cwd: projectDir,
  });

  expect(state.lockedCards.map((card) => card.name)).toEqual(["@me/base"]);
  expect(state.activeCards).toEqual([]);
  expect(state.skillSelection?.include ?? []).not.toContain("alpha");
});
