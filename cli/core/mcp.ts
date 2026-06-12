// ABOUTME: Implements harness MCP filtering and target-specific rendering for all write surfaces.
// ABOUTME: Shared by drwn commands and the legacy sync-mcp compatibility wrapper.

import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { hasExplicitMcpDefaults } from "./defaults";
import { buildDrwnMetaBlock, canonicalJsonHash, detectManagedFieldDrift, readDrwnMetaBlock } from "./managed-fields";
import type { CanonicalConfig, CanonicalRegistry, RegistryServer } from "./types";

export interface ClaudeCommandHook {
  type: "command";
  command: string;
  args?: string[];
  timeout?: number;
  statusMessage?: string;
}

export interface ClaudeHookMatcher {
  matcher: string;
  hooks: ClaudeCommandHook[];
}

export interface ClaudeHooksConfig {
  PreToolUse?: ClaudeHookMatcher[];
  PostToolUse?: ClaudeHookMatcher[];
}

export function buildActiveServers(registry: CanonicalRegistry, config: CanonicalConfig) {
  if (hasExplicitMcpDefaults(config)) {
    const defaults = new Set(config.defaults?.mcpServers ?? []);
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

// Matches a value that is exactly an env-var reference, e.g. "${NOTION_TOKEN}".
const ENV_PASSTHROUGH = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/;

// Codex does not interpolate ${VAR} in config values. A whole-value passthrough is
// forwarded by name via env_vars (sourced from Codex's own environment); anything else
// is a literal value emitted into the server's env table.
function partitionCodexEnv(env: Record<string, string> | undefined) {
  const envVars: string[] = [];
  let literalEnv: Record<string, string> | undefined;
  for (const [key, value] of Object.entries(env ?? {})) {
    const passthroughName = value.match(ENV_PASSTHROUGH)?.[1];
    if (passthroughName) {
      envVars.push(passthroughName);
    } else {
      literalEnv ??= {};
      literalEnv[key] = value;
    }
  }
  return { envVars, literalEnv };
}

// Cursor expands ${env:NAME}, not bare ${NAME}. Rewrite every env-var reference accordingly.
function toCursorEnvValue(value: string) {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, "${env:$1}");
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

function toCursorServerConfig(server: RegistryServer) {
  if (server.transport === "stdio") {
    return {
      command: server.command,
      ...(server.args ? { args: server.args } : {}),
      ...(server.env
        ? {
            env: Object.fromEntries(
              Object.entries(server.env).map(([key, value]) => [key, toCursorEnvValue(value)]),
            ),
          }
        : {}),
    };
  }

  return {
    type: server.transport,
    url: server.url,
  };
}

function toCodexServerConfig(server: RegistryServer) {
  if (server.transport === "stdio") {
    const { envVars, literalEnv } = partitionCodexEnv(server.env);
    return {
      command: server.command,
      ...(server.args ? { args: server.args } : {}),
      startup_timeout_sec: server.startupTimeoutSec ?? 30,
      ...(envVars.length > 0 ? { env_vars: envVars } : {}),
      ...(literalEnv ? { env: literalEnv } : {}),
    };
  }

  return {
    url: server.url,
    enabled: true,
  };
}

export function renderJsonMcpConfig(servers: Record<string, RegistryServer>) {
  const mcpServers = Object.fromEntries(
    Object.entries(servers).map(([name, server]) => [name, toJsonServerConfig(server)]),
  );

  return `${JSON.stringify({ mcpServers }, null, 2)}\n`;
}

export function renderCursorConfig(servers: Record<string, RegistryServer>) {
  const mcpServers = Object.fromEntries(
    Object.entries(servers).map(([name, server]) => [name, toCursorServerConfig(server)]),
  );

  return `${JSON.stringify({ mcpServers }, null, 2)}\n`;
}

export const CLAUDE_MCP_SERVER_HASH_PREFIX = "mcpServers:";

export function claudeMcpServerHashKey(name: string) {
  return `${CLAUDE_MCP_SERVER_HASH_PREFIX}${name}`;
}

export function ownedClaudeMcpServerNames(fieldHashes: Record<string, string>) {
  return Object.keys(fieldHashes)
    .filter((key) => key.startsWith(CLAUDE_MCP_SERVER_HASH_PREFIX))
    .map((key) => key.slice(CLAUDE_MCP_SERVER_HASH_PREFIX.length));
}

function readClaudeMcpServers(parsed: Record<string, unknown>) {
  return (
    parsed.mcpServers && typeof parsed.mcpServers === "object" && !Array.isArray(parsed.mcpServers)
      ? parsed.mcpServers
      : {}
  ) as Record<string, unknown>;
}

export function hashClaudeManagedServers(currentText: string, names: string[]): Record<string, string> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(currentText) as Record<string, unknown>;
  } catch {
    return {};
  }
  const servers = readClaudeMcpServers(parsed);
  return Object.fromEntries(
    names.map((name) => {
      const value = servers[name];
      return [claudeMcpServerHashKey(name), value === undefined ? "absent" : canonicalJsonHash(value)];
    }),
  );
}

export interface MergeClaudeSettingsOptions {
  force?: boolean;
  hooks?: ClaudeHooksConfig;
  inlineMeta?: boolean;
  mcpServerOwnership?: "field" | "per-server" | "none";
  priorFieldHashes?: Record<string, string>;
}

export interface MergeClaudeSettingsResult {
  text: string;
  fieldHashes: Record<string, string>;
}

export function mergeClaudeSettingsText(
  currentText: string,
  servers: Record<string, RegistryServer>,
  options: MergeClaudeSettingsOptions = {},
): MergeClaudeSettingsResult {
  const inlineMeta = options.inlineMeta ?? true;
  const mcpServerOwnership = options.mcpServerOwnership ?? "field";
  const parsed = JSON.parse(currentText) as Record<string, unknown>;
  const meta = inlineMeta ? readDrwnMetaBlock(parsed) : null;
  const recordedHashes = inlineMeta ? (meta?.fieldHashes ?? {}) : (options.priorFieldHashes ?? {});
  const managesMcp = mcpServerOwnership !== "none";
  const previouslyManagedKeys = meta?.managedKeys ?? (managesMcp ? ["mcpServers"] : []);
  const shouldManageHooks = options.hooks !== undefined || previouslyManagedKeys.includes("hooks");
  const managedKeys = [
    ...(managesMcp ? ["mcpServers"] : []),
    ...(shouldManageHooks ? ["hooks"] : []),
  ];
  const fieldHashes: Record<string, string> = {};

  if (mcpServerOwnership === "per-server") {
    const currentServers = readClaudeMcpServers(parsed);
    const desiredServers = Object.fromEntries(
      Object.entries(servers).map(([name, server]) => [name, toJsonServerConfig(server)]),
    );

    const driftedServers = options.force
      ? []
      : ownedClaudeMcpServerNames(recordedHashes).filter((name) => {
          const priorHash = recordedHashes[claudeMcpServerHashKey(name)];
          const currentValue = currentServers[name];
          if (currentValue === undefined) {
            return name in desiredServers;
          }
          return Boolean(priorHash && canonicalJsonHash(currentValue) !== priorHash);
        });
    if (driftedServers.length > 0) {
      throw new Error(
        `Drift detected in Claude settings managed MCP server(s): ${driftedServers.join(", ")}. Rerun drwn write --root --force to overwrite.`,
      );
    }

    for (const name of ownedClaudeMcpServerNames(recordedHashes)) {
      if (!(name in desiredServers)) {
        delete currentServers[name];
      }
    }
    for (const [name, value] of Object.entries(desiredServers)) {
      currentServers[name] = value;
      fieldHashes[claudeMcpServerHashKey(name)] = canonicalJsonHash(value);
    }
    parsed.mcpServers = currentServers;
  } else if (mcpServerOwnership === "field") {
    const driftedKeys = options.force ? [] : detectManagedFieldDrift(parsed, managedKeys, recordedHashes);
    if (driftedKeys.length > 0) {
      throw new Error(
        `Drift detected in Claude settings managed field(s): ${driftedKeys.join(", ")}. Move your change into .agents/drwn/config.json or rerun drwn write --force to overwrite.`,
      );
    }

    parsed.mcpServers = Object.fromEntries(
      Object.entries(servers).map(([name, server]) => [name, toJsonServerConfig(server)]),
    );
  }

  if (shouldManageHooks) {
    if (options.hooks !== undefined) {
      parsed.hooks = options.hooks;
    } else {
      delete parsed.hooks;
    }
  }

  const nextValues: Record<string, unknown> = {};
  if (managesMcp) {
    nextValues.mcpServers = parsed.mcpServers;
  }
  if (shouldManageHooks) {
    nextValues.hooks = parsed.hooks ?? null;
  }

  if (mcpServerOwnership === "field") {
    for (const key of managedKeys) {
      fieldHashes[key] = canonicalJsonHash(nextValues[key]);
    }
  } else if (shouldManageHooks) {
    fieldHashes.hooks = canonicalJsonHash(nextValues.hooks);
  }

  if (inlineMeta) {
    const nextMeta = buildDrwnMetaBlock(managedKeys, nextValues);
    const hashesUnchanged = managedKeys.every((key) => meta?.fieldHashes?.[key] === nextMeta.fieldHashes?.[key]);
    if (meta && hashesUnchanged) {
      nextMeta.lastWriteAt = meta.lastWriteAt;
    }
    parsed._drwn = nextMeta;
  } else {
    delete parsed._drwn;
  }

  return { text: `${JSON.stringify(parsed, null, 2)}\n`, fieldHashes };
}

// Strips only the [mcp_servers.<name>] tables (and their subtables) for the given server
// names, leaving non-MCP sections and user-authored servers untouched.
function stripCodexServerSections(currentText: string, names: Iterable<string>) {
  const managed = new Set(names);
  const lines = currentText.split(/\r?\n/);
  const kept: string[] = [];
  let skipping = false;

  for (const line of lines) {
    const match = line.trim().match(/^\[([^\]]+)\]$/);
    if (match) {
      const sectionName = match[1] ?? "";
      const serverName = sectionName.startsWith("mcp_servers.")
        ? sectionName.slice("mcp_servers.".length).split(".")[0]
        : undefined;
      skipping = serverName !== undefined && managed.has(serverName);
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

export function mergeCodexTomlText(
  currentText: string,
  servers: Record<string, RegistryServer>,
  previousManagedNames: string[] = [],
) {
  parseToml(currentText);

  const namesToStrip = new Set([...previousManagedNames, ...Object.keys(servers)]);
  const stripped = stripCodexServerSections(currentText, namesToStrip);
  const mcpBlock = stringifyToml({
    mcp_servers: Object.fromEntries(
      Object.entries(servers).map(([name, server]) => [name, toCodexServerConfig(server)]),
    ),
  }).trimEnd();

  const hasManaged = Object.keys(servers).length > 0;
  const merged = stripped.length > 0
    ? hasManaged
      ? `${stripped}\n\n${mcpBlock}\n`
      : `${stripped}\n`
    : `${mcpBlock}\n`;
  parseToml(merged);

  return merged;
}

// Hashes each managed Codex server's effective value as written, so drift on a drwn-owned
// server can be detected later without flagging user-authored servers.
export function hashCodexManagedServers(mergedText: string, names: string[]): Record<string, string> {
  let parsed: { mcp_servers?: Record<string, unknown> };
  try {
    parsed = parseToml(mergedText) as { mcp_servers?: Record<string, unknown> };
  } catch {
    return {};
  }
  const servers = parsed.mcp_servers ?? {};
  return Object.fromEntries(
    names.map((name) => {
      const value = servers[name];
      return [name, value === undefined ? "absent" : canonicalJsonHash(value)];
    }),
  );
}

// Codex deep-merges same-named [mcp_servers.X] tables across the global (~/.codex) and
// project (.codex) layers. If the global layer defines a managed server with a different
// transport, the merged table ends up with both `command` and `url`, which Codex rejects.
// Returns the names of managed servers that collide with a different transport in globalText.
export function detectCodexLayerConflicts(
  globalText: string,
  servers: Record<string, RegistryServer>,
): string[] {
  if (!globalText.trim()) {
    return [];
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = parseToml(globalText) as Record<string, unknown>;
  } catch {
    return [];
  }

  const globalServers = (parsed.mcp_servers ?? {}) as Record<string, { command?: unknown; url?: unknown }>;
  const conflicts: string[] = [];
  for (const [name, server] of Object.entries(servers)) {
    const globalEntry = globalServers[name];
    if (!globalEntry) {
      continue;
    }
    const globalIsStdio = typeof globalEntry.command === "string";
    const globalIsHttp = typeof globalEntry.url === "string";
    const localIsStdio = server.transport === "stdio";
    if ((localIsStdio && globalIsHttp) || (!localIsStdio && globalIsStdio)) {
      conflicts.push(name);
    }
  }
  return conflicts;
}
