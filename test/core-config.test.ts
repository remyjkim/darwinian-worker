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

  test("a target map without opencode still writes without throwing", async () => {
    const { cleanupTempRoots: cleanup, envFor, runAgentsCli, scaffoldCliFixture } = await import("./helpers");
    const { readFile: read, writeFile: write } = await import("node:fs/promises");
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    void cleanup;
    const registryConfigPath = join(fixture.repoRoot, "registry", "config.json");
    const registryConfig = JSON.parse(await read(registryConfigPath, "utf8"));
    delete registryConfig.targets.opencode;
    await write(registryConfigPath, `${JSON.stringify(registryConfig, null, 2)}\n`);

    const result = await runAgentsCli(["write", "--dry-run", "--json"], envFor(fixture));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("opencode.json");
  });

  test("packaged registry declares the opencode target disabled by default", async () => {
    const { loadConfig } = await import("../cli/core/config");
    const repoRoot = join(import.meta.dir, "..");
    const config = await loadConfig(repoRoot);
    expect(config.targets.opencode).toMatchObject({
      enabled: false,
      configPath: "~/.config/opencode/opencode.json",
      format: "json-merge",
      mcpKey: "mcp",
    });
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
