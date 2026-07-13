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
import type { WorkerRootLockEntry } from "../worker-graph";
import { assertWorkerCapabilityCompatibility } from "../card-skill-resolver";

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

function aggregateSkillInstructions(state: EffectiveState, cards: CardLockEntry[]) {
  const sections: string[] = [];
  for (const card of cards) {
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
    return "No Worker capability instructions declared.\n";
  }
  return ensureTrailingNewline(`# Worker Capability Instructions\n\n${sections.join("\n\n")}`);
}

function buildInstructionsArtifact(state: EffectiveState, cards: CardLockEntry[]) {
  const root = cards[0];
  if (root?.manifest.kind === "blueprint") {
    const rootContent = state.contentRootsByCard[root.name] ?? root.path;
    const workerInstructions = explicitInstructionsForCard(root, rootContent) ?? identityInstructionsForCard(root);
    const capabilityInstructions = aggregateSkillInstructions(state, cards);
    return workerInstructions
      ? ensureTrailingNewline(`${workerInstructions.trimEnd()}\n\n${capabilityInstructions.trimEnd()}`)
      : capabilityInstructions;
  }
  for (const card of cards) {
    const contentRoot = state.contentRootsByCard[card.name] ?? card.path;
    const explicit = explicitInstructionsForCard(card, contentRoot);
    if (explicit) return explicit;
  }
  for (const card of cards) {
    const identity = identityInstructionsForCard(card);
    if (identity) return identity;
  }
  return aggregateSkillInstructions(state, cards);
}

function writeInstructionsArtifact(pathValue: string, state: EffectiveState, cards: CardLockEntry[], result: SyncResult) {
  const content = buildInstructionsArtifact(state, cards);
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
  cards: CardLockEntry[],
  workerDir: string,
  result: SyncResult,
) {
  const policies = cards.flatMap((card) =>
    hookPolicies(card, state.contentRootsByCard[card.name] ?? card.path)
  );
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

async function materializeWorker(
  state: EffectiveState,
  root: WorkerRootLockEntry,
  cards: CardLockEntry[],
  result: SyncResult,
) {
  assertWorkerCapabilityCompatibility(cards);
  const rootCard = cards[0];
  if (!rootCard || rootCard.name !== root.name) {
    throw new Error(`Worker root closure for ${root.name} does not begin with its root Card`);
  }
  const generatedDir = state.scopedOptions.generatedDir ?? resolveStoreGeneratedDir(state.scopedOptions.agentsDir);
  const workerDir = resolveGeneratedWorkerDir(generatedDir, root.name);
  if (!state.scopedOptions.dryRun) {
    mkdirSync(workerDir, { recursive: true });
  }

  const skillNames: string[] = [];
  for (const card of cards) {
    const contentRoot = state.contentRootsByCard[card.name] ?? card.path;
    for (const skill of card.skills) {
      const target = join(contentRoot, "skills", skill);
      const link = join(workerDir, "skills", skill);
      if (!existsSync(target)) {
        continue;
      }
      if (!skillNames.includes(skill)) skillNames.push(skill);
      result.managedPaths?.push(
        materializeDir(target, link, {
          dryRun: state.scopedOptions.dryRun,
          result,
          relPath: managedPath(state.scopeRoot, link),
          labelSuffix: ` ← ${card.name} skill ${skill}`,
        }),
      );
    }
  }

  const servers = Object.assign({}, ...cards.map(cardServers)) as Record<string, RegistryServer>;
  if (Object.keys(servers).length > 0) {
    const serversPath = join(workerDir, "mcp", "servers.json");
    const content = renderJsonMcpConfig(servers);
    writeManagedFile(serversPath, content, state.scopedOptions.dryRun, result);
    result.managedPaths?.push(recordManagedContent(state.scopeRoot, serversPath, content));
  }

  await materializeWorkerHooks(state, cards, workerDir, result);
  writeInstructionsArtifact(join(workerDir, "instructions.md"), state, cards, result);

  const index = {
    name: rootCard.name,
    version: rootCard.version,
    integrity: rootCard.integrity,
    kind: root.kind,
    path: workerDir,
    members: cards.slice(1).map((card) => ({
      name: card.name,
      version: card.version,
      integrity: card.integrity,
    })),
    skills: skillNames,
    hooks: cards.flatMap((card) => card.hooks),
    servers: Object.keys(servers),
  };
  writeJson(join(workerDir, "worker.json"), index, state, result);

  if (!state.scopedOptions.dryRun && existsSync(workerDir) && lstatSync(workerDir).isDirectory()) {
    result.managedPaths?.push(recordManagedDirectory(state.scopeRoot, workerDir, false));
  } else {
    result.managedPaths?.push(recordManagedDirectory(state.scopeRoot, workerDir, true));
  }

  return {
    name: rootCard.name,
    version: rootCard.version,
    integrity: rootCard.integrity,
    path: workerDir,
    closure: cards.map((card) => ({ name: card.name, version: card.version, integrity: card.integrity })),
    active: state.activeWorkerRoot?.name === root.name,
  };
}

export async function syncWorkers(state: EffectiveState): Promise<SyncResult> {
  const result: SyncResult = { changes: [], warnings: [], managedPaths: [] };
  const generatedDir = state.scopedOptions.generatedDir ?? resolveStoreGeneratedDir(state.scopedOptions.agentsDir);
  const workersRoot = resolveGeneratedWorkersDir(generatedDir);
  if (!state.scopedOptions.dryRun) {
    mkdirSync(workersRoot, { recursive: true });
  }
  const workers = [];
  const byName = new Map(state.workerGraph.cards.map((card) => [card.name, card]));
  for (const root of state.workerGraph.roots) {
    const closure = [root.name, ...root.members].map((name) => {
      const card = byName.get(name);
      if (!card) throw new Error(`Worker root ${root.name} references missing Card ${name}`);
      return card;
    });
    workers.push(await materializeWorker(state, root, closure, result));
  }
  writeJson(join(generatedDir, "workers.json"), { version: 2, workers }, state, result);
  if (state.activeWorkerRoot) {
    const active = workers.find((worker) => worker.name === state.activeWorkerRoot!.name);
    if (!active) throw new Error(`Active Worker ${state.activeWorkerRoot.name} has no generated bundle`);
    writeJson(join(generatedDir, "active-worker.json"), { schemaVersion: 1, ...active }, state, result);
    writeInstructionsArtifact(join(generatedDir, "instructions.md"), state, state.activeCards, result);
  }
  return result;
}
