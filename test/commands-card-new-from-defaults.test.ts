// ABOUTME: Verifies card new --from-defaults captures machine skill defaults.
// ABOUTME: Guards profile card scaffolding from machine.json defaults.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { writeMachineConfig } from "../cli/core/card-store";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("card new --from-defaults captures machine default skills into a profile card", async () => {
  const fixture = await scaffoldCliFixture({ curatedSkillNames: ["alpha"] });
  tempRoots.push(fixture.root);
  await writeMachineConfig(fixture.agentsDir, {
    version: 1,
    optional: {},
    defaults: { skills: ["alpha"] },
    targets: {
      claude: { enabled: true, configPath: fixture.claudeSettings, format: "json-merge", mcpKey: "mcpServers" },
      codex: { enabled: true, configPath: fixture.codexConfig, format: "toml-merge", mcpKey: "mcp_servers" },
      cursor: { enabled: true, configPath: fixture.cursorConfig, format: "json-standalone", mcpKey: "mcpServers" },
    },
    authoring: { scope: "@me" },
  });

  const result = await runAgentsCli(["card", "new", "everyday", "--from-defaults", "--no-git"], envFor(fixture));
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("@me/everyday");

  const sourceDir = join(fixture.agentsDir, "drwn", "sources", "@me", "everyday");
  expect(existsSync(join(sourceDir, "skills", "alpha", "SKILL.md"))).toBe(true);
  const manifest = JSON.parse(await readFile(join(sourceDir, "card.json"), "utf8"));
  expect(manifest.skills?.include).toEqual(["alpha"]);
});

test("card new --from-defaults fails when no skill defaults are configured", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await writeMachineConfig(fixture.agentsDir, {
    version: 1,
    optional: {},
    targets: {
      claude: { enabled: true, configPath: fixture.claudeSettings, format: "json-merge", mcpKey: "mcpServers" },
      codex: { enabled: true, configPath: fixture.codexConfig, format: "toml-merge", mcpKey: "mcp_servers" },
      cursor: { enabled: true, configPath: fixture.cursorConfig, format: "json-standalone", mcpKey: "mcpServers" },
    },
    authoring: { scope: "@me" },
  });
  const result = await runAgentsCli(["card", "new", "everyday", "--from-defaults", "--no-git"], envFor(fixture));
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("default skill");
});
