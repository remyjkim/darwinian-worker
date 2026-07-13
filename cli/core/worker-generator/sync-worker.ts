// ABOUTME: Materializes installed cards as isolated generated worker bundles.
// ABOUTME: Writes workers.json plus per-worker skills, hooks, and MCP indexes.

import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
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
  resolveGeneratedWorkerDir,
  resolveGeneratedWorkersDir,
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

function ensureTrailingNewline(text: string) {
  return text.endsWith("\n") ? text : `${text}\n`;
}

function isSafeRelativeInstructionPath(pathValue: string) {
  const normalized = pathValue.replace(/\\/g, "/");
  return (
    normalized.length > 0 &&
    !normalized.startsWith("/") &&
    !/^[A-Za-z]:\//.test(normalized) &&
    !normalized.split("/").includes("..")
  );
}

function stripYamlFrontmatter(text: string) {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

function explicitInstructionsForCard(card: CardLockEntry, contentRoot: string): string | null {
  const instructions = card.manifest.instructions;
  if (!instructions) {
    return null;
  }
  if (typeof instructions.text === "string") {
    const text = instructions.text.trimEnd();
    if (text.trim().length === 0) {
      throw new Error(`instructions.text for ${card.name} must be non-empty`);
    }
    return ensureTrailingNewline(text);
  }
  if (typeof instructions.path === "string") {
    if (!isSafeRelativeInstructionPath(instructions.path)) {
      throw new Error(`instructions.path for ${card.name} must stay inside the card content root`);
    }
    const text = readFileSync(join(contentRoot, instructions.path), "utf8").trimEnd();
    if (text.trim().length === 0) {
      throw new Error(`instructions.path for ${card.name} produced empty instructions`);
    }
    return ensureTrailingNewline(text);
  }
  return null;
}

function identityInstructionsForCard(card: CardLockEntry): string | null {
  if (card.manifest.kind !== "blueprint") {
    return null;
  }
  const text = card.manifest.identity?.instructions;
  if (typeof text !== "string" || text.trim().length === 0) {
    return null;
  }
  return ensureTrailingNewline(text.trimEnd());
}

function aggregateSkillInstructions(state: EffectiveState) {
  const sections: string[] = [];
  for (const card of state.skillApplyOrderCards) {
    const contentRoot = state.contentRootsByCard[card.name] ?? card.path;
    for (const skill of card.skills) {
      const skillPath = join(contentRoot, "skills", skill, "SKILL.md");
      if (!existsSync(skillPath)) {
        continue;
      }
      const body = stripYamlFrontmatter(readFileSync(skillPath, "utf8")).trim();
      if (body.length === 0) {
        continue;
      }
      sections.push(`## ${card.name} / ${skill}\n\n${body}`);
    }
  }
  if (sections.length === 0) {
    return "No active card instructions declared.\n";
  }
  return ensureTrailingNewline(`# Active Card Skill Instructions\n\n${sections.join("\n\n")}`);
}

function buildInstructionsArtifact(state: EffectiveState) {
  for (const card of state.skillApplyOrderCards) {
    const contentRoot = state.contentRootsByCard[card.name] ?? card.path;
    const explicit = explicitInstructionsForCard(card, contentRoot);
    if (explicit) return explicit;
  }
  for (const card of state.skillApplyOrderCards) {
    const identity = identityInstructionsForCard(card);
    if (identity) return identity;
  }
  return aggregateSkillInstructions(state);
}

function writeInstructionsArtifact(generatedDir: string, state: EffectiveState, result: SyncResult) {
  const pathValue = join(generatedDir, "instructions.md");
  const content = buildInstructionsArtifact(state);
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

async function materializeWorkerHooks(
  state: EffectiveState,
  card: CardLockEntry,
  contentRoot: string,
  workerDir: string,
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
    const outputDir = join(workerDir, "hooks", runtimeDir);
    const composerPath = join(outputDir, "composer.mjs");
    if (!state.scopedOptions.dryRun) {
      await bundleHookComposer({ runtime, outputDir, policies });
    } else {
      result.changes.push(`write ${composerPath}`);
      result.managedPaths?.push({ path: managedPath(state.scopeRoot, composerPath), kind: "managed-content", contentHash: "sha256-dry-run" });
    }
  }
}

async function materializeWorker(state: EffectiveState, card: CardLockEntry, result: SyncResult) {
  const contentRoot = state.contentRootsByCard[card.name] ?? card.path;
  const generatedDir = state.scopedOptions.generatedDir ?? resolveStoreGeneratedDir(state.scopedOptions.agentsDir);
  const workerDir = resolveGeneratedWorkerDir(generatedDir, card.name);
  if (!state.scopedOptions.dryRun) {
    mkdirSync(workerDir, { recursive: true });
  }

  for (const skill of card.skills) {
    const target = join(contentRoot, "skills", skill);
    const link = join(workerDir, "skills", skill);
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
    const serversPath = join(workerDir, "mcp", "servers.json");
    const content = renderJsonMcpConfig(servers);
    writeManagedFile(serversPath, content, state.scopedOptions.dryRun, result);
    result.managedPaths?.push(recordManagedContent(state.scopeRoot, serversPath, content));
  }

  await materializeWorkerHooks(state, card, contentRoot, workerDir, result);

  const index = {
    name: card.name,
    version: card.version,
    integrity: card.integrity,
    path: workerDir,
    skills: card.skills,
    hooks: card.hooks,
    servers: Object.keys(servers),
  };
  writeJson(join(workerDir, "worker.json"), index, state, result);

  if (!state.scopedOptions.dryRun && existsSync(workerDir) && lstatSync(workerDir).isDirectory()) {
    result.managedPaths?.push(recordManagedDirectory(state.scopeRoot, workerDir, false));
  } else {
    result.managedPaths?.push(recordManagedDirectory(state.scopeRoot, workerDir, true));
  }

  return {
    name: card.name,
    version: card.version,
    integrity: card.integrity,
    path: workerDir,
  };
}

export async function syncWorkers(state: EffectiveState): Promise<SyncResult> {
  const result: SyncResult = { changes: [], warnings: [], managedPaths: [] };
  const generatedDir = state.scopedOptions.generatedDir ?? resolveStoreGeneratedDir(state.scopedOptions.agentsDir);
  const workersRoot = resolveGeneratedWorkersDir(generatedDir);
  if (!state.scopedOptions.dryRun) {
    mkdirSync(workersRoot, { recursive: true });
  }
  writeInstructionsArtifact(generatedDir, state, result);
  const workers = [];
  for (const card of state.lockedCards) {
    workers.push(await materializeWorker(state, card, result));
  }
  workers.sort((a, b) => a.name.localeCompare(b.name));
  writeJson(join(generatedDir, "workers.json"), { version: 1, workers }, state, result);
  return result;
}
