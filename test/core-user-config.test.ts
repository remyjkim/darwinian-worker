// ABOUTME: Verifies user-owned drwn global config helpers.
// ABOUTME: Protects defaults initialization without changing repo-root fixture behavior.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, scaffoldCliFixture } from "./helpers";
import type { CanonicalConfig } from "../cli/core/types";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

describe("user global config", () => {
  test("resolves the user drwn config under the agents dir", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const { resolveUserBgngDir, resolveUserConfigPath } = await import("../cli/core/user-config");

    expect(resolveUserBgngDir(fixture.agentsDir)).toBe(join(fixture.agentsDir, "bgng"));
    expect(resolveUserConfigPath(fixture.agentsDir)).toBe(join(fixture.agentsDir, "bgng", "config.json"));
  });

  test("saves and loads stable user config JSON", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const { loadUserConfig, resolveUserConfigPath, saveUserConfig } = await import("../cli/core/user-config");
    const path = resolveUserConfigPath(fixture.agentsDir);
    const config: CanonicalConfig = {
      version: 1,
      targets: {
        claude: { enabled: true, configPath: fixture.claudeSettings, format: "json-merge", mcpKey: "mcpServers" },
        codex: { enabled: true, configPath: fixture.codexConfig, format: "toml-merge", mcpKey: "mcp_servers" },
        cursor: { enabled: true, configPath: fixture.cursorConfig, format: "json-standalone", mcpKey: "mcpServers" },
      },
      optional: {},
      defaults: { skills: ["alpha"], mcpServers: ["context7"] },
    };

    await saveUserConfig(path, config);

    expect(await loadUserConfig(path)).toEqual(config);
    expect(await readFile(path, "utf8")).toEndWith("\n");
  });

  test("initializes defaults from packaged config, registry, and curated skills", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await mkdir(join(fixture.agentsDir, "skills"), { recursive: true });
    await symlink(join(fixture.repoRoot, "skills", "shared", "alpha"), join(fixture.agentsDir, "skills", "alpha"), "dir");

    const { loadConfig } = await import("../cli/core/config");
    const { loadRegistry } = await import("../cli/core/registry");
    const { initializeUserConfigFromPackagedDefaults } = await import("../cli/core/user-config");

    const initialized = await initializeUserConfigFromPackagedDefaults(
      await loadConfig(fixture.repoRoot),
      await loadRegistry(fixture.repoRoot),
      fixture.agentsDir,
    );

    expect(initialized.defaults?.skills).toContain("alpha");
    expect(initialized.defaults?.mcpServers).toContain("context7");
    expect(initialized.targets.claude.configPath).toBe(fixture.claudeSettings);
  });
});
