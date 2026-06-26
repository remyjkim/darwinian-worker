// ABOUTME: Verifies project-side card consumption commands and lockfile updates.
// ABOUTME: Protects the user workflow for applying, updating, and removing cards.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { cleanupTempRoots, envFor, publishCardWithSkills, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function publishCard(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>, name = "@me/backend", version = "1.0.0") {
  await publishCardWithSkills(fixture, { name, version, skills: ["alpha"] });
}

async function publishCardWithHook(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  const sourceDir = join(fixture.agentsDir, "drwn", "sources", "@me", "policy");
  await publishCardWithSkills(fixture, { name: "@me/policy", version: "1.0.0", skills: [] });
  const manifestPath = join(sourceDir, "card.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.version = "1.1.0";
  manifest.hooks = { include: ["audit"] };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await mkdir(join(sourceDir, "hooks", "audit"), { recursive: true });
  await writeFile(join(sourceDir, "hooks", "audit", "policy.ts"), "export default { policyKind: 'observer' };\n");
  expect((await runAgentsCli(["card", "publish", "@me/policy"], envFor(fixture))).exitCode).toBe(0);
}

test("card apply replaces project cards and writes a lockfile", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCard(fixture);
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
  await writeFile(join(projectDir, ".agents", "drwn", "config.json"), JSON.stringify({ version: 1 }, null, 2));

  const result = await runAgentsCli(["card", "apply", "@me/backend@^1.0.0"], envFor(fixture), projectDir);

  expect(result.exitCode).toBe(0);
  const config = JSON.parse(await readFile(join(projectDir, ".agents", "drwn", "config.json"), "utf8"));
  expect(config.cards).toEqual(["@me/backend@^1.0.0"]);
  expect(existsSync(join(projectDir, ".agents", "drwn", "card.lock"))).toBe(true);
});

test("top-level apply alias works", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCard(fixture);
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
  await writeFile(join(projectDir, ".agents", "drwn", "config.json"), JSON.stringify({ version: 1 }, null, 2));

  const result = await runAgentsCli(["apply", "@me/backend@^1.0.0"], envFor(fixture), projectDir);

  expect(result.exitCode).toBe(0);
});

test("top-level add alias adds a card to the current project", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCard(fixture);
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
  await writeFile(join(projectDir, ".agents", "drwn", "config.json"), JSON.stringify({ version: 1, cards: [] }, null, 2));

  const result = await runAgentsCli(["add", "@me/backend@^1.0.0"], envFor(fixture), projectDir);

  expect(result.exitCode).toBe(0);
  expect(JSON.parse(await readFile(join(projectDir, ".agents", "drwn", "config.json"), "utf8")).cards).toEqual(["@me/backend@^1.0.0"]);
});

test("card add writes hook declarations into the lockfile", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithHook(fixture);
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
  await writeFile(join(projectDir, ".agents", "drwn", "config.json"), JSON.stringify({ version: 1, cards: [] }, null, 2));

  const result = await runAgentsCli(["card", "add", "@me/policy@^1.1.0"], envFor(fixture), projectDir);

  expect(result.exitCode).toBe(0);
  const lock = JSON.parse(await readFile(join(projectDir, ".agents", "drwn", "card.lock"), "utf8"));
  expect(lock.cards[0].hooks).toEqual(["audit"]);
});


test("card apply --write chains materialization after preserving mutation", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCard(fixture);
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
  await writeFile(join(projectDir, ".agents", "drwn", "config.json"), JSON.stringify({ version: 1 }, null, 2));

  const result = await runAgentsCli(["card", "apply", "@me/backend@^1.0.0", "--write"], envFor(fixture), projectDir);

  expect(result.exitCode).toBe(0);
  expect(existsSync(join(projectDir, ".claude", "skills", "alpha"))).toBe(true);
});

test("card apply --write surfaces skipped optional MCPs from the applied card", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, {
    name: "@me/backend",
    skills: [],
    servers: {
      "card-local": {
        description: "Card-local optional server",
        transport: "stdio",
        command: "card-local-server",
        optional: true,
      },
    },
  });
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
  await writeFile(join(projectDir, ".agents", "drwn", "config.json"), JSON.stringify({ version: 1 }, null, 2));

  const result = await runAgentsCli(["card", "apply", "@me/backend@^1.0.0", "--write"], envFor(fixture), projectDir);

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Optional MCP servers from cards:");
  expect(result.stdout).toContain("- card-local (skipped - enable with `drwn add mcp card-local`)");
});

test("card add --write surfaces skipped optional MCPs from the added card", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, {
    name: "@me/backend",
    skills: [],
    servers: {
      "card-local": {
        description: "Card-local optional server",
        transport: "stdio",
        command: "card-local-server",
        optional: true,
      },
    },
  });
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
  await writeFile(join(projectDir, ".agents", "drwn", "config.json"), JSON.stringify({ version: 1, cards: [] }, null, 2));

  const result = await runAgentsCli(["card", "add", "@me/backend@^1.0.0", "--write"], envFor(fixture), projectDir);

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Optional MCP servers from cards:");
  expect(result.stdout).toContain("- card-local (skipped - enable with `drwn add mcp card-local`)");
});

test("card add, pin, remove, detach, and outdated mutate expected files", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCard(fixture, "@me/backend", "1.0.0");
  await publishCard(fixture, "@me/backend", "1.1.0");
  await publishCard(fixture, "@me/observability", "1.0.0");
  const projectDir = join(fixture.root, "project");
  const configPath = join(projectDir, ".agents", "drwn", "config.json");
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify({ version: 1, cards: ["@me/backend@^1.0.0"] }, null, 2));
  expect((await runAgentsCli(["card", "update"], envFor(fixture), projectDir)).exitCode).toBe(0);

  expect((await runAgentsCli(["card", "add", "@me/observability@^1.0.0"], envFor(fixture), projectDir)).exitCode).toBe(0);
  expect(JSON.parse(await readFile(configPath, "utf8")).cards).toEqual(["@me/backend@^1.0.0", "@me/observability@^1.0.0"]);
  expect((await runAgentsCli(["card", "add", "@me/backend@^1.0.0"], envFor(fixture), projectDir)).exitCode).not.toBe(0);

  expect((await runAgentsCli(["card", "pin", "@me/backend@1.0.0"], envFor(fixture), projectDir)).exitCode).toBe(0);
  expect(JSON.parse(await readFile(configPath, "utf8")).cards[0]).toBe("@me/backend@1.0.0");

  const outdated = await runAgentsCli(["card", "outdated", "--check"], envFor(fixture), projectDir);
  expect(outdated.exitCode).not.toBe(0);

  expect((await runAgentsCli(["card", "remove", "@me/observability"], envFor(fixture), projectDir)).exitCode).toBe(0);
  expect(JSON.parse(await readFile(configPath, "utf8")).cards).toEqual(["@me/backend@1.0.0"]);
  expect((await runAgentsCli(["card", "remove", "@me/observability"], envFor(fixture), projectDir)).exitCode).not.toBe(0);

  expect((await runAgentsCli(["card", "detach"], envFor(fixture), projectDir)).exitCode).toBe(0);
  expect(JSON.parse(await readFile(configPath, "utf8")).cards).toEqual([]);
});
