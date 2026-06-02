// ABOUTME: Implements drwn store export for creating read-only store archives.
// ABOUTME: Archives ~/.agents/drwn for transfer or inspection.

import { Option } from "clipanion";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { resolveStoreRoot } from "../../core/store-paths";
import { BaseCommand } from "../base";

export class StoreExportCommand extends BaseCommand {
  static override paths = [["store", "export"]];

  static override usage = BaseCommand.Usage({
    category: "Store",
    description: "Export the local drwn store as a tar archive.",
    details: `
      Writes a tar archive containing the local ~/.agents/drwn store. The
      archive can be mounted or unpacked read-only for validation workflows.
    `,
    examples: [["Export the store", "drwn store export --out /tmp/drwn-store.tar"]],
  });

  out = Option.String("--out", { required: true, description: "Output tar archive path." });

  async execute() {
    await mkdir(dirname(this.out), { recursive: true });
    const proc = Bun.spawn(["tar", "-cf", this.out, "-C", this.context.agentsDir, "drwn"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      this.context.stderr.write(stderr);
      return 1;
    }
    this.context.stdout.write(`Exported ${resolveStoreRoot(this.context.agentsDir)} to ${this.out}\n`);
    return 0;
  }
}
