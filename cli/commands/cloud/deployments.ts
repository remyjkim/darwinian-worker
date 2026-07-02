// ABOUTME: Implements drwn cloud deployments for per-Mind deployment history.
// ABOUTME: Marks the active deployment and supports stable JSON output.

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { resolveCloudConfig } from "../../core/cloud-config";
import { renderJson, renderTable } from "../../core/output";
import type { DeploymentsResponse } from "./types";
import { displayModel, displayValue } from "./types";

export class CloudDeploymentsCommand extends BaseCommand {
  static override paths = [["cloud", "deployments"]];

  static override usage = BaseCommand.Usage({
    category: "Cloud",
    description: "Show deployment history for a Mind.",
    details: `
      Calls the deployment history endpoint for one Mind and renders each
      deployment with status, card ref, model, content hash, timestamps, and any
      error text. The active deployment is marked with an asterisk.
    `,
    examples: [
      ["Show deployment history", "drwn cloud deployments harari"],
      ["Show deployment history as JSON", "drwn cloud deployments harari --json"],
    ],
  });

  slug = Option.String();

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON.",
  });

  async execute(): Promise<number> {
    const { apiBaseUrl } = resolveCloudConfig();
    let body: DeploymentsResponse;
    try {
      const res = await fetch(`${apiBaseUrl}/api/minds/${this.slug}/deployments`);
      if (!res.ok) {
        this.context.stderr.write(`Deployments failed (${res.status}).\n`);
        return 1;
      }
      body = (await res.json()) as DeploymentsResponse;
    } catch (error) {
      this.context.stderr.write(`Cannot reach Deploy API at ${apiBaseUrl}: ${(error as Error).message}\n`);
      return 1;
    }

    if (this.json) {
      this.context.stdout.write(renderJson(body));
      return 0;
    }
    if (body.deployments.length === 0) {
      this.context.stdout.write(`No deployments for ${this.slug}.\n`);
      return 0;
    }
    this.context.stdout.write(
      renderTable(
        ["active", "deployment", "status", "card", "model", "content_hash", "created", "updated", "error"],
        body.deployments.map((deployment) => [
          deployment.id === body.active_deployment_id ? "*" : "",
          deployment.id,
          deployment.status,
          deployment.card_ref,
          displayModel(deployment.model),
          displayValue(deployment.content_hash),
          deployment.created_at,
          deployment.updated_at,
          displayValue(deployment.error),
        ]),
      ),
    );
    return 0;
  }
}
