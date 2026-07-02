// ABOUTME: Implements drwn cloud delete for removing a deployed Mind.
// ABOUTME: Requires --force for destructive deletion until interactive confirmation exists.

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { resolveCloudConfig } from "../../core/cloud-config";

export class CloudDeleteCommand extends BaseCommand {
  static override paths = [["cloud", "delete"]];

  static override usage = BaseCommand.Usage({
    category: "Cloud",
    description: "Delete a Mind and all of its deployments.",
    details: `
      Sends a destructive delete request for the Mind slug, including its
      deployments and aliases. This command requires --force so scripted usage is
      explicit and accidental deletes fail before making a network request.
    `,
    examples: [
      ["Delete a Mind", "drwn cloud delete harari --force"],
      ["See the safety check", "drwn cloud delete harari"],
    ],
  });

  slug = Option.String();

  force = Option.Boolean("--force", false, {
    description: "Skip the confirmation prompt.",
  });

  async execute(): Promise<number> {
    if (!this.force) {
      this.context.stderr.write(`Refusing to delete "${this.slug}" without --force.\n`);
      return 1;
    }
    const { apiBaseUrl } = resolveCloudConfig();
    try {
      const res = await fetch(`${apiBaseUrl}/api/minds/${this.slug}`, { method: "DELETE" });
      if (!res.ok) {
        this.context.stderr.write(`Delete failed (${res.status}): ${await res.text()}\n`);
        return 1;
      }
      this.context.stdout.write(`Deleted "${this.slug}".\n`);
      return 0;
    } catch (error) {
      this.context.stderr.write(`Cannot reach Deploy API at ${apiBaseUrl}: ${(error as Error).message}\n`);
      return 1;
    }
  }
}
