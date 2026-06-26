// ABOUTME: Materializes installed cards as isolated generated mind bundles.
// ABOUTME: Writes minds.json plus per-mind persona, content symlinks, skills, hooks, and MCP indexes.

import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { CardLockEntry } from "../card-lock";
import { isRegistryServerDefinition } from "../card-mcp";
import type { EffectiveState } from "../effective-state";
import { ensureParentDir, lstatSafe, realpathSafe } from "../fs";
import { bundleHookComposer, type HookPolicyBundleInput } from "../hook-generator/bundle-composer";
import { resolveHookRuntimes } from "../hook-generator/runtime-selection";
import { isHookConsentValid } from "../hook-consent";
import { renderJsonMcpConfig } from "../mcp";
import { writeManagedFile } from "../managed-file";
import {
  resolveGeneratedComposedMindDir,
  resolveGeneratedMindDir,
  resolveGeneratedMindsDir,
  resolveStoreGeneratedDir,
  splitCardName,
} from "../store-paths";
import type { RegistryServer, SyncResult } from "../types";
import { hashManagedContent, hashManagedDirectory, type ManagedPath } from "../write-record";
import { cardManifestStrictestVisibility } from "../visibility";
import { DRWN_VERSION } from "../version";

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

function generatedRelPath(...parts: string[]) {
  return join(...parts).replace(/\\/g, "/");
}

function composedCardRelPath(card: CardLockEntry, section: "beliefs" | "memory", ...parts: string[]) {
  return generatedRelPath(section, ...splitCardName(card.name), ...parts);
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

function writeGeneratedContent(pathValue: string, content: string, state: EffectiveState, result: SyncResult) {
  const currentContent = existsSync(pathValue) ? readFileSync(pathValue, "utf8") : undefined;
  if (currentContent !== content) {
    ensureParentDir(pathValue, state.scopedOptions.dryRun);
    result.changes.push(`write ${pathValue}`);
    if (!state.scopedOptions.dryRun) {
      const tmpPath = `${pathValue}.tmp`;
      writeFileSync(tmpPath, content);
      renameSync(tmpPath, pathValue);
    }
  }
  result.managedPaths?.push(recordManagedContent(state.scopeRoot, pathValue, content));
}

function writeGeneratedJson(pathValue: string, value: unknown, state: EffectiveState, result: SyncResult) {
  writeGeneratedContent(pathValue, `${JSON.stringify(value, null, 2)}\n`, state, result);
}

function personaContent(card: CardLockEntry) {
  const parts: string[] = [];
  for (const entry of card.persona?.include ?? []) {
    const file = join(card.path, "persona", entry, "PERSONA.md");
    if (!existsSync(file)) {
      continue;
    }
    parts.push(
      [
        `<!-- drwn:persona:start card="${card.name}" entry="${entry}" -->`,
        readFileSync(file, "utf8").trimEnd(),
        `<!-- drwn:persona:end card="${card.name}" entry="${entry}" -->`,
      ].join("\n"),
    );
  }
  return parts.length > 0 ? `${parts.join("\n\n")}\n` : null;
}

function cardServers(card: CardLockEntry): Record<string, RegistryServer> {
  return Object.fromEntries(
    Object.entries(card.manifest.servers ?? {})
      .filter(([, server]) => isRegistryServerDefinition(server))
      .map(([name, server]) => [name, server as RegistryServer]),
  );
}

function hookPolicies(card: CardLockEntry): HookPolicyBundleInput[] {
  if (card.hooks.length === 0 || !isHookConsentValid(card)) {
    return [];
  }
  return card.hooks.map((policyName) => ({
    cardName: card.name,
    policyName,
    policyTsPath: join(card.path, "hooks", policyName, "policy.ts"),
  }));
}

async function materializeMindHooks(state: EffectiveState, card: CardLockEntry, mindDir: string, result: SyncResult) {
  const policies = hookPolicies(card);
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
  const generatedDir = state.scopedOptions.generatedDir ?? resolveStoreGeneratedDir(state.scopedOptions.agentsDir);
  const mindDir = resolveGeneratedMindDir(generatedDir, card.name);
  if (!state.scopedOptions.dryRun) {
    mkdirSync(mindDir, { recursive: true });
  }

  const persona = personaContent(card);
  if (persona !== null) {
    const personaPath = join(mindDir, "persona.md");
    writeManagedFile(personaPath, persona, state.scopedOptions.dryRun, result);
    result.managedPaths?.push(recordManagedContent(state.scopeRoot, personaPath, persona));
  }

  for (const entry of card.beliefs?.include ?? []) {
    const target = join(card.path, "beliefs", entry);
    const link = join(mindDir, "beliefs", entry);
    ensureDirSymlink(link, target, state.scopedOptions.dryRun, result);
    result.managedPaths?.push(recordGeneratedSymlink(state.scopeRoot, link, target));
  }

  for (const layer of ["l4", "l5", "l6"] as const) {
    for (const entry of card.memory?.[layer]?.include ?? []) {
      const target = join(card.path, "memory", layer, entry);
      const link = join(mindDir, "memory", layer, entry);
      ensureDirSymlink(link, target, state.scopedOptions.dryRun, result);
      result.managedPaths?.push(recordGeneratedSymlink(state.scopeRoot, link, target));
    }
  }

  for (const skill of card.skills) {
    const target = join(card.path, "skills", skill);
    const link = join(mindDir, "skills", skill);
    if (!existsSync(target)) {
      continue;
    }
    ensureDirSymlink(link, target, state.scopedOptions.dryRun, result);
    result.managedPaths?.push(recordGeneratedSymlink(state.scopeRoot, link, target));
  }

  const servers = cardServers(card);
  if (Object.keys(servers).length > 0) {
    const serversPath = join(mindDir, "mcp", "servers.json");
    const content = renderJsonMcpConfig(servers);
    writeManagedFile(serversPath, content, state.scopedOptions.dryRun, result);
    result.managedPaths?.push(recordManagedContent(state.scopeRoot, serversPath, content));
  }

  await materializeMindHooks(state, card, mindDir, result);

  const index = {
    name: card.name,
    version: card.version,
    integrity: card.integrity,
    path: mindDir,
    visibility: cardManifestStrictestVisibility(card.manifest),
    persona: card.persona ?? null,
    beliefs: card.beliefs ?? null,
    memory: card.memory ?? null,
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
    hasPersona: (card.persona?.include?.length ?? 0) > 0,
    hasBeliefs: (card.beliefs?.include?.length ?? 0) > 0,
    memoryLayers: Object.entries(card.memory ?? {})
      .filter(([, layer]) => (layer?.include?.length ?? 0) > 0)
      .map(([layer]) => layer),
    visibility: cardManifestStrictestVisibility(card.manifest),
  };
}

async function materializeComposedMind(state: EffectiveState, result: SyncResult) {
  const activeCards = state.activeCards;
  if (activeCards.length === 0) {
    return;
  }

  const generatedDir = state.scopedOptions.generatedDir ?? resolveStoreGeneratedDir(state.scopedOptions.agentsDir);
  const composedDir = resolveGeneratedComposedMindDir(generatedDir);
  if (!state.scopedOptions.dryRun) {
    mkdirSync(composedDir, { recursive: true });
  }

  const personaEntries = activeCards.flatMap((card) =>
    (card.persona?.include ?? []).map((entry) => ({ card: card.name, entry })),
  );
  const personaParts = activeCards
    .map((card) => personaContent(card))
    .filter((content): content is string => content !== null)
    .map((content) => content.trimEnd());
  if (personaParts.length > 0) {
    const personaPath = join(composedDir, "persona.md");
    const content = `${personaParts.join("\n\n")}\n`;
    writeGeneratedContent(personaPath, content, state, result);
  }

  const beliefEntries = [];
  for (const card of activeCards) {
    for (const entry of card.beliefs?.include ?? []) {
      const target = join(card.path, "beliefs", entry);
      const link = join(composedDir, "beliefs", ...splitCardName(card.name), entry);
      ensureDirSymlink(link, target, state.scopedOptions.dryRun, result);
      result.managedPaths?.push(recordGeneratedSymlink(state.scopeRoot, link, target));
      beliefEntries.push({
        card: card.name,
        entry,
        path: composedCardRelPath(card, "beliefs", entry),
        visibility: card.beliefs?.visibility ?? null,
      });
    }
  }

  const memory = Object.fromEntries(
    (["l4", "l5", "l6"] as const).map((layer) => [
      layer,
      {
        entries: activeCards.flatMap((card) =>
          (card.memory?.[layer]?.include ?? []).map((entry) => {
            const target = join(card.path, "memory", layer, entry);
            const link = join(composedDir, "memory", layer, ...splitCardName(card.name), entry);
            ensureDirSymlink(link, target, state.scopedOptions.dryRun, result);
            result.managedPaths?.push(recordGeneratedSymlink(state.scopeRoot, link, target));
            return {
              card: card.name,
              entry,
              path: generatedRelPath("memory", layer, ...splitCardName(card.name), entry),
              visibility: card.memory?.[layer]?.visibility ?? null,
              format: card.memory?.[layer]?.format ?? "md",
            };
          }),
        ),
      },
    ]),
  );

  const index = {
    schemaVersion: 1,
    activeMinds: activeCards.map((card) => card.name),
    persona: {
      path: personaEntries.length > 0 ? "persona.md" : null,
      entries: personaEntries,
    },
    beliefs: { entries: beliefEntries },
    memory,
    sources: activeCards.map((card) => ({
      card: card.name,
      version: card.version,
      integrity: card.integrity,
    })),
    drwnVersion: DRWN_VERSION,
    writtenAt: new Date().toISOString(),
  };
  writeGeneratedJson(join(composedDir, "mind.json"), index, state, result);
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
  await materializeComposedMind(state, result);
  return result;
}
