// ABOUTME: Verifies `drwn status --why` and `--explain` provenance output.
// ABOUTME: Protects the cards-era diagnostics command surface.

import { afterEach, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { cleanupTempRoots, envFor, publishCardWithSkills, runAgentsCli, scaffoldCliFixture, writeSupportedProjectConfig } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function publishDiagnosticCard(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  await publishCardWithSkills(fixture, {
    name: "@me/backend",
    skills: ["alpha"],
    servers: {
      "card-server": {
        description: "From card",
        transport: "stdio",
        command: "card-run",
        optional: false,
      },
    },
  });
}

test("status --why answers typed and unique bare queries", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishDiagnosticCard(fixture);
  const projectDir = join(fixture.root, "project");
  const configPath = join(projectDir, ".agents", "drwn", "config.json");
  await writeSupportedProjectConfig(projectDir);
  expect((await runAgentsCli(["apply", "@me/backend@^1.0.0"], envFor(fixture), projectDir)).exitCode).toBe(0);

  const skill = await runAgentsCli(["status", "--why", "skill:alpha"], envFor(fixture), projectDir);
  const server = await runAgentsCli(["status", "--why", "card-server"], envFor(fixture), projectDir);

  expect(skill.exitCode).toBe(0);
  expect(skill.stdout).toContain("card @me/backend@1.0.0");
  expect(server.exitCode).toBe(0);
  expect(server.stdout).toContain("server:card-server");
});

test("status --why bare query fails when ambiguous and --explain includes provenance", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = join(fixture.root, "project");
  const configPath = join(projectDir, ".agents", "drwn", "config.json");
  await writeSupportedProjectConfig(projectDir, {
    skills: { include: ["alpha"] },
    mcpServers: { alpha: { enabled: true } },
  });

  const ambiguous = await runAgentsCli(["status", "--why", "alpha"], envFor(fixture), projectDir);
  const explain = await runAgentsCli(["status", "--explain"], envFor(fixture), projectDir);

  expect(ambiguous.exitCode).not.toBe(0);
  expect(ambiguous.stderr).toContain("ambiguous");
  expect(explain.exitCode).toBe(0);
  expect(explain.stdout).toContain("Skills");
  expect(explain.stdout).toContain("Targets");
});

test("status --why uses machine inventory provenance terminology", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  const skill = await runAgentsCli(["status", "--why", "skill:alpha"], envFor(fixture));
  const server = await runAgentsCli(["status", "--why", "server:context7"], envFor(fixture));

  expect(skill.exitCode).toBe(0);
  expect(skill.stdout).toContain("repo or installed skill inventory");
  expect(skill.stdout).not.toContain("library");
  expect(server.exitCode).toBe(0);
  expect(server.stdout).toContain("registry or standalone machine inventory");
  expect(server.stdout).not.toContain("library");
});
