// ABOUTME: Implements `drwn worker stack` for installed generated workers.
// ABOUTME: Shows the project's available workers and ordered active stack.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Option } from "clipanion";
import { loadCardLock } from "../../../core/card-lock";
import { renderJson, renderTable } from "../../../core/output";
import { readProjectConfigForWrite } from "../../../core/project-writes";
import { BaseCommand } from "../../base";
import { requireProjectRoot } from "../../card/project-command";

interface WorkerStackEntry {
  name: string;
  version?: string;
  active: boolean;
}

export class WorkerStackListCommand extends BaseCommand {
  static override paths = [["worker", "stack"]];

  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "List installed workers and the active stack.",
    details: `
      Reads generated workers.json, or falls back to card.lock, then marks which
      installed workers are currently active in project config.
    `,
    examples: [["List workers", "drwn worker stack --json"]],
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const projectRoot = requireProjectRoot(this);
    const config = readProjectConfigForWrite(projectRoot);
    const installed = await readInstalledWorkers(projectRoot);
    const defaultActiveWorkers = config.activeWorkers === undefined;
    const activeWorkers = defaultActiveWorkers ? installed.map((worker) => worker.name) : config.activeWorkers ?? [];
    const activeSet = new Set(activeWorkers);
    const workers: WorkerStackEntry[] = installed.map((worker) => ({
      ...worker,
      active: activeSet.has(worker.name),
    }));

    if (this.json) {
      this.context.stdout.write(renderJson({ workers, activeWorkers, defaultActiveWorkers }));
      return 0;
    }
    this.context.stdout.write(renderTable(["worker", "version", "active"], workers.map((worker) => [worker.name, worker.version ?? "", worker.active ? "yes" : ""])));
    if (defaultActiveWorkers && workers.length > 0) {
      this.context.stdout.write("\nDefault: all installed workers are active. Run `drwn worker stack use` to pin an explicit stack.\n");
    }
    return 0;
  }
}

export async function readInstalledWorkers(projectRoot: string): Promise<Array<{ name: string; version?: string }>> {
  const registryPath = join(projectRoot, ".agents", "drwn", "generated", "workers.json");
  if (existsSync(registryPath)) {
    const parsed = JSON.parse(await readFile(registryPath, "utf8")) as { workers?: Array<{ name: string; version?: string }> };
    return [...(parsed.workers ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  }
  const lock = await loadCardLock(projectRoot);
  return (lock?.cards ?? []).map((card) => ({ name: card.name, version: card.version })).sort((a, b) => a.name.localeCompare(b.name));
}
