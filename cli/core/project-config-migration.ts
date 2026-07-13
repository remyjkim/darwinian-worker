// ABOUTME: Normalizes legacy project configuration into the singular-Worker V2 schema.
// ABOUTME: Refuses ambiguous legacy composition instead of silently choosing or reclassifying roots.

import { parseCardRef } from "./card-store";
import { DrwnError } from "./errors";
import type { ProjectConfigBase, ProjectConfigV2 } from "./types";

interface ProjectConfigV1 extends ProjectConfigBase {
  version: 1;
  cards?: string[];
  activeWorkers?: string[];
}

export interface ProjectConfigMigrationWarning {
  code: "PROJECT_CONFIG_V1_NORMALIZED" | "CONFIG_LOCAL_ACTIVATE_NORMALIZED";
  message: string;
}

export interface NormalizedProjectConfig {
  config: ProjectConfigV2;
  warnings: ProjectConfigMigrationWarning[];
  sourceVersion: 1 | 2;
  legacyCards?: string[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertStringArray(value: unknown, label: string): asserts value is string[] {
  if (value !== undefined && (!Array.isArray(value) || !value.every((entry) => typeof entry === "string"))) {
    throw new DrwnError("PROJECT_CONFIG_INVALID", `${label} must be a string array`);
  }
}

function rootName(spec: string): string {
  return parseCardRef(spec).name;
}

function assertInstalledSelection(workers: string[], activeWorker: string | null | undefined) {
  if (activeWorker === undefined || activeWorker === null) return;
  const parsedWorkers = workers.map((worker) => parseCardRef(worker));
  const installed = new Set(parsedWorkers.filter((worker) => worker.origin === "store").map((worker) => worker.name));
  const hasOpaqueRootRef = parsedWorkers.some((worker) => worker.origin !== "store");
  if (!installed.has(rootName(activeWorker)) && !hasOpaqueRootRef) {
    throw new DrwnError(
      "ACTIVE_WORKER_NOT_INSTALLED",
      `Active Worker ${activeWorker} is not an installed Worker root`,
    );
  }
}

export function normalizeProjectConfig(input: unknown): NormalizedProjectConfig {
  if (!isObject(input) || (input.version !== 1 && input.version !== 2)) {
    throw new DrwnError("PROJECT_CONFIG_VERSION_UNSUPPORTED", `Unsupported project config version: ${String(isObject(input) ? input.version : undefined)}`);
  }
  assertStringArray(input.version === 1 ? input.cards : input.workers, input.version === 1 ? "cards" : "workers");
  if (input.version === 1) {
    assertStringArray(input.activeWorkers, "activeWorkers");
    const legacy = input as unknown as ProjectConfigV1;
    const workers = [...(legacy.cards ?? [])];
    if (legacy.activeWorkers === undefined && workers.length > 1) {
      throw new DrwnError(
        "LEGACY_MULTI_CARD_COMPOSITION_AMBIGUOUS",
        `Legacy project declares ${workers.length} Cards without a selection; classify them explicitly as alternative Workers or replace them with a published Blueprint`,
      );
    }
    if ((legacy.activeWorkers?.length ?? 0) > 1) {
      throw new DrwnError(
        "WORKER_STACK_UNSUPPORTED",
        `Legacy project activates ${legacy.activeWorkers!.length} Workers; V2 supports at most one active Worker`,
      );
    }
    const { version: _version, cards: _cards, activeWorkers: _activeWorkers, ...base } = legacy;
    const activeWorker = legacy.activeWorkers === undefined
      ? undefined
      : legacy.activeWorkers.length === 0
        ? null
        : legacy.activeWorkers[0];
    assertInstalledSelection(workers, activeWorker);
    return {
      config: {
        ...base,
        version: 2,
        workers,
        ...(activeWorker !== undefined ? { activeWorker } : {}),
      },
      warnings: [{
        code: "PROJECT_CONFIG_V1_NORMALIZED",
        message: "Project config V1 was normalized in memory; the next mutating command will persist V2",
      }],
      sourceVersion: 1,
      legacyCards: workers,
    };
  }

  const v2 = input as unknown as ProjectConfigV2;
  if (v2.activeWorker !== undefined && v2.activeWorker !== null && typeof v2.activeWorker !== "string") {
    throw new DrwnError("PROJECT_CONFIG_INVALID", "activeWorker must be a string or null");
  }
  const workers = [...(v2.workers ?? [])];
  assertInstalledSelection(workers, v2.activeWorker);
  return {
    config: { ...v2, workers },
    warnings: [],
    sourceVersion: 2,
  };
}

export function normalizeLocalActiveWorker(local: {
  activeWorker?: string | null;
  activate?: string[];
}): { activeWorker: string | null | undefined; warnings: ProjectConfigMigrationWarning[] } {
  if (local.activeWorker !== undefined && local.activate !== undefined) {
    throw new DrwnError("PROJECT_CONFIG_INVALID", "config.local.json cannot declare both activeWorker and legacy activate");
  }
  if (local.activeWorker !== undefined) {
    if (local.activeWorker !== null && typeof local.activeWorker !== "string") {
      throw new DrwnError("PROJECT_CONFIG_INVALID", "config.local.json activeWorker must be a string or null");
    }
    return { activeWorker: local.activeWorker, warnings: [] };
  }
  assertStringArray(local.activate, "config.local.json activate");
  if (local.activate === undefined) return { activeWorker: undefined, warnings: [] };
  if (local.activate.length > 1) {
    throw new DrwnError(
      "WORKER_STACK_UNSUPPORTED",
      `config.local.json activates ${local.activate.length} Workers; at most one is supported`,
    );
  }
  return {
    activeWorker: local.activate.length === 0 ? null : local.activate[0],
    warnings: [{
      code: "CONFIG_LOCAL_ACTIVATE_NORMALIZED",
      message: "Legacy config.local.json activate was normalized in memory to activeWorker",
    }],
  };
}
