// ABOUTME: Implements drwn store seed for populating an empty store from a snapshot.
// ABOUTME: Designed for CI base images and airgapped deployments.

import { Option } from "clipanion";
import { existsSync, statSync } from "node:fs";
import { seedStore, type SeedSource } from "../../core/store-seed";
import { BaseCommand } from "../base";

export class StoreSeedCommand extends BaseCommand {
  static override paths = [["store", "seed"]];

  static override usage = BaseCommand.Usage({
    category: "Store",
    description: "Populate an empty drwn store from a tarball or directory.",
    details: `
      Unpacks a previously exported drwn store snapshot into ~/.agents/drwn.
      Refuses to overwrite a non-empty store unless --force is passed.
    `,
    examples: [
      ["Seed from a tarball", "drwn store seed --from /seed/drwn-store.tar"],
      ["Seed from a directory", "drwn store seed --from /seed/drwn-store"],
    ],
  });

  from = Option.String("--from", {
    required: true,
    description: "Tarball or directory to seed from.",
  });

  force = Option.Boolean("--force", false, {
    description: "Allow overwriting an existing store.",
  });

  async execute() {
    if (!existsSync(this.from)) {
      this.context.stderr.write(`Seed source not found: ${this.from}\n`);
      return 1;
    }
    const kind: SeedSource["kind"] = statSync(this.from).isDirectory() ? "dir" : "tar";
    try {
      const result = await seedStore({
        agentsDir: this.context.agentsDir,
        source: { kind, path: this.from },
        force: this.force,
      });
      this.context.stdout.write(`Seeded ${this.context.agentsDir}/drwn at ${result.seededAt}\n`);
      return 0;
    } catch (error) {
      this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
  }
}
