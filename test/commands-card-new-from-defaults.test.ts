// ABOUTME: Verifies card new --from-defaults captures machine skill defaults.
// ABOUTME: Guards profile card scaffolding from machine.json defaults.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveCard, writeMachineConfig } from "../cli/core/card-store";
import { cleanupTempRoots, envFor, publishCardWithSkills, runAgentsCli, scaffoldCliFixture } from "./helpers";
import { createEmptyMachineConfig } from "../cli/core/machine-config";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function installCaptureProfile(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  await publishCardWithSkills(fixture, {
    name: "@darwinian/operator",
    version: "1.0.2",
    skills: ["bootstrap-project"],
  });
  const resolved = await resolveCard(fixture.agentsDir, "@darwinian/operator@1.0.2");
  return {
    id: "darwinian-operator" as const,
    source: "git+https://github.com/curation-labs/darwinian-operator.git#v1.0.2" as const,
    name: "@darwinian/operator" as const,
    version: "1.0.2" as const,
    commit: resolved.git!.commit,
    treeSha: resolved.treeSha!,
    integrity: resolved.integrity as `sha256-${string}`,
    skills: ["bootstrap-project"],
    mcpServers: [],
  };
}

test("card new --from-defaults captures explicit machine skills into a capability Card", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await writeMachineConfig(fixture.agentsDir, {
    ...createEmptyMachineConfig(),
    policy: { authoring: { scope: "@me" } },
    capabilities: { profile: null, skills: ["alpha"], mcpServers: [] },
  });

  const result = await runAgentsCli(["card", "new", "everyday", "--from-defaults", "--no-git"], envFor(fixture));
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("@me/everyday");

  const sourceDir = join(fixture.agentsDir, "drwn", "sources", "@me", "everyday");
  expect(existsSync(join(sourceDir, "skills", "alpha", "SKILL.md"))).toBe(true);
  const manifest = JSON.parse(await readFile(join(sourceDir, "card.json"), "utf8"));
  expect(manifest.skills?.include).toEqual(["alpha"]);
});

test("card new --from-defaults flattens profile and explicit skills without profile identity", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const profile = await installCaptureProfile(fixture);
  await writeMachineConfig(fixture.agentsDir, {
    ...createEmptyMachineConfig(),
    policy: { authoring: { scope: "@me" } },
    capabilities: { profile, skills: ["alpha"], mcpServers: [] },
  });

  const result = await runAgentsCli(["card", "new", "everyday", "--from-defaults", "--no-git"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  const sourceDir = join(fixture.agentsDir, "drwn", "sources", "@me", "everyday");
  const manifestText = await readFile(join(sourceDir, "card.json"), "utf8");
  const manifest = JSON.parse(manifestText);
  expect(manifest.skills?.include).toEqual(["bootstrap-project", "alpha"]);
  expect(existsSync(join(sourceDir, "skills", "bootstrap-project", "SKILL.md"))).toBe(true);
  expect(manifest.profile).toBeUndefined();
  expect(manifest.instructions).toBeUndefined();
  expect(manifest.hooks).toBeUndefined();
  expect(manifestText).not.toContain("darwinian-operator");
  expect(manifestText).not.toContain("@darwinian/operator");
});

test("card new --from-defaults captures effective MCP definitions with secret references preserved", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const { ensureStoreInitialized } = await import("../cli/core/card-store");
  const { saveMcpLibrary } = await import("../cli/core/mcp-library");
  await ensureStoreInitialized(fixture.agentsDir);
  await saveMcpLibrary(fixture.agentsDir, {
    version: 1,
    servers: {
      notion: {
        description: "Notion",
        transport: "stdio",
        command: "npx",
        env: { NOTION_TOKEN: "${NOTION_TOKEN}" },
        optional: false,
      },
    },
  });
  await writeMachineConfig(fixture.agentsDir, {
    ...createEmptyMachineConfig(),
    policy: { authoring: { scope: "@me" } },
    capabilities: { profile: null, skills: [], mcpServers: ["notion"] },
  });

  const result = await runAgentsCli(["card", "new", "everyday", "--from-defaults", "--no-git"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  const sourceDir = join(fixture.agentsDir, "drwn", "sources", "@me", "everyday");
  const manifest = JSON.parse(await readFile(join(sourceDir, "card.json"), "utf8"));
  expect(manifest.servers?.notion?.env?.NOTION_TOKEN).toBe("${NOTION_TOKEN}");
  expect(JSON.parse(await readFile(join(sourceDir, "mcp-servers", "notion.json"), "utf8"))).toEqual(manifest.servers.notion);
});

test("card new --from-defaults fails when no machine capabilities are configured", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await writeMachineConfig(fixture.agentsDir, {
    ...createEmptyMachineConfig(),
    policy: { authoring: { scope: "@me" } },
  });
  const result = await runAgentsCli(["card", "new", "everyday", "--from-defaults", "--no-git"], envFor(fixture));
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("machine capabilities");
});
