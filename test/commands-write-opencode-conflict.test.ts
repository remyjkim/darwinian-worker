// ABOUTME: Exercises opencode.json MCP projection: merge, seeding, jsonc guard, and drift.
// ABOUTME: opencode.json is user-owned; drwn owns only the servers it records.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  cleanupTempRoots,
  envFor,
  installProjectWorkers,
  runAgentsCli,
  scaffoldCliFixture,
} from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function opencodeProject() {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = join(fixture.root, "project");
  await installProjectWorkers(projectDir, fixture.agentsDir, [], null, {
    mcpServers: { context7: { enabled: true } },
  });
  return { fixture, projectDir, opencodePath: join(projectDir, "opencode.json") };
}

describe("opencode MCP projection", () => {
  test("write merges managed servers into opencode.json preserving user keys", async () => {
    const { fixture, projectDir, opencodePath } = await opencodeProject();
    await writeFile(
      opencodePath,
      JSON.stringify({
        $schema: "https://opencode.ai/config.json",
        plugin: ["x"],
        mcp: { own: { type: "local", command: ["my-tool"] } },
      }),
    );

    const result = await runAgentsCli(["write", "--target=opencode", "--json"], envFor(fixture), projectDir);

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(await readFile(opencodePath, "utf8"));
    expect(parsed.plugin).toEqual(["x"]);
    expect(parsed.mcp.own).toEqual({ type: "local", command: ["my-tool"] });
    expect(parsed.mcp.context7).toMatchObject({ type: "local", enabled: true });
    expect(parsed.mcp.context7.command).toEqual(["npx", "-y", "@upstash/context7-mcp"]);
  });

  test("a fresh opencode.json is seeded with the schema line", async () => {
    const { fixture, projectDir, opencodePath } = await opencodeProject();

    const result = await runAgentsCli(["write", "--target=opencode", "--json"], envFor(fixture), projectDir);

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(await readFile(opencodePath, "utf8"));
    expect(parsed.$schema).toBe("https://opencode.ai/config.json");
    expect(parsed.mcp.context7).toMatchObject({ type: "local" });
  });

  test("write refuses when opencode.jsonc exists", async () => {
    const { fixture, projectDir, opencodePath } = await opencodeProject();
    await writeFile(join(projectDir, "opencode.jsonc"), "{\n  // user config\n}\n");

    const result = await runAgentsCli(["write", "--target=opencode", "--json"], envFor(fixture), projectDir);

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.warnings.join("\n")).toContain("opencode.jsonc");
    expect(existsSync(opencodePath)).toBe(false);
  });

  test("disabling the server removes only the owned entry", async () => {
    const { fixture, projectDir, opencodePath } = await opencodeProject();
    await writeFile(
      opencodePath,
      JSON.stringify({ mcp: { own: { type: "local", command: ["my-tool"] } } }),
    );
    expect((await runAgentsCli(["write", "--target=opencode", "--json"], envFor(fixture), projectDir)).exitCode).toBe(0);

    const configPath = join(projectDir, ".agents", "drwn", "config.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.mcpServers = { context7: { enabled: false } };
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);

    const result = await runAgentsCli(["write", "--target=opencode", "--json"], envFor(fixture), projectDir);

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(await readFile(opencodePath, "utf8"));
    expect(parsed.mcp.context7).toBeUndefined();
    expect(parsed.mcp.own).toEqual({ type: "local", command: ["my-tool"] });
  });

  test("owned-server drift blocks the write without --force", async () => {
    const { fixture, projectDir, opencodePath } = await opencodeProject();
    expect((await runAgentsCli(["write", "--target=opencode", "--json"], envFor(fixture), projectDir)).exitCode).toBe(0);
    const parsed = JSON.parse(await readFile(opencodePath, "utf8"));
    parsed.mcp.context7.command = ["tampered"];
    await writeFile(opencodePath, `${JSON.stringify(parsed, null, 2)}\n`);

    const blocked = await runAgentsCli(["write", "--target=opencode", "--json"], envFor(fixture), projectDir);
    expect(blocked.exitCode).not.toBe(0);
    expect(blocked.stderr).toContain("Drift detected in OpenCode managed MCP server");

    const forced = await runAgentsCli(["write", "--target=opencode", "--force", "--json"], envFor(fixture), projectDir);
    expect(forced.exitCode).toBe(0);
    const healed = JSON.parse(await readFile(opencodePath, "utf8"));
    expect(healed.mcp.context7.command).toEqual(["npx", "-y", "@upstash/context7-mcp"]);
  });
});
