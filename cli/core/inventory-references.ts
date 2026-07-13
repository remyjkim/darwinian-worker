// ABOUTME: Discovers explicit machine and project references to standalone inventory.
// ABOUTME: Fails closed when registered or supplied project roots cannot be verified.

import { access, lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { DrwnError } from "./errors";
import { readMachineConfigFile } from "./machine-config";
import { loadProjectConfig } from "./project";
import { listRegisteredProjects } from "./project-registry";
import { resolveMachineConfigPath } from "./store-paths";

export type InventoryReferenceKind = "skill" | "mcp";

export interface InventoryReference {
  kind: InventoryReferenceKind;
  id: string;
  surface: "machine" | "project";
  relation: "explicit-selection" | "include" | "exclude" | "mcp-toggle";
  sourcePath: string;
  projectRoot?: string;
}

export interface InventoryReferenceScanOptions {
  agentsDir: string;
  skillIds?: Iterable<string>;
  mcpIds?: Iterable<string>;
  projectRoots?: string[];
}

function scanFailed(path: string, error: unknown): DrwnError {
  return new DrwnError(
    "INVENTORY_REFERENCE_SCAN_FAILED",
    `Cannot verify standalone inventory references at ${path}`,
    ["Repair the project config or unregister a stale project before retrying."],
    error,
  );
}

async function validateProjectRoot(root: string) {
  try {
    const stats = await lstat(root);
    if (!stats.isDirectory()) throw new Error("project root is not a directory");
    await access(root);
  } catch (error) {
    throw scanFailed(root, error);
  }
}

export async function resolveInventoryReferenceRoots(agentsDir: string, explicitRoots: string[] = []) {
  let registered: string[];
  try {
    registered = await listRegisteredProjects(agentsDir);
  } catch (error) {
    throw scanFailed(`${agentsDir}/drwn/projects.json`, error);
  }
  return [...new Set([...registered, ...explicitRoots].map((root) => resolve(root)))].sort((a, b) => a.localeCompare(b));
}

export async function scanInventoryReferences(options: InventoryReferenceScanOptions): Promise<InventoryReference[]> {
  const skillIds = new Set(options.skillIds ?? []);
  const mcpIds = new Set(options.mcpIds ?? []);
  const references: InventoryReference[] = [];
  const machinePath = resolveMachineConfigPath(options.agentsDir);
  let machine;
  try {
    machine = await readMachineConfigFile(machinePath);
  } catch (error) {
    throw scanFailed(machinePath, error);
  }
  for (const id of machine?.capabilities.skills ?? []) {
    if (skillIds.has(id)) references.push({ kind: "skill", id, surface: "machine", relation: "explicit-selection", sourcePath: machinePath });
  }
  for (const id of machine?.capabilities.mcpServers ?? []) {
    if (mcpIds.has(id)) references.push({ kind: "mcp", id, surface: "machine", relation: "explicit-selection", sourcePath: machinePath });
  }

  for (const projectRoot of await resolveInventoryReferenceRoots(options.agentsDir, options.projectRoots)) {
    await validateProjectRoot(projectRoot);
    const configPath = `${projectRoot}/.agents/drwn/config.json`;
    let config;
    try {
      config = await loadProjectConfig(configPath);
    } catch (error) {
      throw scanFailed(configPath, error);
    }
    for (const id of config.skills?.include ?? []) {
      if (skillIds.has(id)) references.push({ kind: "skill", id, surface: "project", relation: "include", sourcePath: configPath, projectRoot });
    }
    for (const id of config.skills?.exclude ?? []) {
      if (skillIds.has(id)) references.push({ kind: "skill", id, surface: "project", relation: "exclude", sourcePath: configPath, projectRoot });
    }
    for (const [id, override] of Object.entries(config.mcpServers ?? {})) {
      if (mcpIds.has(id) && "enabled" in override && !("transport" in override)) {
        references.push({ kind: "mcp", id, surface: "project", relation: "mcp-toggle", sourcePath: configPath, projectRoot });
      }
    }
  }
  return references.sort((a, b) =>
    `${a.kind}:${a.id}:${a.surface}:${a.projectRoot ?? ""}:${a.relation}`.localeCompare(
      `${b.kind}:${b.id}:${b.surface}:${b.projectRoot ?? ""}:${b.relation}`,
    )
  );
}

export function assertInventoryUnreferenced(
  itemId: string,
  exportedIds: string[],
  references: InventoryReference[],
): void {
  if (references.length === 0) return;
  throw new DrwnError(
    "INVENTORY_ITEM_IN_USE",
    `Cannot remove ${itemId}; referenced inventory IDs: ${exportedIds.join(", ")}`,
    references.map((reference) =>
      `${reference.surface}${reference.projectRoot ? ` ${reference.projectRoot}` : ""}: ${reference.kind} ${reference.id} (${reference.relation})`
    ),
  );
}
