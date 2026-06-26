// ABOUTME: Verifies active mind stack selection feeds project projection.
// ABOUTME: Protects explicit activation from implicit all-installed card merging.

import { afterEach, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { buildEffectiveState } from "../cli/core/effective-state";
import { cleanupTempRoots, envFor, publishCardWithSkills, runAgentsCli, scaffoldCliFixture } from "./helpers";

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

test("buildEffectiveState leaves explicitly inactive cards out of projection", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/base", skills: ["alpha"] });
  const projectDir = join(fixture.root, "project");
  const configPath = join(projectDir, ".agents", "drwn", "config.json");
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify({ version: 1, cards: ["@me/base@1.0.0"], activeMinds: [] }, null, 2));

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

test("buildEffectiveState defaults absent activeMinds to all installed cards", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/base", skills: ["alpha"] });
  await publishCardWithSkills(fixture, { name: "@me/overlay", skills: ["beta"] });
  const projectDir = join(fixture.root, "project");
  const configPath = join(projectDir, ".agents", "drwn", "config.json");
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify({ version: 1, cards: ["@me/base@1.0.0", "@me/overlay@1.0.0"] }, null, 2));

  const state = await buildEffectiveState({
    repoRoot: fixture.repoRoot,
    agentsDir: fixture.agentsDir,
    homeDir: fixture.homeDir,
    cwd: projectDir,
  });

  expect(state.lockedCards.map((card) => card.name)).toEqual(["@me/base", "@me/overlay"]);
  expect(state.activeCards.map((card) => card.name)).toEqual(["@me/base", "@me/overlay"]);
  expect(state.skillSelection?.include).toEqual(["alpha", "beta"]);
});

test("active stack order determines materialized MCP precedence end-to-end", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, {
    name: "@me/base",
    skills: ["alpha"],
    servers: { shared: { description: "base", transport: "stdio", command: "base-server", optional: false } },
  });
  await publishCardWithSkills(fixture, {
    name: "@me/overlay",
    skills: ["beta"],
    servers: { shared: { description: "overlay", transport: "stdio", command: "overlay-server", optional: false } },
  });
  const projectDir = join(fixture.root, "project");
  const configPath = join(projectDir, ".agents", "drwn", "config.json");
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify({ version: 1, cards: ["@me/base@1.0.0", "@me/overlay@1.0.0"] }, null, 2));
  expect((await runAgentsCli(["card", "apply", "@me/base@1.0.0", "@me/overlay@1.0.0"], envFor(fixture), projectDir)).exitCode).toBe(0);

  const mcpServerCommand = async () =>
    JSON.parse(await readFile(join(projectDir, ".mcp.json"), "utf8")).mcpServers.shared.command;

  // Stack [base, overlay]: the later layer (overlay) wins the conflicting server.
  expect((await runAgentsCli(["mind", "use", "@me/base", "@me/overlay"], envFor(fixture), projectDir)).exitCode).toBe(0);
  expect((await runAgentsCli(["write", "--json"], envFor(fixture), projectDir)).exitCode).toBe(0);
  expect(await mcpServerCommand()).toBe("overlay-server");

  // Reordering the stack flips precedence end-to-end through the materialized surface.
  expect((await runAgentsCli(["mind", "use", "@me/overlay", "@me/base"], envFor(fixture), projectDir)).exitCode).toBe(0);
  expect((await runAgentsCli(["write", "--json"], envFor(fixture), projectDir)).exitCode).toBe(0);
  expect(await mcpServerCommand()).toBe("base-server");
});
