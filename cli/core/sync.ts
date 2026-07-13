// ABOUTME: Orchestrates MCP and skill syncing using the extracted core modules.
// ABOUTME: Shared by the Clipanion commands and the legacy sync-mcp compatibility wrapper.

import { existsSync, readlinkSync, rmSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expandHomePath, resolveToolPaths } from "./paths";
import {
  CLAUDE_MCP_SERVER_HASH_PREFIX,
  codexUnsupportedHeaderKeys,
  hashCodexManagedServers,
  mergeClaudeSettingsText,
  mergeCodexTomlText,
  ownedClaudeMcpServerNames,
  renderCursorConfig,
  renderJsonMcpConfig,
} from "./mcp";
import { syncSkills as syncSkillsCore } from "./skills";
import { syncHooks } from "./hook-generator/sync-hooks";
import { syncWorkers } from "./worker-generator/sync-worker";
import { ensureParentDir, lstatSafe, realpathSafe } from "./fs";
import { backupExistingPath, writeManagedFile } from "./managed-file";
import {
  diffWriteRecord,
  hashManagedContent,
  hashManagedDirectory,
  loadWriteRecord,
  saveWriteRecord,
  type ManagedPath,
} from "./write-record";
import { assertAmbientMcpPreflight, buildEffectiveState, recomputeContentRootsByCard } from "./effective-state";
import { computeOptionalMcpReport } from "./mcp-report";
import { reconcileVendorTrees } from "./vendor-reconcile";
import { DRWN_VERSION } from "./version";
import { canonicalJsonHash } from "./managed-fields";
import type {
  CanonicalConfig,
  NormalizedSyncOptions,
  RegistryServer,
  SyncOptions,
  SyncResult,
  TargetName,
} from "./types";

async function readTextIfExists(pathValue: string, fallback: string) {
  try {
    return await readFile(pathValue, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

function uniqueManagedPaths(paths: ManagedPath[]) {
  const map = new Map<string, ManagedPath>();
  for (const path of paths) {
    map.set(path.path, path);
  }
  return [...map.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function managedPathToAbsolute(scopeRoot: string, pathValue: string) {
  return join(scopeRoot, pathValue);
}

type ManagedFieldsPath = Extract<ManagedPath, { kind: "managed-fields" }>;

function hasClaudePerServerHashes(entry: ManagedFieldsPath) {
  return Object.keys(entry.fieldHashes).some((key) => key.startsWith(CLAUDE_MCP_SERVER_HASH_PREFIX));
}

function isCodexMcpEntry(entry: ManagedFieldsPath) {
  return entry.path.endsWith(".codex/config.toml");
}

export function cleanupRemovedManagedPaths(scopeRoot: string, previous: ManagedPath[], dryRun: boolean, result: SyncResult) {
  for (const entry of previous) {
    const absolutePath = managedPathToAbsolute(scopeRoot, entry.path);
    if (!existsSync(absolutePath) && lstatSafe(absolutePath) === null) {
      continue;
    }
    if (entry.kind === "managed-content") {
      if (hashManagedContent(readFileSync(absolutePath)) === entry.contentHash) {
        result.changes.push(`remove ${absolutePath}`);
        if (!dryRun) {
          rmSync(absolutePath, { recursive: true, force: true });
        }
        continue;
      }
      result.warnings.push(`preserved user-owned path: ${absolutePath}`);
      continue;
    }
    if (entry.kind === "managed-directory") {
      const stats = lstatSafe(absolutePath);
      if (stats?.isDirectory() && hashManagedDirectory(absolutePath) === entry.contentHash) {
        result.changes.push(`remove ${absolutePath}`);
        if (!dryRun) {
          rmSync(absolutePath, { recursive: true, force: true });
        }
        continue;
      }
      result.warnings.push(`preserved user-owned path: ${absolutePath}`);
      continue;
    }
    if (entry.kind === "managed-fields" && hasClaudePerServerHashes(entry)) {
      const text = readFileSync(absolutePath, "utf8");
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(text) as Record<string, unknown>;
      } catch {
        result.warnings.push(`preserved user-owned path: ${absolutePath}`);
        continue;
      }
      const mcpServers = (
        parsed.mcpServers && typeof parsed.mcpServers === "object" && !Array.isArray(parsed.mcpServers)
          ? parsed.mcpServers
          : {}
      ) as Record<string, unknown>;
      let changed = false;
      let drifted = false;
      for (const name of ownedClaudeMcpServerNames(entry.fieldHashes)) {
        const currentValue = mcpServers[name];
        if (currentValue === undefined) {
          continue;
        }
        const priorHash = entry.fieldHashes[`${CLAUDE_MCP_SERVER_HASH_PREFIX}${name}`];
        if (priorHash && canonicalJsonHash(currentValue) === priorHash) {
          delete mcpServers[name];
          changed = true;
        } else {
          drifted = true;
        }
      }
      if (drifted) {
        result.warnings.push(`preserved user-owned path: ${absolutePath}`);
      }
      if (changed) {
        parsed.mcpServers = mcpServers;
        writeManagedFile(absolutePath, `${JSON.stringify(parsed, null, 2)}\n`, dryRun, result);
      }
      continue;
    }
    if (entry.kind === "managed-fields" && isCodexMcpEntry(entry) && Object.keys(entry.fieldHashes).length > 0) {
      const current = readFileSync(absolutePath, "utf8");
      const next = mergeCodexTomlText(current, {}, Object.keys(entry.fieldHashes));
      writeManagedFile(absolutePath, next, dryRun, result);
      continue;
    }
    if (entry.kind === "symlink" || entry.kind === "generated-symlink") {
      const stats = lstatSafe(absolutePath);
      const expectedTarget = entry.kind === "symlink" ? entry.target : entry.generatedPath;
      const linkTarget = stats?.isSymbolicLink() ? readlinkSync(absolutePath) : null;
      if (
        stats?.isSymbolicLink() &&
        (realpathSafe(absolutePath) === realpathSafe(expectedTarget) || linkTarget === expectedTarget)
      ) {
        result.changes.push(`remove ${absolutePath}`);
        if (!dryRun) {
          rmSync(absolutePath, { recursive: true, force: true });
        }
        continue;
      }
    }
    result.warnings.push(`preserved user-owned path: ${absolutePath}`);
  }
}

export function verifyManagedPaths(
  scopeRoot: string,
  previous: ManagedPath[],
  options?: { force?: boolean; lockedCards?: import("./card-lock").CardLockEntry[] },
) {
  if (options?.force) {
    return;
  }
  for (const entry of previous) {
    if (entry.kind === "managed-fields" && isCodexMcpEntry(entry) && Object.keys(entry.fieldHashes).length > 0) {
      const absolutePath = managedPathToAbsolute(scopeRoot, entry.path);
      if (!existsSync(absolutePath)) {
        continue;
      }
      const names = Object.keys(entry.fieldHashes);
      const currentHashes = hashCodexManagedServers(readFileSync(absolutePath, "utf8"), names);
      const drifted = names.filter((name) => currentHashes[name] !== entry.fieldHashes[name]);
      if (drifted.length > 0) {
        throw new Error(
          `Refusing to overwrite managed Codex MCP drift for ${drifted.join(", ")} at ${absolutePath}. Rerun drwn write --force to overwrite.`,
        );
      }
      continue;
    }
    if (entry.kind !== "managed-content") {
      if (entry.kind === "managed-directory") {
        const absolutePath = managedPathToAbsolute(scopeRoot, entry.path);
        if (!existsSync(absolutePath)) {
          continue;
        }
        const stats = lstatSafe(absolutePath);
        if (stats?.isDirectory() && hashManagedDirectory(absolutePath) !== entry.contentHash) {
          const signpost = driftSignpostForPath(entry.path, options?.lockedCards ?? []);
          throw new Error(
            `Refusing to overwrite managed directory drift at ${absolutePath}. ${signpost}`,
          );
        }
      }
      continue;
    }
    const absolutePath = managedPathToAbsolute(scopeRoot, entry.path);
    if (!existsSync(absolutePath)) {
      continue;
    }
    const currentHash = hashManagedContent(readFileSync(absolutePath));
    if (currentHash !== entry.contentHash) {
      const signpost = driftSignpostForPath(entry.path, options?.lockedCards ?? []);
      throw new Error(
        `Refusing to overwrite managed content drift at ${absolutePath}. ${signpost}`,
      );
    }
  }
}

function driftSignpostForPath(relPath: string, lockedCards: import("./card-lock").CardLockEntry[]) {
  if (relPath.includes("vendor/")) {
    return "Edit the card source, not vendor/. Run drwn card fork → edit → publish → update, or drwn card source sync when upstream is configured.";
  }
  for (const card of lockedCards) {
    for (const [skill, upstreamRef] of Object.entries(card.manifest.skills?.upstream ?? {})) {
      if (relPath.includes(skill)) {
        return `Edit upstream ${upstreamRef} (or run drwn card source sync ${card.name}), then drwn write.`;
      }
    }
  }
  const override = lockedCards.find((card) => card.origin === "file");
  if (override) {
    return `Edit linked source at ${override.path}, then drwn write.`;
  }
  return "Run drwn card fork → edit → publish → update, then drwn write — never edit vendored projection output directly.";
}

export async function syncMcp(
  options: NormalizedSyncOptions,
  config: CanonicalConfig,
  servers: Record<string, RegistryServer>,
  previousManagedPaths: ManagedPath[] = [],
  ownedServerNames: string[] = [],
): Promise<SyncResult> {
  const managedPaths: ManagedPath[] = [];
  const result: SyncResult = { changes: [], warnings: [], managedPaths };
  const toolRoot = options.toolRoot ?? options.homeDir;
  const toolPaths = resolveToolPaths(toolRoot);
  const generatedDir = options.generatedDir ?? join(options.agentsDir, "generated");
  const serverCount = Object.keys(servers).length;
  const previousClaude = previousManagedPaths.find(
    (entry): entry is ManagedFieldsPath =>
      entry.kind === "managed-fields" && entry.path === ".claude.json" && hasClaudePerServerHashes(entry),
  );
  const previousClaudeHashes = previousClaude?.kind === "managed-fields" ? previousClaude.fieldHashes : {};
  const previousCodexNames = previousManagedPaths
    .filter((entry): entry is ManagedFieldsPath => entry.kind === "managed-fields" && isCodexMcpEntry(entry))
    .flatMap((entry) => (entry.kind === "managed-fields" ? Object.keys(entry.fieldHashes) : []));
  const codexManagedNames = [...new Set([...previousCodexNames, ...ownedServerNames.filter((name) => name in servers)])];
  const hasPriorMcpOwnership = previousManagedPaths.some((entry) =>
    (entry.kind === "managed-fields" && hasClaudePerServerHashes(entry)) ||
    (entry.kind === "managed-fields" && isCodexMcpEntry(entry)) ||
    entry.kind === "generated-symlink"
  );

  if (options.writeScope === "machine" && serverCount === 0 && !hasPriorMcpOwnership) {
    result.warnings.push(
      "drwn write --root: no machine-default MCP servers configured. Add servers with `drwn library defaults add mcp <name>` first.",
    );
    return result;
  }

  const targetConfigPath = (targetName: TargetName, target: { configPath: string; userMcpPath?: string }) => {
    if (options.writeScope === "project") {
      if (targetName === "claude") return toolPaths.claudeMcp;
      if (targetName === "codex") return toolPaths.codexConfig;
      return toolPaths.cursorMcp;
    }
    return expandHomePath(targetName === "claude" ? (target.userMcpPath ?? target.configPath) : target.configPath, options.homeDir);
  };

  const selectedTargets = (Object.keys(config.targets) as TargetName[]).filter((name) => {
    if (options.target && options.target !== name) {
      return false;
    }
    return config.targets[name].enabled;
  });

  for (const targetName of selectedTargets) {
    const target = config.targets[targetName];
    const configPath = targetConfigPath(targetName, target);

    if (targetName === "claude") {
      if (options.writeScope === "project") {
        const content = renderJsonMcpConfig(servers);
        writeManagedFile(configPath, content, options.dryRun, result);
        managedPaths.push({ path: ".mcp.json", kind: "managed-content", contentHash: hashManagedContent(content) });
        continue;
      }

      const current = await readTextIfExists(configPath, "{}\n");
      const merged = mergeClaudeSettingsText(current, servers, {
        inlineMeta: false,
        mcpServerOwnership: "per-server",
        priorFieldHashes: previousClaudeHashes,
        force: options.force ?? false,
      });
      writeManagedFile(configPath, merged.text, options.dryRun, result);
      if (Object.keys(merged.fieldHashes).length > 0) {
        managedPaths.push({
          path: ".claude.json",
          kind: "managed-fields",
          fields: Object.keys(merged.fieldHashes),
          fieldHashes: merged.fieldHashes,
        });
      }
      continue;
    }

    if (targetName === "codex") {
      for (const [name, server] of Object.entries(servers)) {
        const unsupported = codexUnsupportedHeaderKeys(server);
        if (unsupported.length > 0) {
          result.warnings.push(
            `Codex MCP server "${name}" declares header(s) ${unsupported.join(", ")} using \${VAR} interpolation, which Codex cannot resolve; they were omitted from .codex/config.toml. Use an "Authorization: Bearer \${VAR}" header (mapped to bearer_token_env_var) or a literal value.`,
          );
        }
      }
      const current = await readTextIfExists(configPath, "");
      const mergedCodex = mergeCodexTomlText(current, servers, codexManagedNames);
      writeManagedFile(configPath, mergedCodex, options.dryRun, result);
      const fieldHashes = hashCodexManagedServers(mergedCodex, Object.keys(servers));
      if (Object.keys(fieldHashes).length > 0) {
        managedPaths.push({ path: ".codex/config.toml", kind: "managed-fields", fields: Object.keys(fieldHashes), fieldHashes });
      }
      continue;
    }

    if (targetName === "cursor") {
      if (Object.keys(servers).length === 0) {
        continue;
      }
      const content = renderCursorConfig(servers);
      const existing = lstatSafe(configPath);
      if (existing?.isSymbolicLink() && !options.dryRun) {
        rmSync(configPath, { force: true });
      }
      writeManagedFile(configPath, content, options.dryRun, result);
      // One-time cleanup of the pre-de-symlink generated artifact.
      if (!options.dryRun) {
        rmSync(join(generatedDir, "cursor-mcp.json"), { force: true });
      }
      managedPaths.push({ path: ".cursor/mcp.json", kind: "managed-content", contentHash: hashManagedContent(content) });
    }
  }

  return result;
}

export async function syncRepository(options: SyncOptions = {}): Promise<SyncResult> {
  const state = await buildEffectiveState(options);
  const ambientCollisions = assertAmbientMcpPreflight(state);
  const result: SyncResult = { changes: [], warnings: [], managedPaths: [], ambientCollisions };
  result.optionalMcpReport = state.normalized.skillsOnly
    ? null
    : computeOptionalMcpReport({
        lockedCards: state.lockedCards,
        activeServers: state.activeServers,
        effectiveRegistry: state.effectiveRegistry,
        projectConfigPath: state.projectConfigPath,
        projectServerOverrides: state.projectConfig?.mcpServers,
      });
  result.warnings.push(...state.overlayWarnings);
  result.warnings.push(
    ...ambientCollisions
      .filter((collision) => collision.disposition !== "identical")
      .map((collision) =>
        `${collision.reasonCode}: ${collision.target} MCP server "${collision.id}" has a ${collision.disposition} ${collision.ambient.source}-scope collision at ${collision.ambient.path}. ${collision.remediation ?? ""}`.trim()
      ),
  );
  const cardModes: NonNullable<SyncResult["cardModes"]> = {};
  for (const [name, mode] of Object.entries(state.cardModes)) {
    cardModes[name] = {
      mode: mode.mode,
      reason: mode.reason,
      lane: state.cardLanes[name] ?? "committed",
      ...(mode.sourcePath ? { sourcePath: mode.sourcePath } : {}),
    };
  }
  result.cardModes = cardModes;
  const previousRecord = loadWriteRecord(state.recordPath);
  verifyManagedPaths(state.scopeRoot, previousRecord?.managedPaths ?? [], {
    force: state.normalized.force ?? false,
    lockedCards: state.lockedCards,
  });

  if (state.projectRoot && !state.normalized.dryRun) {
    const { ensureGitignoreEntries, ensureVendorGitattributes } = await import("./git-hygiene");
    await ensureGitignoreEntries(state.projectRoot);
    await ensureVendorGitattributes(state.projectRoot);
  }

  if (state.projectRoot) {
    await reconcileVendorTrees(state, result);
    state.contentRootsByCard = recomputeContentRootsByCard(state, {
      allowPlanningFallback: Boolean(state.normalized.dryRun),
    });
    const workersResult = await syncWorkers(state);
    result.changes.push(...workersResult.changes);
    result.warnings.push(...workersResult.warnings);
    result.managedPaths?.push(...(workersResult.managedPaths ?? []));
  }

  if (!state.normalized.skillsOnly) {
    const mcpResult = await syncMcp(
      state.scopedOptions,
      state.effectiveConfig,
      state.activeServers,
      previousRecord?.managedPaths ?? [],
      Object.keys(state.activeServers),
    );
    result.changes.push(...mcpResult.changes);
    result.warnings.push(...mcpResult.warnings);
    result.managedPaths?.push(...(mcpResult.managedPaths ?? []));
  }

  if (!state.normalized.mcpOnly) {
    const skillsResult = await syncSkillsCore(
      state.scopedOptions,
      state.skillSelection,
      state.skillApplyOrderCards,
      state.contentRootsByCard,
    );
    result.changes.push(...skillsResult.changes);
    result.warnings.push(...skillsResult.warnings);
    result.managedPaths?.push(...(skillsResult.managedPaths ?? []));
  }

  if (!state.normalized.mcpOnly && !state.normalized.skillsOnly) {
    const hooksResult = await syncHooks(state);
    result.changes.push(...hooksResult.changes);
    result.warnings.push(...hooksResult.warnings);
    result.managedPaths?.push(...(hooksResult.managedPaths ?? []));
  }

  const desiredManagedPaths = uniqueManagedPaths(result.managedPaths ?? []);
  const { toRemove } = diffWriteRecord(previousRecord, desiredManagedPaths);
  cleanupRemovedManagedPaths(state.scopeRoot, toRemove, state.normalized.dryRun, result);
  result.managedPaths = desiredManagedPaths;
  if (!state.normalized.dryRun) {
    saveWriteRecord(state.recordPath, {
      writeRecordVersion: 1,
      lastWriteAt: new Date().toISOString(),
      lastWriteHarnessVersion: DRWN_VERSION,
      managedPaths: desiredManagedPaths,
    });
  }

  return result;
}
