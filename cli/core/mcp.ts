// ABOUTME: Implements harness MCP filtering and target-specific rendering for all write surfaces.
// ABOUTME: Shared by bgng commands and the legacy sync-mcp compatibility wrapper.

import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { buildBgngMetaBlock, detectManagedFieldDrift, readBgngMetaBlock } from "./managed-fields";
import type { CanonicalConfig, CanonicalRegistry, RegistryServer } from "./types";

export function buildActiveServers(registry: CanonicalRegistry, config: CanonicalConfig) {
  if (config.defaults?.mcpServers) {
    const defaults = new Set(config.defaults.mcpServers);
    return Object.fromEntries(
      Object.entries(registry.servers).filter(([name, server]) =>
        defaults.has(name) && server.transport !== "platform-provided"
      ),
    );
  }

  const parallelMcpEnabled = config.parallel?.mcp?.enabled === true;

  return Object.fromEntries(
    Object.entries(registry.servers).filter(([name, server]) => {
      if (server.transport === "platform-provided") {
        return false;
      }
      if ((name === "parallel-search" || name === "parallel-task") && !parallelMcpEnabled) {
        return false;
      }
      if (!server.optional) {
        return true;
      }

      return config.optional[name] === true;
    }),
  );
}

function toJsonServerConfig(server: RegistryServer) {
  if (server.transport === "stdio") {
    return {
      command: server.command,
      ...(server.args ? { args: server.args } : {}),
      ...(server.env ? { env: server.env } : {}),
    };
  }

  return {
    type: server.transport,
    url: server.url,
  };
}

function toCodexServerConfig(server: RegistryServer) {
  if (server.transport === "stdio") {
    return {
      command: server.command,
      ...(server.args ? { args: server.args } : {}),
      startup_timeout_sec: server.startupTimeoutSec ?? 30,
    };
  }

  return {
    url: server.url,
    enabled: true,
  };
}

export function renderCursorConfig(servers: Record<string, RegistryServer>) {
  const mcpServers = Object.fromEntries(
    Object.entries(servers).map(([name, server]) => [name, toJsonServerConfig(server)]),
  );

  return `${JSON.stringify({ mcpServers }, null, 2)}\n`;
}

export function mergeClaudeSettingsText(currentText: string, servers: Record<string, RegistryServer>, options?: { force?: boolean }) {
  const parsed = JSON.parse(currentText) as Record<string, unknown>;
  const meta = readBgngMetaBlock(parsed);
  const managedKeys = meta?.managedKeys ?? ["mcpServers"];
  const recordedHashes = meta?.fieldHashes ?? {};
  const driftedKeys = options?.force ? [] : detectManagedFieldDrift(parsed, managedKeys, recordedHashes);
  if (driftedKeys.length > 0) {
    throw new Error(
      `Drift detected in Claude settings managed field(s): ${driftedKeys.join(", ")}. Move your change into .agents/bgng/config.json or rerun bgng write --force to overwrite.`,
    );
  }

  parsed.mcpServers = Object.fromEntries(
    Object.entries(servers).map(([name, server]) => [name, toJsonServerConfig(server)]),
  );
  const nextMeta = buildBgngMetaBlock(["mcpServers"], { mcpServers: parsed.mcpServers });
  if (meta && meta.fieldHashes?.mcpServers === nextMeta.fieldHashes?.mcpServers) {
    nextMeta.lastWriteAt = meta.lastWriteAt;
  }
  parsed._bgng = nextMeta;

  return `${JSON.stringify(parsed, null, 2)}\n`;
}

function stripTomlSections(currentText: string, sectionPrefix: string) {
  const lines = currentText.split(/\r?\n/);
  const kept: string[] = [];
  let skipping = false;

  for (const line of lines) {
    const match = line.trim().match(/^\[([^\]]+)\]$/);
    if (match) {
      const sectionName = match[1] ?? "";
      skipping = sectionName === sectionPrefix || sectionName.startsWith(`${sectionPrefix}.`);
      if (!skipping) {
        kept.push(line);
      }
      continue;
    }

    if (!skipping) {
      kept.push(line);
    }
  }

  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

export function mergeCodexTomlText(currentText: string, servers: Record<string, RegistryServer>) {
  parseToml(currentText);

  const stripped = stripTomlSections(currentText, "mcp_servers");
  const mcpBlock = stringifyToml({
    mcp_servers: Object.fromEntries(
      Object.entries(servers).map(([name, server]) => [name, toCodexServerConfig(server)]),
    ),
  }).trimEnd();

  const merged = stripped.length > 0 ? `${stripped}\n\n${mcpBlock}\n` : `${mcpBlock}\n`;
  parseToml(merged);

  return merged;
}
