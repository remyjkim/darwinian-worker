// ABOUTME: Implements `drwn worker mind provision`: scaffolds and seeds a mind subtree from the project's cards.
// ABOUTME: Seeding is idempotent; an already-provisioned mind is reported, never re-seeded (card updates use sync).

import { Option } from "clipanion";
import { DrwnError } from "../../../core/errors";
import { createMindDbClient } from "../../../core/mind-store/client";
import { resolveBgdbConfig } from "../../../core/mind-store/config";
import { loadProjectMindCards, resolveMindId } from "../../../core/mind-store/project";
import { seedMind } from "../../../core/mind-store/seed";
import { renderJson } from "../../../core/output";
import { BaseCommand } from "../../base";
import { requireProjectRoot } from "../../card/project-command";

export class WorkerMindProvisionCommand extends BaseCommand {
  static override paths = [["worker", "mind", "provision"]];

  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Provision and seed a worker's mind in BeginningDB.",
    details: `
      Composes the active card stack's persona and beliefs, uploads them into
      minds/<mindId>/ with atomic creates, scaffolds memory layers, and writes
      the mind.json seed ledger. Running against a provisioned mind is a no-op.
    `,
    examples: [
      ["Provision using the binding's path prefix", "drwn worker mind provision"],
      ["Provision an explicit mind id", "drwn worker mind provision --mind-id mind_abc --json"],
    ],
  });

  mindId = Option.String("--mind-id", { description: "Mind id (defaults to the one in BGDB_PATH_PREFIX)." });

  json = Option.Boolean("--json", false, { description: "Emit machine-readable JSON output." });

  async execute() {
    try {
      const projectRoot = requireProjectRoot(this);
      const mindId = resolveMindId({ flag: this.mindId });
      const config = resolveBgdbConfig();
      const client = createMindDbClient(config);
      const cards = await loadProjectMindCards(projectRoot);
      const result = await seedMind(client, mindId, cards);
      if (this.json) {
        this.context.stdout.write(renderJson({ mindId, ...result }));
        return 0;
      }
      this.context.stdout.write(
        result.alreadyProvisioned
          ? `Mind ${mindId} is already provisioned.\n`
          : `Provisioned mind ${mindId} (${result.created.length} file(s) seeded).\n`,
      );
      return 0;
    } catch (error) {
      const message = error instanceof DrwnError ? `${error.message}${error.hints ? `\n${error.hints.join("\n")}` : ""}` : String(error instanceof Error ? error.message : error);
      this.context.stderr.write(`${message}\n`);
      return 1;
    }
  }
}
