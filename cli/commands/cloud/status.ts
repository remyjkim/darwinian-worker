// ABOUTME: Implements drwn cloud status for a Mind.
// ABOUTME: Shows latest and active deployment state, including first-deploy progress.

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { resolveCloudConfig } from "../../core/cloud-config";
import { renderJson } from "../../core/output";
import type { DeploymentsResponse, MindSummary } from "./types";
import { displayModel, displayValue } from "./types";

export class CloudStatusCommand extends BaseCommand {
  static override paths = [["cloud", "status"]];

  static override usage = BaseCommand.Usage({
    category: "Cloud",
    description: "Show the active deployment and health of a Mind.",
    details: `
      Reads the Mind list and deployment history endpoints, then prints the
      latest deployment and the active deployment separately. This makes pending
      first deployments visible before a Mind has an active serving alias.
    `,
    examples: [
      ["Check a Mind", "drwn cloud status harari"],
      ["Check a Mind as JSON", "drwn cloud status harari --json"],
    ],
  });

  slug = Option.String();

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON.",
  });

  async execute(): Promise<number> {
    const { apiBaseUrl, gatewayBaseUrl } = resolveCloudConfig();
    let mind: MindSummary | undefined;
    try {
      const res = await fetch(`${apiBaseUrl}/api/minds`);
      if (!res.ok) {
        this.context.stderr.write(`Status failed (${res.status}).\n`);
        return 1;
      }
      const { minds } = (await res.json()) as { minds: MindSummary[] };
      mind = minds.find((candidate) => candidate.slug === this.slug);
    } catch (error) {
      this.context.stderr.write(`Cannot reach Deploy API at ${apiBaseUrl}: ${(error as Error).message}\n`);
      return 1;
    }
    if (!mind) {
      this.context.stderr.write(`No Mind named "${this.slug}".\n`);
      return 1;
    }

    let history: DeploymentsResponse;
    try {
      const res = await fetch(`${apiBaseUrl}/api/minds/${this.slug}/deployments`);
      if (!res.ok) {
        this.context.stderr.write(`Status failed (${res.status}).\n`);
        return 1;
      }
      history = (await res.json()) as DeploymentsResponse;
    } catch (error) {
      this.context.stderr.write(`Cannot reach Deploy API at ${apiBaseUrl}: ${(error as Error).message}\n`);
      return 1;
    }

    const latestDeployment = history.deployments[0] ?? null;
    const activeDeployment =
      history.deployments.find((deployment) => deployment.id === history.active_deployment_id) ?? null;
    const result = { mind, active_deployment_id: history.active_deployment_id, latestDeployment, activeDeployment };
    if (this.json) {
      this.context.stdout.write(renderJson(result));
      return 0;
    }

    this.context.stdout.write(`Mind: ${mind.slug}\n`);
    this.context.stdout.write(`Latest deployment: ${latestDeployment?.id ?? "-"}\n`);
    if (latestDeployment) {
      this.context.stdout.write(`Latest status: ${latestDeployment.status}\n`);
      this.context.stdout.write(`Latest card: ${latestDeployment.card_ref}\n`);
      this.context.stdout.write(`Latest model: ${displayModel(latestDeployment.model)}\n`);
      this.context.stdout.write(`Latest content hash: ${displayValue(latestDeployment.content_hash)}\n`);
      this.context.stdout.write(`Latest updated: ${latestDeployment.updated_at}\n`);
      if (latestDeployment.error) this.context.stdout.write(`Latest error: ${latestDeployment.error}\n`);
    }
    this.context.stdout.write(`Active deployment: ${activeDeployment?.id ?? "-"}\n`);
    if (activeDeployment) {
      this.context.stdout.write(`Active status: ${activeDeployment.status}\n`);
      this.context.stdout.write(`Active card: ${activeDeployment.card_ref}\n`);
      this.context.stdout.write(`Active model: ${displayModel(activeDeployment.model)}\n`);
      if (activeDeployment.status === "ready") {
        this.context.stdout.write(`Chat: ${gatewayBaseUrl}/m/${mind.slug}/chat\n`);
      }
    }
    return 0;
  }
}
