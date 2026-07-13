// ABOUTME: Implements drwn install for bootstrapping project cards from card.lock.
// ABOUTME: Fetches missing Git-backed cards and optionally writes downstream agent state.

import { Option, UsageError } from "clipanion";
import { ensureCardPresentFromLock } from "../core/card-install";
import { loadCardLock, persistCardLock } from "../core/card-lock";
import { pMap, resolveFetchConcurrency } from "../core/concurrency";
import { renderJson, renderSyncResult } from "../core/output";
import { syncRepository } from "../core/sync";
import { BaseCommand } from "./base";
import { requireProjectRoot } from "./card/project-command";

export class InstallCommand extends BaseCommand {
  static override paths = [["install"]];

  static override usage = BaseCommand.Usage({
    category: "General",
    description: "Fetch missing cards from card.lock and write project state.",
    details: `
      Reads .agents/drwn/card.lock, ensures every locked card is present in the
      local Git-backed store, updates extracted paths when needed, then writes
      the effective project state unless --no-apply is passed.
    `,
    examples: [
      ["Bootstrap after cloning a project", "drwn install"],
      ["Fetch cards without writing downstream files", "drwn install --no-apply"],
      ["Fail if cloning, fetching, or lockfile updates would be required", "drwn install --frozen"],
    ],
  });

  frozen = Option.Boolean("--frozen", false, {
    description: "Fail instead of cloning, fetching, or changing card.lock.",
  });

  noApply = Option.Boolean("--no-apply", false, {
    description: "Fetch and verify cards without writing downstream files.",
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const projectRoot = requireProjectRoot(this);
    const lock = await loadCardLock(projectRoot);
    if (!lock) {
      throw new UsageError("No card.lock found. Did you mean `drwn apply`?");
    }

    const errors: Array<{ card: string; message: string }> = [];
    let changed = false;
    const concurrency = resolveFetchConcurrency();
    // pMap accumulates errors inside the worker; we use an in-closure errors list
    // so the install summary reports every failed card, not just the first one.
    await pMap(lock.cards, concurrency, async (entry) => {
      try {
        const result = await ensureCardPresentFromLock(this.context.agentsDir, entry, this.frozen, { projectRoot });
        if (result.changed) changed = true;
      } catch (error) {
        errors.push({ card: entry.name, message: error instanceof Error ? error.message : String(error) });
      }
    });

    if (errors.length > 0) {
      if (this.json) {
        this.context.stdout.write(renderJson({ ok: false, errors }));
      } else {
        this.context.stderr.write(errors.map((error) => `${error.card}: ${error.message}`).join("\n") + "\n");
      }
      return 1;
    }

    if (changed) {
      await persistCardLock(projectRoot, this.context.agentsDir, lock);
    }

    if (this.noApply) {
      const payload = { ok: true, cards: lock.cards.length, applied: false, lockfileChanged: changed };
      this.context.stdout.write(this.json ? renderJson(payload) : `Installed ${lock.cards.length} card(s).\n`);
      return 0;
    }

    const syncResult = await syncRepository({
      repoRoot: this.context.repoRoot,
      agentsDir: this.context.agentsDir,
      homeDir: this.context.homeDir,
      cwd: this.context.cwd,
    });
    if (this.json) {
      this.context.stdout.write(renderJson({ ok: true, cards: lock.cards.length, applied: true, lockfileChanged: changed, sync: syncResult }));
    } else {
      this.context.stdout.write(renderSyncResult(syncResult));
    }
    return 0;
  }
}
