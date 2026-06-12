// ABOUTME: Implements drwn card clone for importing a Git-origin card into the local store.
// ABOUTME: Resolves git+/github:/gitlab: refs through the Git-backed resolver.

import { Option } from "clipanion";
import { parseCardRef, resolveCard } from "../../core/card-store";
import { renderJson } from "../../core/output";
import { BaseCommand } from "../base";

export class CardCloneCommand extends BaseCommand {
  static override paths = [["card", "clone"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Clone a Git-origin card into the local store.",
    details: `
      Resolves a git+, github:, or gitlab: card ref, clones the backing bare repo
      when needed, extracts the selected tree, and records the origin URL.
    `,
    examples: [["Clone a card", "drwn card clone git+file:///tmp/backend.git#v1.0.0"]],
  });

  ref = Option.String({ required: true });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  allowUntrustedSource = Option.Boolean("--allow-untrusted-source", false, {
    description: "Resolve the Git ref even when trustedSources.strict would reject it.",
  });

  async execute() {
    const parsed = parseCardRef(this.ref);
    if (parsed.origin !== "git") {
      this.context.stderr.write("card clone requires a git+, github:, or gitlab: ref\n");
      return 1;
    }
    if (this.allowUntrustedSource) {
      this.context.stderr.write(`Warning: --allow-untrusted-source used for ${this.ref}\n`);
    }
    const card = await resolveCard(this.context.agentsDir, this.ref, {
      allowUntrustedSource: this.allowUntrustedSource,
      repoRoot: this.context.repoRoot,
      cwd: this.context.cwd,
    });
    if (this.json) {
      this.context.stdout.write(renderJson(card));
    } else {
      this.context.stdout.write(`Cloned ${card.name}@${card.version}: ${card.dir}\n`);
    }
    return 0;
  }
}
