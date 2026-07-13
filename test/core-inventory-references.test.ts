// ABOUTME: Verifies fail-closed standalone inventory reference discovery.
// ABOUTME: Separates explicit machine/project intent from copied Card and inline MCP content.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { scanInventoryReferences } from "../cli/core/inventory-references";
import { createEmptyMachineConfig, writeMachineConfigFile } from "../cli/core/machine-config";
import { registerProject } from "../cli/core/project-registry";
import { resolveMachineConfigPath } from "../cli/core/store-paths";
import { cleanupTempRoots, createTempRoot, writeSupportedProjectConfig } from "./helpers";

const roots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(roots.splice(0));
});

async function fixture() {
  const root = await createTempRoot("inventory-references-");
  roots.push(root);
  const agentsDir = join(root, ".agents");
  await mkdir(join(agentsDir, "drwn"), { recursive: true });
  return { root, agentsDir };
}

describe("standalone inventory reference discovery", () => {
  test("reports explicit machine and committed project references deterministically", async () => {
    const state = await fixture();
    const machine = createEmptyMachineConfig();
    machine.capabilities.skills = ["alpha"];
    machine.capabilities.mcpServers = ["notion"];
    await writeMachineConfigFile(resolveMachineConfigPath(state.agentsDir), machine);
    const project = join(state.root, "project");
    await writeSupportedProjectConfig(project, {
      skills: { include: ["alpha"], exclude: ["beta"] },
      mcpServers: {
        notion: { enabled: true },
        inline: { description: "Inline", transport: "http", url: "https://example.test/mcp", optional: false },
      },
    });
    await registerProject(state.agentsDir, project);

    const references = await scanInventoryReferences({
      agentsDir: state.agentsDir,
      skillIds: ["alpha", "beta"],
      mcpIds: ["notion", "inline"],
      projectRoots: [project],
    });

    expect(references.map((entry) => [entry.surface, entry.kind, entry.id, entry.relation])).toEqual([
      ["machine", "mcp", "notion", "explicit-selection"],
      ["project", "mcp", "notion", "mcp-toggle"],
      ["machine", "skill", "alpha", "explicit-selection"],
      ["project", "skill", "alpha", "include"],
      ["project", "skill", "beta", "exclude"],
    ]);
    expect(references.filter((entry) => entry.id === "alpha" && entry.surface === "project")).toHaveLength(1);
    expect(references.some((entry) => entry.id === "inline")).toBe(false);
  });

  test("does not treat profile-owned capabilities as standalone references", async () => {
    const state = await fixture();
    const machine = createEmptyMachineConfig();
    machine.capabilities.profile = {
      id: "darwinian-operator",
      source: "git+https://github.com/curation-labs/darwinian-operator.git#v1.0.2",
      name: "@darwinian/operator",
      version: "1.0.2",
      commit: "6b2998c51b7c736c70c2e522cb8d7b3170e816d8",
      treeSha: "2297dfc30783200a2b6a0da1189d7de20a01f23c",
      integrity: "sha256-284cd3ba4880a60ba93b81c0be0dd15796b27a640ed697fdb1a18fe6b5ff30d9",
      skills: ["bootstrap-project"],
      mcpServers: [],
    };
    await writeMachineConfigFile(resolveMachineConfigPath(state.agentsDir), machine);

    expect(await scanInventoryReferences({ agentsDir: state.agentsDir, skillIds: ["bootstrap-project"] })).toEqual([]);
  });

  test.each([
    ["missing registered root", "missing"],
    ["malformed registered config", "malformed"],
  ] as const)("fails closed for a %s", async (_label, kind) => {
    const state = await fixture();
    const project = join(state.root, "project");
    if (kind === "malformed") {
      await mkdir(join(project, ".agents", "drwn"), { recursive: true });
      await writeFile(join(project, ".agents", "drwn", "config.json"), "not-json\n");
    }
    await registerProject(state.agentsDir, project);

    await expect(scanInventoryReferences({ agentsDir: state.agentsDir, skillIds: ["alpha"] })).rejects.toMatchObject({
      code: "INVENTORY_REFERENCE_SCAN_FAILED",
    });
  });
});
