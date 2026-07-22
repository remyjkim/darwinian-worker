// ABOUTME: Pins per-server MCP drift detection semantics for doctor diagnostics.
// ABOUTME: Foreign servers in merged target configs must not report as drift.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { detectMcpDrift } from "../cli/core/diagnostics";
import { renderMcpServerForTarget } from "../cli/core/mcp";
import { cleanupTempRoots, createFixtureConfig, createFixtureRegistry, createTempRoot } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function cursorDriftFixture(mutate?: (managed: Record<string, Record<string, unknown>>) => void) {
  const root = await createTempRoot("mcp-drift-");
  tempRoots.push(root);
  const registry = createFixtureRegistry();
  const servers = registry.servers;
  const managed = Object.fromEntries(
    Object.entries(servers).map(([name, server]) => [name, renderMcpServerForTarget("cursor", server)]),
  );
  mutate?.(managed);
  await mkdir(join(root, ".cursor"), { recursive: true });
  await writeFile(
    join(root, ".cursor", "mcp.json"),
    `${JSON.stringify({ mcpServers: { ...managed, "user-own": { command: "my-tool" } } }, null, 2)}\n`,
  );
  const config = createFixtureConfig({
    claudeSettings: join(root, ".claude", "settings.json"),
    codexConfig: join(root, ".codex", "config.toml"),
    cursorConfig: join(root, ".cursor", "mcp.json"),
  });
  config.targets.claude.enabled = false;
  config.targets.codex.enabled = false;
  return { root, servers, config };
}

async function opencodeDriftFixture(mutate?: (managed: Record<string, Record<string, unknown>>) => void) {
  const root = await createTempRoot("mcp-drift-");
  tempRoots.push(root);
  const registry = createFixtureRegistry();
  const servers = registry.servers;
  const managed = Object.fromEntries(
    Object.entries(servers).map(([name, server]) => [name, renderMcpServerForTarget("opencode", server)]),
  ) as Record<string, Record<string, unknown>>;
  mutate?.(managed);
  await writeFile(
    join(root, "opencode.json"),
    `${JSON.stringify({ $schema: "https://opencode.ai/config.json", plugin: ["x"], mcp: { ...managed, "user-own": { type: "local", command: ["my-tool"] } } }, null, 2)}\n`,
  );
  const config = createFixtureConfig({
    claudeSettings: join(root, ".claude", "settings.json"),
    codexConfig: join(root, ".codex", "config.toml"),
    cursorConfig: join(root, ".cursor", "mcp.json"),
    opencodeConfig: join(root, "opencode.json"),
  });
  config.targets.claude.enabled = false;
  config.targets.codex.enabled = false;
  config.targets.cursor.enabled = false;
  return { root, servers, config };
}

describe("detectMcpDrift opencode", () => {
  test("foreign keys and servers report no drift when managed servers are in sync", async () => {
    const { root, servers, config } = await opencodeDriftFixture();
    const drifts = await detectMcpDrift(config, servers, root);
    expect(drifts).toEqual([]);
  });

  test("a modified managed server reports drift", async () => {
    const { root, servers, config } = await opencodeDriftFixture((managed) => {
      managed.context7 = { ...managed.context7, command: ["tampered"] };
    });
    const drifts = await detectMcpDrift(config, servers, root);
    expect(drifts).toHaveLength(1);
    expect(drifts[0]).toStartWith("opencode:");
  });
});

describe("detectMcpDrift cursor", () => {
  test("foreign servers alongside in-sync managed servers report no drift", async () => {
    const { root, servers, config } = await cursorDriftFixture();
    const drifts = await detectMcpDrift(config, servers, root);
    expect(drifts).toEqual([]);
  });

  test("a modified managed server still reports drift", async () => {
    const { root, servers, config } = await cursorDriftFixture((managed) => {
      managed.context7 = { ...managed.context7, command: "tampered" };
    });
    const drifts = await detectMcpDrift(config, servers, root);
    expect(drifts).toHaveLength(1);
    expect(drifts[0]).toStartWith("cursor:");
  });
});
