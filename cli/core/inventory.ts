// ABOUTME: Defines typed views over drwn-managed standalone machine inventory.
// ABOUTME: Separates mutable package/MCP records from immutable repository, registry, and Card inputs.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { loadMcpLibrary } from "./mcp-library";
import { hashSkillPackageDirectory, listInstalledSkillBundles } from "./skill-packages";
import { resolveStoreMcpServerFile } from "./store-paths";
import type { RegistryServer } from "./types";

export interface StandaloneSkillPackageRecord {
  kind: "skill-package";
  packageName: string;
  activeVersion: string;
  packageRoot: string;
  versionRoot: string;
  exportedSkillIds: string[];
  integrity: `sha256-${string}`;
}

export interface StandaloneMcpRecord {
  kind: "mcp";
  id: string;
  path: string;
  server: RegistryServer;
  integrity: `sha256-${string}`;
}

export async function listStandaloneSkillPackages(agentsDir: string): Promise<StandaloneSkillPackageRecord[]> {
  return Promise.all((await listInstalledSkillBundles(agentsDir)).map(async (bundle) => ({
    kind: "skill-package" as const,
    packageName: bundle.packageName,
    activeVersion: bundle.activeVersion,
    packageRoot: bundle.packageRoot,
    versionRoot: bundle.versionRoot,
    exportedSkillIds: bundle.manifest.skills.map((skill) => skill.name).sort(),
    integrity: await hashSkillPackageDirectory(bundle.versionRoot),
  })));
}

export async function findStandaloneSkillPackageByName(agentsDir: string, packageName: string) {
  const packages = await listStandaloneSkillPackages(agentsDir);
  return packages.find((entry) => entry.packageName === packageName) ?? null;
}

export async function findStandaloneSkillPackageBySkillId(agentsDir: string, skillId: string) {
  const packages = await listStandaloneSkillPackages(agentsDir);
  return packages.find((entry) => entry.exportedSkillIds.includes(skillId)) ?? null;
}

export async function listStandaloneMcpRecords(agentsDir: string): Promise<StandaloneMcpRecord[]> {
  const library = await loadMcpLibrary(agentsDir);
  const records: StandaloneMcpRecord[] = [];
  for (const [id, server] of Object.entries(library.servers).sort(([a], [b]) => a.localeCompare(b))) {
    const path = resolveStoreMcpServerFile(agentsDir, id);
    const bytes = await readFile(path);
    records.push({
      kind: "mcp",
      id,
      path,
      server,
      integrity: `sha256-${createHash("sha256").update(bytes).digest("hex")}`,
    });
  }
  return records;
}

export async function findStandaloneMcpRecord(agentsDir: string, id: string) {
  return (await listStandaloneMcpRecords(agentsDir)).find((entry) => entry.id === id) ?? null;
}
