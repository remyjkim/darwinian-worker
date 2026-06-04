// ABOUTME: Implements `drwn card catalog publish` for catalog-backed card discovery.
// ABOUTME: Keeps shared catalog publication explicit and scriptable.

import { Option, UsageError } from "clipanion";
import {
  publishCardToCatalog,
  type CatalogPublishMode,
  type PublishCardToCatalogResult,
} from "../../core/card-catalog-publish";
import { DrwnError } from "../../core/errors";
import { renderJson } from "../../core/output";
import { BaseCommand } from "../base";

export class CardCatalogPublishCommand extends BaseCommand {
  static override paths = [["card", "catalog", "publish"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Publish an immutable card ref into a card catalog.",
    details: `
      Adds or updates one card entry in a catalog.json manifest. Local mode
      edits a checked-out catalog directory without committing. Direct mode
      clones or opens the catalog worktree, commits catalog.json, pushes the
      current branch, and refreshes a registered catalog cache when possible.
    `,
    examples: [
      [
        "Preview a catalog entry",
        "drwn card catalog publish @team/backend@1.0.0 --catalog ./cards-catalog --mode local --dry-run --json",
      ],
      [
        "Publish to a registered team catalog",
        "drwn card catalog publish @team/backend@1.0.0 --catalog @team --mode direct",
      ],
    ],
  });

  cardRef = Option.String({ required: true });

  catalog = Option.String("--catalog", {
    required: true,
    description: "Catalog target: registered scope, Git URL, or local catalog directory.",
  });

  mode = Option.String("--mode", {
    required: true,
    description: "Catalog publish mode: local or direct.",
  });

  name = Option.String("--name", {
    required: false,
    description: "Unscoped catalog entry name. Defaults to the card manifest name without scope.",
  });

  description = Option.String("--description", {
    required: false,
    description: "Catalog entry description. Defaults to the card manifest description.",
  });

  tags = Option.Array("--tag", [], {
    description: "Catalog entry tag. Repeat to provide multiple tags.",
  });

  url = Option.String("--url", {
    required: false,
    description: "Explicit installable card URL for the catalog entry.",
  });

  replace = Option.Boolean("--replace", false, {
    description: "Replace an existing catalog entry with the same name.",
  });

  dryRun = Option.Boolean("--dry-run", false, {
    description: "Validate and report the planned catalog change without writing.",
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    try {
      let mode: CatalogPublishMode;
      if (this.mode === "local" || this.mode === "direct") {
        mode = this.mode;
      } else {
        throw new UsageError("--mode must be one of: local, direct");
      }
      const result = await publishCardToCatalog({
        agentsDir: this.context.agentsDir,
        cardRef: this.cardRef,
        catalog: this.catalog,
        mode,
        name: this.name,
        description: this.description,
        tags: this.tags,
        url: this.url,
        replace: this.replace,
        dryRun: this.dryRun,
      });
      this.context.stdout.write(this.json ? renderJson(result) : renderHumanResult(result, this.dryRun));
      return 0;
    } catch (error) {
      if (this.json) {
        this.context.stderr.write(renderJson({ ok: false, error: serializeError(error) }));
      } else {
        this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      }
      return 1;
    }
  }
}

function renderHumanResult(result: PublishCardToCatalogResult, dryRun: boolean) {
  const lines = [summaryLine(result, dryRun)];
  if (result.commit) {
    lines.push(`Commit: ${result.commit}`);
  }
  for (const warning of result.warnings) {
    lines.push(`Warning: ${warning}`);
  }
  if (result.next.length > 0) {
    lines.push("Next:");
    for (const command of result.next) {
      lines.push(`  ${command}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function summaryLine(result: PublishCardToCatalogResult, dryRun: boolean) {
  if (result.action === "noop") {
    return `No changes for ${result.entry.name} in ${result.catalog.scope} catalog`;
  }
  const verb = result.action === "add" ? "add" : "replace";
  if (dryRun) {
    return `Would ${verb} ${result.entry.name} to ${result.catalog.scope} catalog`;
  }
  return `${result.action === "add" ? "Added" : "Replaced"} ${result.entry.name} to ${result.catalog.scope} catalog`;
}

function serializeError(error: unknown) {
  if (error instanceof DrwnError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.hints ? { hints: error.hints } : {}),
    };
  }
  return {
    code: "DRWN_ERROR",
    message: error instanceof Error ? error.message : String(error),
  };
}
