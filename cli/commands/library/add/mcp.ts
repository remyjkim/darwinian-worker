// ABOUTME: Registers reusable MCP server definitions in the local library.
// ABOUTME: Keeps MCP inventory separate from project activation and global defaults.

import { Option, UsageError } from "clipanion";
import { existsSync, readFileSync } from "node:fs";
import { loadMcpLibrary, saveMcpLibrary, validateMcpLibraryServer } from "../../../core/mcp-library";
import { loadRegistry } from "../../../core/registry";
import { renderJson } from "../../../core/output";
import type { RegistryServer } from "../../../core/types";
import { BaseCommand } from "../../base";

function parseServerFile(path: string, id?: string): { id: string; server: RegistryServer } {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as RegistryServer | { servers?: Record<string, RegistryServer> };

  if ("servers" in parsed && parsed.servers) {
    const entries = Object.entries(parsed.servers);
    if (id) {
      const server = parsed.servers[id];
      if (!server) {
        throw new UsageError(`No MCP server named ${id} in ${path}.`);
      }
      validateMcpLibraryServer(id, server);
      return { id, server };
    }
    if (entries.length !== 1) {
      throw new UsageError("Use --as <id> to select an MCP server from a multi-server file.");
    }
    const [entryId, server] = entries[0]!;
    validateMcpLibraryServer(entryId, server);
    return { id: entryId, server };
  }

  if (!id) {
    throw new UsageError("Use --as <id> when adding a single MCP server definition file.");
  }
  validateMcpLibraryServer(id, parsed);
  return { id, server: parsed };
}

export class LibraryAddMcpCommand extends BaseCommand {
  static override paths = [["library", "add", "mcp"]];

  static override usage = BaseCommand.Usage({
    category: "Library",
    description: "Add an MCP server to the local library.",
    details: `
      Adds an MCP server definition, or one selected server from a multi-server
      JSON file, to the local reusable MCP library. This does not activate the
      server in global defaults or in the current project.

      Use --as to name a single-server file or to select one entry from a
      multi-server file. Use --replace to overwrite an existing local entry.
    `,
    examples: [
      ["Add a single-server definition", "drwn library add mcp ./github-mcp.json --as github"],
      ["Select one server from a multi-server file", "drwn library add mcp ./registry.json --as github"],
      ["Preview a replacement", "drwn library add mcp ./github-mcp.json --as github --replace --dry-run"],
    ],
  });

  spec = Option.String({ required: true });

  as = Option.String("--as", { required: false, description: "Register or select the MCP server with this id." });

  replace = Option.Boolean("--replace", false, {
    description: "Replace an existing user library MCP entry.",
  });

  dryRun = Option.Boolean("--dry-run", false, {
    description: "Preview local library changes without writing.",
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    if (!existsSync(this.spec)) {
      throw new UsageError(`MCP library add currently requires a local JSON file: ${this.spec}`);
    }

    const selected = parseServerFile(this.spec, this.as);
    const [registry, library] = await Promise.all([
      loadRegistry(this.context.repoRoot),
      loadMcpLibrary(this.context.agentsDir),
    ]);
    if (registry.servers[selected.id]) {
      throw new UsageError(`MCP server "${selected.id}" already exists in the built-in registry.`);
    }
    if (library.servers[selected.id] && !this.replace) {
      throw new UsageError(`MCP server "${selected.id}" already exists in the local library. Use --replace to update it.`);
    }

    const next = {
      version: 1,
      servers: {
        ...library.servers,
        [selected.id]: selected.server,
      },
    };
    const path = this.dryRun ? undefined : await saveMcpLibrary(this.context.agentsDir, next);
    const payload = {
      kind: "mcp",
      id: selected.id,
      action: library.servers[selected.id] ? "replaced" : "added",
      path,
      next: [`drwn library defaults add mcp ${selected.id}`, `drwn add mcp ${selected.id}`],
    };

    if (this.json) {
      this.context.stdout.write(renderJson(payload));
      return 0;
    }

    this.context.stdout.write(
      [
        `${this.dryRun ? "Would add" : "Added"} ${selected.id} to the local library.`,
        "",
        "Next:",
        `  drwn library defaults add mcp ${selected.id}`,
        `  drwn add mcp ${selected.id}`,
      ].join("\n") + "\n",
    );
    return 0;
  }
}
