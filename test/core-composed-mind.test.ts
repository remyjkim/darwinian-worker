// ABOUTME: Verifies the composed active-stack mind view under generated/mind.
// ABOUTME: Protects stack-ordered persona, provenance index fields, and cleanup.

import { afterEach, expect, test } from "bun:test";
import { existsSync, lstatSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { syncRepository } from "../cli/core/sync";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("syncRepository writes a composed active mind with ordered persona and provenance", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishMindFixture(fixture, { name: "@me/base", personaEntry: "voice", personaText: "Base voice", memoryLayer: "l4", memoryEntry: "notes" });
  await publishMindFixture(fixture, { name: "@me/overlay", personaEntry: "tone", personaText: "Overlay tone", memoryLayer: "l6", memoryEntry: "raw" });
  const projectDir = await createProjectConfig(fixture, {
    cards: ["@me/base@1.0.0", "@me/overlay@1.0.0"],
    activeMinds: ["@me/base", "@me/overlay"],
  });

  await syncRepository(syncOptions(fixture, projectDir));
  const composedDir = join(projectDir, ".agents", "drwn", "generated", "mind");
  const persona = await readFile(join(composedDir, "persona.md"), "utf8");
  const index = JSON.parse(await readFile(join(composedDir, "mind.json"), "utf8"));

  expect(persona.indexOf('card="@me/base"')).toBeGreaterThanOrEqual(0);
  expect(persona.indexOf('card="@me/overlay"')).toBeGreaterThan(persona.indexOf('card="@me/base"'));
  expect(persona).toContain("Base voice");
  expect(persona).toContain("Overlay tone");
  expect(lstatSync(join(composedDir, "beliefs", "@me", "base", "engineering")).isDirectory()).toBe(true);
  expect(lstatSync(join(composedDir, "beliefs", "@me", "overlay", "engineering")).isDirectory()).toBe(true);
  expect(lstatSync(join(composedDir, "memory", "l4", "@me", "base", "notes")).isDirectory()).toBe(true);
  expect(lstatSync(join(composedDir, "memory", "l6", "@me", "overlay", "raw")).isDirectory()).toBe(true);

  expect(index.schemaVersion).toBe(1);
  expect(index.activeMinds).toEqual(["@me/base", "@me/overlay"]);
  expect(index.persona.entries).toEqual([
    { card: "@me/base", entry: "voice" },
    { card: "@me/overlay", entry: "tone" },
  ]);
  expect(index.beliefs.entries).toEqual([
    { card: "@me/base", entry: "engineering", path: "beliefs/@me/base/engineering", visibility: "internal" },
    { card: "@me/overlay", entry: "engineering", path: "beliefs/@me/overlay/engineering", visibility: "internal" },
  ]);
  expect(index.memory.l4.entries).toEqual([
    { card: "@me/base", entry: "notes", path: "memory/l4/@me/base/notes", visibility: "private", format: "md" },
  ]);
  expect(index.memory.l6.entries).toEqual([
    { card: "@me/overlay", entry: "raw", path: "memory/l6/@me/overlay/raw", visibility: "private", format: "jsonl" },
  ]);
  expect(index.sources).toHaveLength(2);
  expect(index.sources.every((source: { integrity?: string }) => source.integrity?.startsWith("sha256-"))).toBe(true);
  expect(typeof index.drwnVersion).toBe("string");
  expect(index.writtenAt).toBeUndefined();

  expect((await runAgentsCli(["mind", "use", "@me/overlay", "@me/base"], envFor(fixture), projectDir)).exitCode).toBe(0);
  await syncRepository(syncOptions(fixture, projectDir));
  const reordered = await readFile(join(composedDir, "persona.md"), "utf8");
  expect(reordered.indexOf('card="@me/base"')).toBeGreaterThan(reordered.indexOf('card="@me/overlay"'));
});

test("syncRepository composes all installed minds by default, prunes shrink, and removes empty stack", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishMindFixture(fixture, { name: "@me/base", personaEntry: "voice", personaText: "Base voice" });
  await publishMindFixture(fixture, { name: "@me/overlay", personaEntry: "tone", personaText: "Overlay tone" });
  const projectDir = await createProjectConfig(fixture, {
    cards: ["@me/base@1.0.0", "@me/overlay@1.0.0"],
  });

  await syncRepository(syncOptions(fixture, projectDir));
  const generatedDir = join(projectDir, ".agents", "drwn", "generated");
  const composedDir = join(generatedDir, "mind");
  const defaultIndex = JSON.parse(await readFile(join(composedDir, "mind.json"), "utf8"));
  expect(defaultIndex.activeMinds).toEqual(["@me/base", "@me/overlay"]);

  expect((await runAgentsCli(["mind", "use", "@me/base"], envFor(fixture), projectDir)).exitCode).toBe(0);
  await syncRepository(syncOptions(fixture, projectDir));
  const shrunkIndex = JSON.parse(await readFile(join(composedDir, "mind.json"), "utf8"));
  expect(shrunkIndex.activeMinds).toEqual(["@me/base"]);
  expect(existsSync(join(composedDir, "beliefs", "@me", "base", "engineering"))).toBe(true);
  expect(existsSync(join(composedDir, "beliefs", "@me", "overlay", "engineering"))).toBe(false);

  expect((await runAgentsCli(["mind", "clear"], envFor(fixture), projectDir)).exitCode).toBe(0);
  await syncRepository(syncOptions(fixture, projectDir));
  expect(existsSync(composedDir)).toBe(false);
  expect(existsSync(join(generatedDir, "minds", "@me", "base", "mind.json"))).toBe(true);
  expect(existsSync(join(generatedDir, "minds", "@me", "overlay", "mind.json"))).toBe(true);
});

async function createProjectConfig(
  fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>,
  config: { cards: string[]; activeMinds?: string[] },
) {
  const projectDir = join(fixture.root, `project-${tempRoots.length}`);
  const configPath = join(projectDir, ".agents", "drwn", "config.json");
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify({ version: 1, ...config }, null, 2));
  return projectDir;
}

function syncOptions(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>, projectDir: string) {
  return {
    repoRoot: fixture.repoRoot,
    agentsDir: fixture.agentsDir,
    homeDir: fixture.homeDir,
    cwd: projectDir,
  };
}

async function publishMindFixture(
  fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>,
  options: {
    name: string;
    personaEntry: string;
    personaText: string;
    memoryLayer?: "l4" | "l5" | "l6";
    memoryEntry?: string;
  },
) {
  expect((await runAgentsCli(["card", "new", options.name, "--no-git"], envFor(fixture))).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "source", "add-persona", options.name, options.personaEntry, "--visibility", "internal"], envFor(fixture))).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "source", "add-belief", options.name, "engineering", "--visibility", "internal"], envFor(fixture))).exitCode).toBe(0);
  if (options.memoryLayer && options.memoryEntry) {
    const format = options.memoryLayer === "l6" ? "jsonl" : "md";
    expect(
      (await runAgentsCli(
        ["card", "source", "add-memory", options.name, options.memoryEntry, "--layer", options.memoryLayer, "--visibility", "private", "--format", format],
        envFor(fixture),
      )).exitCode,
    ).toBe(0);
  }
  const [, scope, cardName] = options.name.match(/^(@[^/]+)\/(.+)$/) ?? [];
  const sourceDir = join(fixture.agentsDir, "drwn", "sources", scope!, cardName!);
  await writeFile(join(sourceDir, "persona", options.personaEntry, "PERSONA.md"), `${options.personaText}\n`);
  await writeFile(join(sourceDir, "beliefs", "engineering", "BELIEF.md"), `Engineering belief from ${options.name}\n`);
  expect((await runAgentsCli(["card", "publish", options.name], envFor(fixture))).exitCode).toBe(0);
}
