// ABOUTME: Implements drwn projects for machine-wide project index operations.
// ABOUTME: Supports listing registered projects and bulk update across them.

import { Option } from "clipanion";
import { listRegisteredProjects, updateAllRegisteredProjects } from "../core/project-registry";
import { BaseCommand } from "./base";

export class ProjectsListCommand extends BaseCommand {
  static override paths = [["projects", "list"]];

  static override usage = BaseCommand.Usage({
    category: "General",
    description: "List projects registered in ~/.agents/drwn/projects.json.",
    details: `
      Shows project roots registered via drwn init or drwn use. The index is
      opt-in and widens store GC roots once present.
    `,
    examples: [["List registered projects", "drwn projects list"]],
  });

  async execute() {
    const projects = await listRegisteredProjects(this.context.agentsDir);
    if (projects.length === 0) {
      this.context.stdout.write("No registered projects.\n");
      return 0;
    }
    this.context.stdout.write(`${projects.join("\n")}\n`);
    return 0;
  }
}

export class ProjectsUpdateCommand extends BaseCommand {
  static override paths = [["projects", "update"]];

  static override usage = BaseCommand.Usage({
    category: "General",
    description: "Run drwn up in each registered project.",
    details: `
      Iterates ~/.agents/drwn/projects.json and runs the same update flow as
      drwn up in each registered project root.
    `,
    examples: [["Update all registered projects", "drwn projects update --all"]],
  });

  all = Option.Boolean("--all", false, { description: "Update every registered project." });
  fetch = Option.Boolean("--fetch", true, { description: "Fetch git remotes before checking outdated cards." });
  dryRun = Option.Boolean("--dry-run", false, { description: "Preview without updating." });

  async execute() {
    if (!this.all) {
      this.context.stderr.write("Use drwn projects update --all to refresh registered projects.\n");
      return 1;
    }
    const results = await updateAllRegisteredProjects({
      agentsDir: this.context.agentsDir,
      homeDir: this.context.homeDir,
      repoRoot: this.context.repoRoot,
      fetch: this.fetch,
      dryRun: this.dryRun,
    });
    if (results.length === 0) {
      this.context.stdout.write("No registered projects.\n");
      return 0;
    }
    for (const entry of results) {
      this.context.stdout.write(`${entry.projectRoot}: ${entry.message}\n`);
    }
    return 0;
  }
}
