// ABOUTME: Resolves cards-era store paths under ~/.agents/bgng.
// ABOUTME: Keeps store layout decisions separate from legacy path helpers.

import { join } from "node:path";

export function resolveStoreRoot(agentsDir: string) {
  return join(agentsDir, "bgng");
}

export function resolveStoreMetadataPath(agentsDir: string) {
  return join(resolveStoreRoot(agentsDir), "store.json");
}

export function resolveMachineConfigPath(agentsDir: string) {
  return join(resolveStoreRoot(agentsDir), "machine.json");
}

export function resolveCardsRoot(agentsDir: string) {
  return join(resolveStoreRoot(agentsDir), "cards");
}

function assertSafePathPart(value: string, label: string) {
  if (!value || value.includes("..") || value.includes("\\") || value.startsWith("/") || value.startsWith(".")) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

export function splitCardName(name: string) {
  if (name.startsWith("@")) {
    const [scope, cardName, ...rest] = name.split("/");
    if (!scope || !cardName || rest.length > 0) {
      throw new Error(`Invalid card name: ${name}`);
    }
    assertSafePathPart(scope, "card scope");
    assertSafePathPart(cardName, "card name");
    return [scope, cardName];
  }
  assertSafePathPart(name, "card name");
  return [name];
}

export function resolveCardPackageDir(agentsDir: string, name: string) {
  return join(resolveCardsRoot(agentsDir), ...splitCardName(name));
}

export function resolveCardVersionDir(agentsDir: string, name: string, version: string) {
  assertSafePathPart(version, "card version");
  return join(resolveCardPackageDir(agentsDir, name), version);
}

export function resolveSourcesRoot(agentsDir: string) {
  return join(resolveStoreRoot(agentsDir), "sources");
}

export function resolveCardSourceDir(agentsDir: string, name: string) {
  return join(resolveSourcesRoot(agentsDir), ...splitCardName(name));
}

export function resolveStoreSkillsRoot(agentsDir: string) {
  return join(resolveStoreRoot(agentsDir), "skills");
}

export const resolveStoreSkillPackagesRoot = resolveStoreSkillsRoot;

export function resolveStoreSkillPackageRoot(agentsDir: string, packageName: string) {
  return join(resolveStoreSkillsRoot(agentsDir), ...packageName.split("/").filter(Boolean));
}

export function resolveStoreSkillPackageVersionRoot(agentsDir: string, packageName: string, version: string) {
  assertSafePathPart(version, "skill package version");
  return join(resolveStoreSkillPackageRoot(agentsDir, packageName), version);
}

export function resolveStoreSkillPackageCurrentLink(agentsDir: string, packageName: string) {
  return join(resolveStoreSkillPackageRoot(agentsDir, packageName), "current");
}

export function resolveStoreMcpServersDir(agentsDir: string) {
  return join(resolveStoreRoot(agentsDir), "mcp-servers");
}

export function resolveStoreMcpServerFile(agentsDir: string, serverId: string) {
  assertSafePathPart(serverId, "MCP server id");
  if (serverId.includes("/")) {
    throw new Error(`Invalid MCP server id: ${serverId}`);
  }
  return join(resolveStoreMcpServersDir(agentsDir), `${serverId}.json`);
}

export function resolveStoreGeneratedDir(agentsDir: string) {
  return join(resolveStoreRoot(agentsDir), "generated");
}

export function resolveStoreCacheDir(agentsDir: string) {
  return join(resolveStoreRoot(agentsDir), "cache");
}

export function resolveGlobalWriteRecordPath(agentsDir: string) {
  return join(resolveStoreRoot(agentsDir), "global-write-record.json");
}
