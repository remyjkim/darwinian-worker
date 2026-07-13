// ABOUTME: Builds the CLI-to-deploy-api worker deploy payload.
// ABOUTME: Sends portable lockfile/config/content bytes so server materialization can run frozen.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { relative, join } from "node:path";
import { tmpdir } from "node:os";
import { create as createArchive } from "./archive";
import {
  HOOKS_MIN_DRWN_VERSION,
  type CardLockEntry,
  type GitLockInfo,
} from "./card-lock";
import { resolveProjectCards } from "./card-project";
import { parseCardRef, type ResolveCardOptions } from "./card-store";
import { DrwnError } from "./errors";
import { readProjectConfigForWrite } from "./project-writes";
import { resolveCardBareRepoPath, resolveExtractedPath } from "./store-paths";
import type { ProjectConfig } from "./types";

export const WORKER_DEPLOY_CONTRACT_VERSION = 1;
export const DEFAULT_STORE_EXPORT_LIMIT_BYTES = 25 * 1024 * 1024;

export type WorkerDeployMaterialization = "lockfile-store-export";

export interface WorkerDeployStoreExport {
  kind: "drwn-store-export-tar";
  compression: "none";
  encoding: "base64";
  sha256: string;
  byteLength: number;
  bytesBase64: string;
}

export interface WorkerDeployGovernance {
  composedFrom: string[];
  tools?: unknown;
  permissions?: unknown;
  evals?: unknown;
  escalation?: unknown;
  contextMounts?: unknown;
  identity?: unknown;
}

export interface WorkerDeployPayload {
  contractVersion: typeof WORKER_DEPLOY_CONTRACT_VERSION;
  materialization: WorkerDeployMaterialization;
  entrypoint: {
    requested: string;
    name: string;
    kind: "card" | "blueprint";
  };
  lockfile: {
    lockfileVersion: 5;
    store: { minDrwnVersion: string };
    cards: CardLockEntry[];
  };
  config: ProjectConfig;
  governance: WorkerDeployGovernance | null;
  storeExport: WorkerDeployStoreExport;
}

export interface BuildWorkerDeployPayloadOptions {
  agentsDir: string;
  cardRef: string;
  projectRoot?: string | null;
  resolveOptions?: ResolveCardOptions;
  maxStoreExportBytes?: number;
}

function posixRelative(from: string, to: string) {
  return relative(from, to).replace(/\\/g, "/");
}

function portableGit(git: GitLockInfo | undefined): GitLockInfo | undefined {
  if (!git) {
    return undefined;
  }
  return {
    ...(git.url ? { url: git.url } : {}),
    ...(git.ref ? { ref: git.ref } : {}),
    commit: git.commit,
  };
}

function portableCardEntry(card: CardLockEntry): CardLockEntry {
  if (card.origin === "file" || card.origin === "npm") {
    throw new DrwnError(
      "WORKER_DEPLOY_UNSUPPORTED_CARD_ORIGIN",
      `worker deploy requires store/git cards; ${card.name} has origin ${card.origin}`,
    );
  }
  if (!card.treeSha) {
    throw new DrwnError("WORKER_DEPLOY_MISSING_TREE_SHA", `worker deploy requires treeSha for ${card.name}`);
  }
  if (!card.git?.commit) {
    throw new DrwnError("WORKER_DEPLOY_MISSING_COMMIT", `worker deploy requires git.commit for ${card.name}`);
  }

  return {
    name: card.name,
    requested: card.requested,
    version: card.version,
    path: `drwn/extracted/${card.treeSha}`,
    integrity: card.integrity,
    treeSha: card.treeSha,
    manifest: card.manifest,
    skills: [...card.skills],
    hooks: [...card.hooks],
    ...(card.hookConsent ? { hookConsent: card.hookConsent } : {}),
    registry: null,
    origin: card.origin,
    git: portableGit(card.git),
  };
}

function governanceFromEntry(card: CardLockEntry): WorkerDeployGovernance | null {
  if (card.manifest.kind !== "blueprint") {
    return null;
  }
  const manifest = card.manifest;
  return {
    composedFrom: manifest.composedFrom ?? [],
    ...(manifest.tools ? { tools: manifest.tools } : {}),
    ...(manifest.permissions ? { permissions: manifest.permissions } : {}),
    ...(manifest.evals ? { evals: manifest.evals } : {}),
    ...(manifest.escalation ? { escalation: manifest.escalation } : {}),
    ...(manifest.contextMounts ? { contextMounts: manifest.contextMounts } : {}),
    ...(manifest.identity ? { identity: manifest.identity } : {}),
  };
}

function deployProjectConfig(cardRef: string, projectRoot?: string | null): ProjectConfig {
  if (!projectRoot) {
    return {
      schema: "drwn.project-config",
      schemaVersion: 1,
      workers: [cardRef],
      activeWorker: parseCardRef(cardRef).name,
    };
  }
  try {
    const config = readProjectConfigForWrite(projectRoot);
    if (config.workers.includes(cardRef)) {
      return config;
    }
  } catch {
    // Fall through to the minimal deploy config. Deploy must not depend on a local
    // project unless it clearly selected the exact deploy ref.
  }
  return {
    schema: "drwn.project-config",
    schemaVersion: 1,
    workers: [cardRef],
    activeWorker: parseCardRef(cardRef).name,
  };
}

function storeExportEntries(agentsDir: string, cards: CardLockEntry[]): string[] {
  const entries = new Set<string>(["drwn/store.json"]);
  for (const card of cards) {
    if (!card.treeSha) {
      throw new DrwnError("WORKER_DEPLOY_MISSING_TREE_SHA", `worker deploy requires treeSha for ${card.name}`);
    }
    const bareRepo = resolveCardBareRepoPath(agentsDir, card.name);
    if (!existsSync(bareRepo)) {
      throw new DrwnError("WORKER_DEPLOY_MISSING_BARE_REPO", `worker deploy requires local bare repo for ${card.name}`);
    }
    const extracted = resolveExtractedPath(agentsDir, card.treeSha);
    if (!existsSync(extracted)) {
      throw new DrwnError("WORKER_DEPLOY_MISSING_EXTRACTED_TREE", `worker deploy requires extracted tree for ${card.name}`);
    }
    entries.add(posixRelative(agentsDir, bareRepo));
    entries.add(posixRelative(agentsDir, extracted));
  }
  return [...entries].sort();
}

export async function createStoreExportForLock(
  agentsDir: string,
  cards: CardLockEntry[],
  outPath: string,
): Promise<string> {
  await createArchive(outPath, {
    cwd: agentsDir,
    entries: storeExportEntries(agentsDir, cards),
    gzip: false,
  });
  return outPath;
}

async function buildStoreExport(agentsDir: string, cards: CardLockEntry[], maxBytes: number): Promise<WorkerDeployStoreExport> {
  const tempDir = await mkdtemp(join(tmpdir(), "drwn-worker-deploy-"));
  const tarPath = join(tempDir, "store.tar");
  try {
    await createStoreExportForLock(agentsDir, cards, tarPath);
    const bytes = await readFile(tarPath);
    if (bytes.byteLength > maxBytes) {
      throw new DrwnError(
        "WORKER_DEPLOY_STORE_EXPORT_TOO_LARGE",
        `worker deploy store export is ${bytes.byteLength} bytes; limit is ${maxBytes} bytes`,
      );
    }
    return {
      kind: "drwn-store-export-tar",
      compression: "none",
      encoding: "base64",
      sha256: createHash("sha256").update(bytes).digest("hex"),
      byteLength: bytes.byteLength,
      bytesBase64: bytes.toString("base64"),
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function buildWorkerDeployPayload(options: BuildWorkerDeployPayloadOptions): Promise<WorkerDeployPayload> {
  const locked = await resolveProjectCards(options.agentsDir, [options.cardRef], options.resolveOptions);
  const top = locked[0];
  if (!top) {
    throw new DrwnError("WORKER_DEPLOY_CARD_NOT_FOUND", `could not resolve deploy card ${options.cardRef}`);
  }

  const portableCards = locked.map(portableCardEntry);
  return {
    contractVersion: WORKER_DEPLOY_CONTRACT_VERSION,
    materialization: "lockfile-store-export",
    entrypoint: {
      requested: options.cardRef,
      name: top.name,
      kind: top.manifest.kind === "blueprint" ? "blueprint" : "card",
    },
    lockfile: {
      lockfileVersion: 5,
      store: { minDrwnVersion: HOOKS_MIN_DRWN_VERSION },
      cards: portableCards,
    },
    config: deployProjectConfig(options.cardRef, options.projectRoot),
    governance: governanceFromEntry(top),
    storeExport: await buildStoreExport(
      options.agentsDir,
      locked,
      options.maxStoreExportBytes ?? DEFAULT_STORE_EXPORT_LIMIT_BYTES,
    ),
  };
}
