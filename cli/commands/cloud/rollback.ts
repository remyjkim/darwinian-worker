// ABOUTME: Implements drwn cloud rollback for moving a Mind alias to an older deployment.
// ABOUTME: The Deploy API keeps immutable deployment workers; this only changes routing.

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { resolveCloudConfig } from "../../core/cloud-config";

export class CloudRollbackCommand extends BaseCommand {
  static override paths = [["cloud", "rollback"]];

  static override usage = BaseCommand.Usage({
    category: "Cloud",
    description: "Roll a Mind back to a previous deployment.",
    details: `
      Requests that Studio Deployment repoint the Mind alias to a previous ready
      deployment. Without --to, the Deploy API chooses the most recent ready
      deployment before the currently active one.
    `,
    examples: [
      ["Roll back one deployment", "drwn cloud rollback harari"],
      ["Roll back to a specific deployment", "drwn cloud rollback harari --to dep_abc123"],
    ],
  });

  slug = Option.String();

  to = Option.String("--to", {
    description: "Target deployment id.",
  });

  async execute(): Promise<number> {
    const { apiBaseUrl } = resolveCloudConfig();
    try {
      const res = await fetch(`${apiBaseUrl}/api/minds/${this.slug}/rollback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(this.to ? { to: this.to } : {}),
      });
      const body = (await res.json()) as { activeDeploymentId?: string; error?: string };
      if (!res.ok) {
        this.context.stderr.write(`Rollback failed (${res.status}): ${body.error ?? "unknown error"}\n`);
        return 1;
      }
      this.context.stdout.write(`"${this.slug}" now serves ${body.activeDeploymentId}\n`);
      return 0;
    } catch (error) {
      this.context.stderr.write(`Cannot reach Deploy API at ${apiBaseUrl}: ${(error as Error).message}\n`);
      return 1;
    }
  }
}
