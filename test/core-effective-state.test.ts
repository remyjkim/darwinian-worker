// ABOUTME: Verifies project effective state excludes machine-only defaults.
// ABOUTME: Protects the cards-era scope boundary for project materialization.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { buildEffectiveState } from "../cli/core/effective-state";
import { cleanupTempRoots, publishCardWithSkills, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

function envFor(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  return {
    AGENTS_REPO_ROOT: fixture.repoRoot,
    AGENTS_HOME_DIR: fixture.homeDir,
    AGENTS_DIR: fixture.agentsDir,
  };
}

test("project write does not include machine default skills", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  expect((await runAgentsCli(["card", "new", "@me/backend", "--no-git"], envFor(fixture))).exitCode).toBe(0);
  const machinePath = join(fixture.agentsDir, "drwn", "machine.json");
  const machine = JSON.parse(await readFile(machinePath, "utf8"));
  machine.defaults = { skills: ["beta"] };
  await writeFile(machinePath, `${JSON.stringify(machine, null, 2)}\n`);
  const projectDir = join(fixture.root, "project");
  const configPath = join(projectDir, ".agents", "drwn", "config.json");
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify({ version: 1, skills: { include: ["alpha"] } }, null, 2));

  const write = await runAgentsCli(["write", "--json"], envFor(fixture), projectDir);

  expect(write.exitCode).toBe(0);
  expect(existsSync(join(projectDir, ".claude", "skills", "alpha"))).toBe(true);
  expect(existsSync(join(projectDir, ".claude", "skills", "beta"))).toBe(false);
});

test("buildEffectiveState exposes the project card, skill, MCP, extension, and target merge", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, {
    name: "@me/base",
    skills: ["card-alpha"],
    servers: {
      "card-server": {
        description: "Card server",
        transport: "stdio",
        command: "card-server",
        optional: false,
      },
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
        cards: ["@me/base@1.0.0"],
        skills: { include: ["beta"] },
        servers: {
          "project-server": {
            description: "Project server",
            transport: "stdio",
            command: "project-server",
            optional: false,
          },
        },
        extensions: { custom: { enabled: true, flavor: "test" } },
        targets: { cursor: { enabled: false } },
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

  expect(state.projectRoot).toBe(projectDir);
  expect(state.lockedCards.map((card) => card.name)).toEqual(["@me/base"]);
  expect(state.skillSelection?.include ?? []).toContain("card-alpha");
  expect(state.skillSelection?.include ?? []).toContain("beta");
  expect(state.activeServers["card-server"]?.command).toBe("card-server");
  expect(state.activeServers["project-server"]?.command).toBe("project-server");
  expect(state.projectConfigWithCards?.extensions?.custom).toEqual({ enabled: true, flavor: "test" });
  expect(state.projectConfigWithCards?.targets?.cursor?.enabled).toBe(false);
  expect(state.scopedOptions.writeScope).toBe("project");
});
