// ABOUTME: Materializes installed cards as isolated generated mind bundles.
// ABOUTME: Writes minds.json plus per-mind skills, hooks, and MCP indexes.

import { existsSync, lstatSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { join, relative } from "node:path";
import type { CardLockEntry } from "../card-lock";
import { isRegistryServerDefinition } from "../card-mcp";
import type { EffectiveState } from "../effective-state";
import { ensureParentDir, lstatSafe, realpathSafe } from "../fs";
import { materializeDir } from "../materialize";
import { bundleHookComposer, type HookPolicyBundleInput } from "../hook-generator/bundle-composer";
import { resolveHookRuntimes } from "../hook-generator/runtime-selection";
import { isHookConsentValid } from "../hook-consent";
import { renderJsonMcpConfig } from "../mcp";
import { writeManagedFile } from "../managed-file";
import {
  resolveGeneratedMindDir,
  resolveGeneratedMindsDir,
  resolveStoreGeneratedDir,
} from "../store-paths";
import type { RegistryServer, SyncResult } from "../types";
import { hashManagedContent, hashManagedDirectory, type ManagedPath } from "../write-record";

function managedPath(scopeRoot: string, absolutePath: string) {
  return relative(scopeRoot, absolutePath).replace(/\\/g, "/");
}

function recordManagedContent(scopeRoot: string, pathValue: string, content: string): ManagedPath {
  return { path: managedPath(scopeRoot, pathValue), kind: "managed-content", contentHash: hashManagedContent(content) };
}

function recordManagedDirectory(scopeRoot: string, pathValue: string, dryRun: boolean): ManagedPath {
  return {
    path: managedPath(scopeRoot, pathValue),
    kind: "managed-directory",
    contentHash: dryRun ? "sha256-dry-run" : hashManagedDirectory(pathValue),
  };
}

function recordGeneratedSymlink(scopeRoot: string, linkPath: string, targetPath: string): ManagedPath {
  return { path: managedPath(scopeRoot, linkPath), kind: "generated-symlink", generatedPath: targetPath };
}

function ensureDirSymlink(linkPath: string, targetPath: string, dryRun: boolean, result: SyncResult) {
  const stats = lstatSafe(linkPath);
  if (stats) {
    if (stats.isSymbolicLink() && realpathSafe(linkPath) === realpathSafe(targetPath)) {
      return;
    }
    result.changes.push(`replace ${linkPath}`);
    if (!dryRun) {
      rmSync(linkPath, { recursive: true, force: true });
    }
  }

  ensureParentDir(linkPath, dryRun);
  result.changes.push(`symlink ${linkPath} -> ${targetPath}`);
  if (!dryRun) {
    symlinkSync(targetPath, linkPath, "dir");
  }
}

function writeJson(pathValue: string, value: unknown, state: EffectiveState, result: SyncResult) {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  writeManagedFile(pathValue, content, state.scopedOptions.dryRun, result);
  result.managedPaths?.push(recordManagedContent(state.scopeRoot, pathValue, content));
}

function cardServers(card: CardLockEntry): Record<string, RegistryServer> {
  return Object.fromEntries(
    Object.entries(card.manifest.servers ?? {})
      .filter(([, server]) => isRegistryServerDefinition(server))
      .map(([name, server]) => [name, server as RegistryServer]),
  );
}

function hookPolicies(card: CardLockEntry, contentRoot: string): HookPolicyBundleInput[] {
  if (card.hooks.length === 0 || !isHookConsentValid(card)) {
    return [];
  }
  return card.hooks.map((policyName) => ({
    cardName: card.name,
    policyName,
    policyTsPath: join(contentRoot, "hooks", policyName, "policy.ts"),
  }));
}

async function materializeMindHooks(
  state: EffectiveState,
  card: CardLockEntry,
  contentRoot: string,
  mindDir: string,
  result: SyncResult,
) {
  const policies = hookPolicies(card, contentRoot);
  if (policies.length === 0) {
    return;
  }
  const runtimes = resolveHookRuntimes({
    effectiveConfig: state.effectiveConfig,
    projectConfig: state.projectConfigWithCards ?? state.projectConfig,
    target: state.scopedOptions.target,
  });

  for (const runtime of runtimes) {
    if (runtime !== "claude-code" && runtime !== "codex") {
      continue;
    }
    const runtimeDir = runtime === "claude-code" ? "claude" : runtime;
    const outputDir = join(mindDir, "hooks", runtimeDir);
    const composerPath = join(outputDir, "composer.mjs");
    if (!state.scopedOptions.dryRun) {
      await bundleHookComposer({ runtime, outputDir, policies });
    } else {
      result.changes.push(`write ${composerPath}`);
      result.managedPaths?.push({ path: managedPath(state.scopeRoot, composerPath), kind: "managed-content", contentHash: "sha256-dry-run" });
    }
  }
}

async function materializeMind(state: EffectiveState, card: CardLockEntry, result: SyncResult) {
  const contentRoot = state.contentRootsByCard[card.name] ?? card.path;
  const generatedDir = state.scopedOptions.generatedDir ?? resolveStoreGeneratedDir(state.scopedOptions.agentsDir);
  const mindDir = resolveGeneratedMindDir(generatedDir, card.name);
  if (!state.scopedOptions.dryRun) {
    mkdirSync(mindDir, { recursive: true });
  }

  for (const skill of card.skills) {
    const target = join(contentRoot, "skills", skill);
    const link = join(mindDir, "skills", skill);
    if (!existsSync(target)) {
      continue;
    }
    result.managedPaths?.push(
      materializeDir(target, link, {
        dryRun: state.scopedOptions.dryRun,
        result,
        relPath: managedPath(state.scopeRoot, link),
        labelSuffix: ` ← ${card.name} skill ${skill}`,
      }),
    );
  }

  const servers = cardServers(card);
  if (Object.keys(servers).length > 0) {
    const serversPath = join(mindDir, "mcp", "servers.json");
    const content = renderJsonMcpConfig(servers);
    writeManagedFile(serversPath, content, state.scopedOptions.dryRun, result);
    result.managedPaths?.push(recordManagedContent(state.scopeRoot, serversPath, content));
  }

  await materializeMindHooks(state, card, contentRoot, mindDir, result);

  const index = {
    name: card.name,
    version: card.version,
    integrity: card.integrity,
    path: mindDir,
    skills: card.skills,
    hooks: card.hooks,
    servers: Object.keys(servers),
  };
  writeJson(join(mindDir, "mind.json"), index, state, result);

  if (!state.scopedOptions.dryRun && existsSync(mindDir) && lstatSync(mindDir).isDirectory()) {
    result.managedPaths?.push(recordManagedDirectory(state.scopeRoot, mindDir, false));
  } else {
    result.managedPaths?.push(recordManagedDirectory(state.scopeRoot, mindDir, true));
  }

  return {
    name: card.name,
    version: card.version,
    integrity: card.integrity,
    path: mindDir,
  };
}

export async function syncMinds(state: EffectiveState): Promise<SyncResult> {
  const result: SyncResult = { changes: [], warnings: [], managedPaths: [] };
  const generatedDir = state.scopedOptions.generatedDir ?? resolveStoreGeneratedDir(state.scopedOptions.agentsDir);
  const mindsRoot = resolveGeneratedMindsDir(generatedDir);
  if (!state.scopedOptions.dryRun) {
    mkdirSync(mindsRoot, { recursive: true });
  }
  const minds = [];
  for (const card of state.lockedCards) {
    minds.push(await materializeMind(state, card, result));
  }
  minds.sort((a, b) => a.name.localeCompare(b.name));
  writeJson(join(generatedDir, "minds.json"), { version: 1, minds }, state, result);
  return result;
}
