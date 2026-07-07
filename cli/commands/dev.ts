// ABOUTME: Implements drwn dev as link + write --watch for local card iteration.
// ABOUTME: Supports --off to unlink and run a one-shot vendored write.

import { Option, UsageError } from "clipanion";
import { loadConfigLocal, writeConfigLocal, ensureCardLockLocalEntryFromSource } from "../core/config-local";
import { syncRepository } from "../core/sync";
import { normalizeWatchPath, startWriteWatch } from "../core/write-watch";
import { renderSyncResult } from "../core/output";
import { findProjectConfig, resolveProjectRootFromConfigPath } from "../core/project";
import { BaseCommand } from "./base";

export class DevCommand extends BaseCommand {
  static override paths = [["dev"]];

  static override usage = BaseCommand.Usage({
    category: "General",
    description: "Dev-link a card source and watch-write materialization.",
    details: `
      Writes a config.local.json override and runs drwn write --watch against
      linked source changes. Use dev --off to unlink and run a one-shot write.
    `,
    examples: [
      ["Dev link and watch", "drwn dev @me/operator /path/to/source"],
      ["Stop dev mode", "drwn dev --off"],
    ],
  });

  card = Option.String({ required: false });
  dir = Option.String({ required: false });
  off = Option.Boolean("--off", false, { description: "Unlink overrides and run one write." });

  async execute() {
    const projectConfigPath = findProjectConfig(this.context.cwd);
    if (!projectConfigPath) {
      throw new UsageError("Run drwn dev inside a project with .agents/drwn/config.json.");
    }
    const projectRoot = resolveProjectRootFromConfigPath(projectConfigPath);
    const local = (await loadConfigLocal(projectRoot)) ?? {};

    if (this.off) {
      delete local.overrides;
      await writeConfigLocal(projectRoot, local);
      const result = await syncRepository({
        repoRoot: this.context.repoRoot,
        agentsDir: this.context.agentsDir,
        homeDir: this.context.homeDir,
        cwd: this.context.cwd,
      });
      this.context.stdout.write(renderSyncResult(result));
      return 0;
    }

    if (!this.card || !this.dir) {
      throw new UsageError("Provide <card> <dir>, or use --off.");
    }
    local.overrides ??= {};
    local.overrides[this.card] = this.sourcePath(this.dir);
    await ensureCardLockLocalEntryFromSource(projectRoot, this.context.agentsDir, this.card, this.dir);
    await writeConfigLocal(projectRoot, local);

    const runWrite = async () => {
      const result = await syncRepository({
        repoRoot: this.context.repoRoot,
        agentsDir: this.context.agentsDir,
        homeDir: this.context.homeDir,
        cwd: this.context.cwd,
      });
      this.context.stdout.write(renderSyncResult(result));
    };
    await runWrite();
    const stop = startWriteWatch({
      projectRoot,
      extraLinkedSourceRoots: [normalizeWatchPath(this.dir)],
      onTrigger: runWrite,
    });
    await new Promise<void>((resolve) => {
      process.on("SIGINT", () => {
        stop();
        resolve();
      });
    });
    return 0;
  }

  private sourcePath(dir: string) {
    return dir.startsWith("file:") ? dir : `file:${dir}`;
  }
}
