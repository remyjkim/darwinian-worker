// ABOUTME: Resolves a project's ordered mind-content cards and the target mind id for worker mind commands.
// ABOUTME: Card order follows the selected Worker root and its locked member closure.

import { DrwnError } from "../errors";
import { loadCardLock } from "../card-lock";
import { readProjectConfigForWrite } from "../project-writes";
import { loadCardMindContent, type CardMindContent } from "./seed";

export async function loadProjectMindCards(projectRoot: string): Promise<CardMindContent[]> {
  const lock = await loadCardLock(projectRoot);
  if (!lock || lock.cards.length === 0) {
    throw new DrwnError("MIND_NO_CARDS", "No Cards are locked in this project; run `drwn add <ref>` first.");
  }
  const config = readProjectConfigForWrite(projectRoot);
  if (config.activeWorker === null) {
    throw new DrwnError("MIND_WORKER_REQUIRED", "Mind operations require one selected project Worker; run `drwn use <worker>`.");
  }
  const root = lock.workerRoots.find((candidate) => candidate.name === config.activeWorker);
  if (!root) {
    throw new DrwnError(
      "MIND_ACTIVE_WORKER_NOT_LOCKED",
      `Selected Worker ${config.activeWorker} is missing from the project lock`,
    );
  }
  const byName = new Map(lock.cards.map((card) => [card.name, card]));
  const ordered = [root.name, ...root.members].map((name) => {
    const card = byName.get(name);
    if (!card) {
      throw new DrwnError("MIND_WORKER_CLOSURE_INCOMPLETE", `Selected Worker ${root.name} is missing locked Card ${name}`);
    }
    return card;
  });
  return Promise.all(ordered.map((card) => loadCardMindContent(card, card.path)));
}

export function resolveMindId(options: { flag?: string; env?: NodeJS.ProcessEnv }): string {
  if (options.flag) {
    return options.flag;
  }
  const prefix = (options.env ?? process.env).BGDB_PATH_PREFIX;
  const match = prefix?.replace(/^\/+/, "").match(/^minds\/([^/]+)$/);
  if (match) {
    return match[1]!;
  }
  throw new DrwnError(
    "MIND_ID_REQUIRED",
    "No mind id available: pass --mind-id or set BGDB_PATH_PREFIX=minds/<mindId>.",
  );
}
