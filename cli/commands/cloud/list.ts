// ABOUTME: Implements drwn cloud list for deployed Minds.
// ABOUTME: Supports both human table output and stable JSON for scripts.

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { resolveCloudConfig } from "../../core/cloud-config";
import { renderJson, renderTable } from "../../core/output";
import type { MindSummary } from "./types";
import { displayModel, displayValue } from "./types";

export class CloudListCommand extends BaseCommand {
  static override paths = [["cloud", "list"]];

  static override usage = BaseCommand.Usage({
    category: "Cloud",
    description: "List your deployed Minds.",
    details: `
      Calls the Studio Deploy API and shows each Mind slug, latest status,
      active deployment id, resolved model, and update timestamp. Use --json for
      a direct API-shaped response that is easier to consume from automation.
    `,
    examples: [
      ["List deployed Minds", "drwn cloud list"],
      ["List deployed Minds as JSON", "drwn cloud list --json"],
    ],
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON.",
  });

  async execute(): Promise<number> {
    const { apiBaseUrl } = resolveCloudConfig();
    let minds: MindSummary[];
    try {
      const res = await fetch(`${apiBaseUrl}/api/minds`);
      if (!res.ok) {
        this.context.stderr.write(`List failed (${res.status}).\n`);
        return 1;
      }
      minds = ((await res.json()) as { minds: MindSummary[] }).minds;
    } catch (error) {
      this.context.stderr.write(`Cannot reach Deploy API at ${apiBaseUrl}: ${(error as Error).message}\n`);
      return 1;
    }

    if (this.json) {
      this.context.stdout.write(renderJson(minds));
      return 0;
    }
    if (minds.length === 0) {
      this.context.stdout.write("No Minds deployed.\n");
      return 0;
    }
    this.context.stdout.write(
      renderTable(
        ["slug", "status", "active_deployment", "model", "updated"],
        minds.map((mind) => [
          mind.slug,
          mind.status,
          displayValue(mind.active_deployment_id),
          displayModel(mind.model),
          displayValue(mind.updated_at),
        ]),
      ),
    );
    return 0;
  }
}
