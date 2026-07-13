// ABOUTME: Resolves a project's ordered mind-content cards and the target mind id for worker mind commands.
// ABOUTME: Card order follows the active worker stack; content roots are the locked card paths.

import { DrwnError } from "../errors";
import { loadCardLock } from "../card-lock";
import { readProjectConfigForWrite } from "../project-writes";
import { loadCardMindContent, type CardMindContent } from "./seed";

export async function loadProjectMindCards(projectRoot: string): Promise<CardMindContent[]> {
  const lock = await loadCardLock(projectRoot);
  if (!lock || lock.cards.length === 0) {
    throw new DrwnError("MIND_NO_CARDS", "No cards are locked in this project; run `drwn card add <ref>` first.");
  }
  const config = readProjectConfigForWrite(projectRoot);
  const byName = new Map(lock.cards.map((card) => [card.name, card]));
  const names = config.activeWorker === null ? [] : [config.activeWorker];
  const ordered = names.flatMap((name) => (byName.has(name) ? [byName.get(name)!] : []));
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
