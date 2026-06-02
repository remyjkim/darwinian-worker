// ABOUTME: Verifies project-to-card capture creates self-contained card sources.
// ABOUTME: Protects Wave 2's adoption entry point before the CLI wrapper is added.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { captureProjectAsCard } from "../cli/core/card-capture";
import { assertValidCardManifest } from "../cli/core/card-manifest";
import { resolveCardSourceDir } from "../cli/core/store-paths";
import { cleanupTempRoots, publishCardWithSkills, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  delete process.env.DRWN_STORE_READONLY;
  delete process.env.DRWN_CAPTURE_SECRET;
  await cleanupTempRoots(tempRoots);
});

test("captureProjectAsCard snapshots effective project state as a self-contained source", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  process.env.DRWN_CAPTURE_SECRET = "super-secret-value";
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
            args: ["--token-env", "DRWN_CAPTURE_SECRET"],
            env: { API_KEY: "DRWN_CAPTURE_SECRET" },
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

  const result = await captureProjectAsCard({
    agentsDir: fixture.agentsDir,
    repoRoot: fixture.repoRoot,
    homeDir: fixture.homeDir,
    projectPath: projectDir,
    name: "@me/captured",
  });

  expect(result.name).toBe("@me/captured");
  expect(result.skillCount).toBe(2);
  expect(result.serverCount).toBeGreaterThanOrEqual(3);
  expect(result.extensionCount).toBe(1);
  expect(result.targetCount).toBe(1);
  expect(existsSync(join(result.sourceDir, "skills", "card-alpha", "SKILL.md"))).toBe(true);
  expect(existsSync(join(result.sourceDir, "skills", "beta", "SKILL.md"))).toBe(true);

  const manifest = JSON.parse(await readFile(join(result.sourceDir, "card.json"), "utf8"));
  assertValidCardManifest(manifest);
  expect(manifest.name).toBe("@me/captured");
  expect(manifest.version).toBe("0.1.0");
  expect(manifest.skills?.include).toEqual(["card-alpha", "beta"]);
  expect((manifest.servers?.["card-server"] as { command?: string } | undefined)?.command).toBe("card-server");
  expect((manifest.servers?.["project-server"] as { env?: Record<string, string> } | undefined)?.env?.API_KEY).toBe("DRWN_CAPTURE_SECRET");
  expect(JSON.stringify(manifest)).not.toContain("super-secret-value");
  expect(manifest.extensions?.custom).toEqual({ enabled: true, flavor: "test" });
  expect(manifest.targets?.cursor?.enabled).toBe(false);
});

test("captureProjectAsCard refuses to overwrite an existing source", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = join(fixture.root, "project");
  const configPath = join(projectDir, ".agents", "drwn", "config.json");
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify({ version: 1, skills: { include: ["alpha"] } }, null, 2));
  await mkdir(resolveCardSourceDir(fixture.agentsDir, "@me/captured"), { recursive: true });
  await writeFile(join(resolveCardSourceDir(fixture.agentsDir, "@me/captured"), "card.json"), "{}\n");

  await expect(
    captureProjectAsCard({
      agentsDir: fixture.agentsDir,
      repoRoot: fixture.repoRoot,
      homeDir: fixture.homeDir,
      projectPath: projectDir,
      name: "@me/captured",
    }),
  ).rejects.toThrow(/Card source already exists/);
});

test("captureProjectAsCard respects DRWN_STORE_READONLY", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = join(fixture.root, "project");
  const configPath = join(projectDir, ".agents", "drwn", "config.json");
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify({ version: 1, skills: { include: ["alpha"] } }, null, 2));
  process.env.DRWN_STORE_READONLY = "1";

  await expect(
    captureProjectAsCard({
      agentsDir: fixture.agentsDir,
      repoRoot: fixture.repoRoot,
      homeDir: fixture.homeDir,
      projectPath: projectDir,
      name: "@me/captured",
    }),
  ).rejects.toThrow(/read-only/);
});
