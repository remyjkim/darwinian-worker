// ABOUTME: Implements project-first MCP activation through `drwn add mcp`.
// ABOUTME: Adds known MCP servers to project config without mutating global defaults.

import { Option, UsageError } from "clipanion";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loadConfig } from "../../core/config";
import { findLibraryMcpServer } from "../../core/library";
import { buildEffectiveState } from "../../core/effective-state";
import { projectConfigPath, setProjectServerOverride } from "../../core/project-writes";
import { searchMcp } from "../../core/search";
import { renderJson } from "../../core/output";
import type { RegistryServer } from "../../core/types";
import { BaseCommand } from "../base";

export class AddMcpCommand extends BaseCommand {
  static override paths = [["add", "mcp"]];

  static override usage = BaseCommand.Usage({
    category: "Add",
    description: "Add an MCP server to the current project. Prompts in a TTY when no name is given.",
    details: `
      Activates a known MCP server in the current project without mutating
      machine-wide defaults. Looks up the server in the local library first;
      with --yes, falls back to an unambiguous configured catalog match. If
      the current project has locked cards that declare optional MCP servers,
      those card-local definitions can also be enabled by name.

      Prompts in a TTY when no query or name is given.

      Project intent is always explicit, even when the same server is active in
      machine scope.
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
    let selectedSource: "registry" | "library" | "catalog" | "card" | null = server?.source ?? null;
    const requiredEnv = new Set<string>();
    if (!server) {
      if (this.libraryOnly) {
        throw new UsageError(`No local MCP server found: ${queryOrName}.`);
      }
      if (this.yes) {
        const config = await loadConfig(this.context.repoRoot);
        const search = await searchMcp({
          repoRoot: this.context.repoRoot,
          agentsDir: this.context.agentsDir,
          config,
          query: queryOrName,
          catalogOnly: true,
        });
        const matches = search.results.filter((result) => result.sourceGroup === "catalog" && result.kind === "mcp");
        if (matches.length === 1 && matches[0]?.kind === "mcp" && "server" in matches[0] && matches[0].server) {
          selectedId = matches[0].id;
          serverDefinition = matches[0].server;
          selectedSource = "catalog";
        } else if (matches.length > 1) {
          throw new UsageError(`Catalog MCP search is ambiguous for: ${queryOrName}`);
        }
      }

      if (!serverDefinition) {
        const cardServer = await findCardOptionalMcpServer({
          repoRoot: this.context.repoRoot,
          agentsDir: this.context.agentsDir,
          homeDir: this.context.homeDir,
          cwd: this.context.cwd,
          name: queryOrName,
        });
        if (cardServer) {
          selectedId = cardServer.id;
          serverDefinition = cardServer.server;
          selectedSource = "card";
        }
      }

      if (!serverDefinition) {
        throw new UsageError(
          this.yes
            ? `Catalog MCP search is ambiguous for: ${queryOrName}`
            : `No local MCP server found: ${queryOrName}. Use --yes to add an unambiguous catalog result.`,
        );
      }
    }

    for (const key of Object.keys(serverDefinition?.env ?? {})) {
      requiredEnv.add(key);
    }

    const configPath = projectConfigPath(this.context.cwd);
    const id = selectedId;
    const payload = {
      kind: "mcp",
      id,
      action: "enabled",
      projectConfigPath: configPath,
      projectChanges: [{ kind: "mcp", id, action: "enabled" }],
      requiredEnv: [...requiredEnv],
      next: ["drwn write --dry-run"],
    };

    if (!this.dryRun) {
      const override = selectedSource === "card" || selectedSource === "registry"
        ? { enabled: true as const }
        : { ...serverDefinition!, optional: false };
      setProjectServerOverride(this.context.cwd, id, override);
    }

    if (this.json) {
      this.context.stdout.write(renderJson(payload));
      return 0;
    }

    this.context.stdout.write(
      [
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

async function findCardOptionalMcpServer(input: {
  repoRoot: string;
  agentsDir: string;
  homeDir: string;
  cwd: string;
  name: string;
}): Promise<{ id: string; server: RegistryServer } | null> {
  const state = await buildEffectiveState({
    repoRoot: input.repoRoot,
    agentsDir: input.agentsDir,
    homeDir: input.homeDir,
    cwd: input.cwd,
  });
  if (!state.projectConfigPath) {
    return null;
  }
  const matches = state.cardServerDefinitions.filter(
    (definition) => definition.serverName === input.name && definition.server.optional === true,
  );
  const match = matches.at(-1);
  if (match) return { id: match.serverName, server: match.server };
  const inactive = state.inactiveCardServerDefinitions.find((definition) => definition.serverName === input.name);
  if (inactive) {
    const root = state.workerSelection?.installedRoots.find((entry) =>
      entry.name === inactive.cardName || entry.members.includes(inactive.cardName)
    );
    throw new UsageError(
      `MCP_DEFINITION_NOT_EFFECTIVE: ${input.name} is declared by inactive Worker root ${root?.name ?? inactive.cardName}`,
    );
  }
  return null;
}
