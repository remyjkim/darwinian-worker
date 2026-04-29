// ABOUTME: Verifies baseline harness config and registry loading from the reusable core modules.
// ABOUTME: Ensures future CLI commands read the same source-of-truth files as the sync wrapper.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (root) => {
      await rm(root, { recursive: true, force: true });
    }),
  );
});

async function createTempRoot() {
  const root = await mkdtemp(join(tmpdir(), "agents-config-core-"));
  tempRoots.push(root);
  return root;
}

describe("core config and registry", () => {
  test("loads baseline harness config from repo root", async () => {
    const root = await createTempRoot();
    const repoRoot = join(root, "repo");

    await mkdir(join(repoRoot, "registry"), { recursive: true });
    await writeFile(
      join(repoRoot, "registry", "config.json"),
      JSON.stringify(
        {
          version: 1,
          targets: {
            claude: { enabled: true, configPath: "~/.claude/settings.json", format: "json-merge", mcpKey: "mcpServers" },
            codex: { enabled: true, configPath: "~/.codex/config.toml", format: "toml-merge", mcpKey: "mcp_servers" },
            cursor: { enabled: true, configPath: "~/.cursor/mcp.json", format: "json-standalone", mcpKey: "mcpServers" },
          },
          optional: {},
          parallel: { cli: { enabled: true }, mcp: { enabled: false } },
        },
        null,
        2,
      ),
    );

    const { loadConfig } = await import("../cli/core/config");
    const config = await loadConfig(repoRoot);

    expect(config.targets.claude).toBeDefined();
    expect(config.parallel?.cli?.enabled).toBe(true);
  });

  test("loads packaged registry from repo root", async () => {
    const root = await createTempRoot();
    const repoRoot = join(root, "repo");

    await mkdir(join(repoRoot, "registry"), { recursive: true });
    await writeFile(
      join(repoRoot, "registry", "mcp-servers.json"),
      JSON.stringify(
        {
          version: 1,
          servers: {
            context7: {
              description: "Docs",
              transport: "stdio",
              command: "npx",
              args: ["-y", "@upstash/context7-mcp"],
              optional: false,
            },
          },
        },
        null,
        2,
      ),
    );

    const { loadRegistry } = await import("../cli/core/registry");
    const registry = await loadRegistry(repoRoot);

    expect(registry.servers.context7).toBeDefined();
    expect(registry.servers.context7!.command).toBe("npx");
  });
});
