// ABOUTME: Implements `drwn mind list` for installed generated minds.
// ABOUTME: Shows the project's available minds and ordered active stack.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Option } from "clipanion";
import { loadCardLock } from "../../core/card-lock";
import { renderJson, renderTable } from "../../core/output";
import { readProjectConfigForWrite } from "../../core/project-writes";
import { BaseCommand } from "../base";
import { requireProjectRoot } from "../card/project-command";

interface MindListEntry {
  name: string;
  version?: string;
  active: boolean;
}

export class MindListCommand extends BaseCommand {
  static override paths = [["mind", "list"]];

  static override usage = BaseCommand.Usage({
    category: "Minds",
    description: "List installed minds and the active stack.",
    details: `
      Reads generated minds.json, or falls back to card.lock, then marks which
      installed minds are currently active in project config.
    `,
    examples: [["List minds", "drwn mind list --json"]],
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const projectRoot = requireProjectRoot(this);
    const config = readProjectConfigForWrite(projectRoot);
    const installed = await readInstalledMinds(projectRoot);
    const defaultActiveMinds = config.activeMinds === undefined;
    const activeMinds = defaultActiveMinds ? installed.map((mind) => mind.name) : config.activeMinds ?? [];
    const activeSet = new Set(activeMinds);
    const minds = installed.map((mind) => ({
      ...mind,
      active: activeSet.has(mind.name),
    }));

    if (this.json) {
      this.context.stdout.write(renderJson({ minds, activeMinds, defaultActiveMinds }));
      return 0;
    }
    this.context.stdout.write(renderTable(["mind", "version", "active"], minds.map((mind) => [mind.name, mind.version ?? "", mind.active ? "yes" : ""])));
    if (defaultActiveMinds && minds.length > 0) {
      this.context.stdout.write("\nDefault: all installed minds are active. Run `drwn mind use` to pin an explicit stack.\n");
    }
    return 0;
  }
}

export async function readInstalledMinds(projectRoot: string): Promise<Array<{ name: string; version?: string }>> {
  const registryPath = join(projectRoot, ".agents", "drwn", "generated", "minds.json");
  if (existsSync(registryPath)) {
    const parsed = JSON.parse(await readFile(registryPath, "utf8")) as { minds?: Array<{ name: string; version?: string }> };
    return [...(parsed.minds ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  }
  const lock = await loadCardLock(projectRoot);
  return (lock?.cards ?? []).map((card) => ({ name: card.name, version: card.version })).sort((a, b) => a.name.localeCompare(b.name));
}
