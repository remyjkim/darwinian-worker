// ABOUTME: Verifies per-worker generated bundles and registry materialization.
// ABOUTME: Protects isolated worker output, symlinks, and stale bundle cleanup.

import { afterEach, expect, test } from "bun:test";
import { existsSync, lstatSync, readlinkSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { validateCardManifest } from "../cli/core/card-manifest";
import { syncRepository } from "../cli/core/sync";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function publishWorkerFixture(
  fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>,
  options: { instructions?: unknown; identity?: unknown; kind?: "card" | "blueprint"; skillBody?: string } = {},
) {
  expect((await runAgentsCli(["card", "new", "@me/mind", "--no-git"], envFor(fixture))).exitCode).toBe(0);
  const sourceDir = join(fixture.agentsDir, "drwn", "sources", "@me", "mind");
  const manifest = JSON.parse(await readFile(join(sourceDir, "card.json"), "utf8"));
  if (options.kind) manifest.kind = options.kind;
  if (options.instructions !== undefined) manifest.instructions = options.instructions;
  if (options.identity !== undefined) manifest.identity = options.identity;
  manifest.skills = { include: ["alpha"] };
  manifest.servers = {
    "mind-server": {
      description: "Mind server",
      transport: "stdio",
      command: "mind-server",
      optional: false,
    },
  };
  await writeFile(join(sourceDir, "card.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await mkdir(join(sourceDir, "skills", "alpha"), { recursive: true });
  await writeFile(
    join(sourceDir, "skills", "alpha", "SKILL.md"),
    `---\nname: alpha\ndescription: alpha\n---\n${options.skillBody ?? ""}`,
  );
  expect((await runAgentsCli(["card", "publish", "@me/mind"], envFor(fixture))).exitCode).toBe(0);
}

async function createProjectWithCard(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  const projectDir = join(fixture.root, "project");
  const configPath = join(projectDir, ".agents", "drwn", "config.json");
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify({ version: 1, cards: ["@me/mind@1.0.0"] }, null, 2));
  return {
    projectDir,
    configPath,
    syncOptions: {
      repoRoot: fixture.repoRoot,
      agentsDir: fixture.agentsDir,
      homeDir: fixture.homeDir,
      cwd: projectDir,
    },
  };
}

test("card manifest validates explicit instructions sources", () => {
  const base = { name: "@me/mind", version: "1.0.0" };

  expect(validateCardManifest({ ...base, instructions: { text: "Use concise answers." } }).ok).toBe(true);
  expect(validateCardManifest({ ...base, instructions: { path: "instructions.md" } }).ok).toBe(true);
  expect(validateCardManifest({ ...base, instructions: {} }).errors).toContain(
    "instructions must specify exactly one of text or path",
  );
  expect(validateCardManifest({ ...base, instructions: { text: "x", path: "instructions.md" } }).errors).toContain(
    "instructions must specify exactly one of text or path",
  );
  expect(validateCardManifest({ ...base, instructions: { path: "../instructions.md" } }).errors).toContain(
    "instructions.path must be a relative path inside the card content root",
  );
});

test("syncRepository emits explicit card instructions at the canonical project path", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishWorkerFixture(fixture, { instructions: { text: "Use compact worker instructions." } });
  const { projectDir, syncOptions } = await createProjectWithCard(fixture);

  const result = await syncRepository(syncOptions);
  const instructionsPath = join(projectDir, ".agents", "drwn", "generated", "instructions.md");
  const content = await readFile(instructionsPath, "utf8");

  expect(content).toBe("Use compact worker instructions.\n");
  expect(result.managedPaths?.some((entry) =>
    entry.kind === "managed-content" && entry.path === ".agents/drwn/generated/instructions.md"
  )).toBe(true);
});

test("syncRepository falls back to skill instructions with frontmatter stripped", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishWorkerFixture(fixture, { skillBody: "\nFollow alpha task handling.\n" });
  const { projectDir, syncOptions } = await createProjectWithCard(fixture);

  await syncRepository(syncOptions);
  const content = await readFile(join(projectDir, ".agents", "drwn", "generated", "instructions.md"), "utf8");

  expect(content).toContain("Follow alpha task handling.");
  expect(content).not.toContain("name: alpha");
  expect(content).not.toContain("---");
  expect(content.endsWith("\n")).toBe(true);
});

test("syncRepository materializes isolated worker bundles and cleans removed workers", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishWorkerFixture(fixture);
  const { projectDir, configPath, syncOptions } = await createProjectWithCard(fixture);
  const first = await syncRepository(syncOptions);
  const workerDir = join(projectDir, ".agents", "drwn", "generated", "workers", "@me", "mind");
  const registry = JSON.parse(await readFile(join(projectDir, ".agents", "drwn", "generated", "workers.json"), "utf8"));
  const workerJson = JSON.parse(await readFile(join(workerDir, "worker.json"), "utf8"));

  expect(first.cardModes?.["@me/mind"]?.mode).toBe("vendored");
  expect(registry.workers.map((worker: { name: string }) => worker.name)).toEqual(["@me/mind"]);
  expect(workerJson.name).toBe("@me/mind");
  expect(workerJson.skills).toEqual(["alpha"]);
  expect(workerJson.persona).toBeUndefined();
  expect(workerJson.beliefs).toBeUndefined();
  expect(workerJson.memory).toBeUndefined();
  expect(existsSync(join(workerDir, "persona.md"))).toBe(false);
  expect(lstatSync(join(workerDir, "skills", "alpha")).isDirectory()).toBe(true);
  expect(lstatSync(join(workerDir, "skills", "alpha")).isSymbolicLink()).toBe(false);
  expect(JSON.parse(await readFile(join(workerDir, "mcp", "servers.json"), "utf8")).mcpServers["mind-server"].command).toBe("mind-server");
  expect(existsSync(join(projectDir, ".agents", "drwn", "generated", "mind"))).toBe(false);

  await writeFile(configPath, JSON.stringify({ version: 1, cards: [] }, null, 2));
  const second = await syncRepository(syncOptions);

  expect(second.changes.some((change) => change.includes(`remove ${workerDir}`))).toBe(true);
  expect(existsSync(workerDir)).toBe(false);
});
