// ABOUTME: Implements project-first MCP activation through `drwn add mcp`.
// ABOUTME: Adds known MCP servers to project config without mutating global defaults.

import { Option, UsageError } from "clipanion";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loadConfig } from "../../core/config";
import { loadEffectiveConfig } from "../../core/user-config";
import { findLibraryMcpServer } from "../../core/library";
import { projectConfigPath, setProjectServerOverride } from "../../core/project-writes";
import { searchMcp } from "../../core/search";
import { renderJson } from "../../core/output";
import { BaseCommand } from "../base";

export class AddMcpCommand extends BaseCommand {
  static override paths = [["add", "mcp"]];

  static override usage = BaseCommand.Usage({
    category: "Add",
    description: "Add an MCP server to the current project. Prompts in a TTY when no name is given; re-adding an already-default server is a safe no-op.",
    details: `
      Activates a known MCP server in the current project without mutating
      machine-wide defaults. Looks up the server in the local library first;
      with --yes, falls back to an unambiguous configured catalog match.

      Prompts in a TTY when no query or name is given. Re-adding a server that
      is already active by global default is a safe no-op and does not write a
      project override.
    `,
    examples: [
      ["Add a registry server to this project", "drwn add mcp context7"],
      ["Accept an unambiguous catalog match", "drwn add mcp github --yes"],
      ["Preview without writing project config", "drwn add mcp context7 --dry-run"],
    ],
  });

  queryOrName = Option.String({ required: false });

  libraryOnly = Option.Boolean("--library", false, {
    description: "Only search the local library.",
  });

  dryRun = Option.Boolean("--dry-run", false, {
    description: "Preview project config changes without writing.",
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  yes = Option.Boolean("--yes", false, {
    description: "Confirm non-interactive catalog add when the result is unambiguous.",
  });

  async execute() {
    const queryOrName = this.queryOrName ?? await this.resolveGuidedQuery();
    if (!queryOrName) {
      throw new UsageError("Pass an MCP server name or query. Guided add requires a TTY.");
    }

    const server = await findLibraryMcpServer(this.context.repoRoot, queryOrName, this.context.agentsDir);
    let serverDefinition = server?.server;
    let selectedId = server?.id ?? queryOrName;
    const requiredEnv = new Set<string>();
    if (!server) {
      if (this.libraryOnly) {
        throw new UsageError(`No local MCP server found: ${queryOrName}.`);
      }
      if (!this.yes) {
        throw new UsageError(`No local MCP server found: ${queryOrName}. Use --yes to add an unambiguous catalog result.`);
      }
      const config = await loadConfig(this.context.repoRoot);
      const search = await searchMcp({
        repoRoot: this.context.repoRoot,
        agentsDir: this.context.agentsDir,
        config,
        query: queryOrName,
        catalogOnly: true,
      });
      const matches = search.results.filter((result) => result.sourceGroup === "catalog" && result.kind === "mcp");
      if (matches.length !== 1 || matches[0]?.kind !== "mcp" || !("server" in matches[0]) || !matches[0].server) {
        throw new UsageError(`Catalog MCP search is ambiguous for: ${queryOrName}`);
      }
      selectedId = matches[0].id;
      serverDefinition = matches[0].server;
      for (const key of Object.keys(serverDefinition.env ?? {})) {
        requiredEnv.add(key);
      }
    }

    const configPath = projectConfigPath(this.context.cwd);
    const id = selectedId;
    const effective = await loadEffectiveConfig(await loadConfig(this.context.repoRoot), this.context.agentsDir);
    const alreadyDefault = effective.config.defaults?.mcpServers?.includes(id) === true;
    const payload = {
      kind: "mcp",
      id,
      action: alreadyDefault ? "already-active" : "enabled",
      projectConfigPath: configPath,
      projectChanges: alreadyDefault ? [] : [{ kind: "mcp", id, action: "enabled" }],
      requiredEnv: [...requiredEnv],
      next: ["drwn write --dry-run"],
    };

    if (!this.dryRun && !alreadyDefault) {
      setProjectServerOverride(this.context.cwd, id, server ? { enabled: true } : serverDefinition!);
    }

    if (this.json) {
      this.context.stdout.write(renderJson(payload));
      return 0;
    }

    this.context.stdout.write(
      alreadyDefault
        ? [
            `${id} is already active by global default.`,
            "No project override needed.",
            "",
            "Next:",
            "  drwn write --dry-run",
          ].join("\n") + "\n"
        : [
            `Added ${id} to this project.`,
            ...(this.dryRun ? [`Would update ${configPath}`] : [`Updated ${configPath}`]),
            ...([...requiredEnv].length > 0 ? [`Required environment: ${[...requiredEnv].join(", ")}`] : []),
            "",
            "Next:",
            "  drwn write --dry-run",
          ].join("\n") + "\n",
    );
    return 0;
  }

  private async resolveGuidedQuery() {
    if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) {
      return undefined;
    }
    const rl = createInterface({ input, output });
    try {
      return (await rl.question("MCP server name or search query: ")).trim() || undefined;
    } finally {
      rl.close();
    }
  }
}
