// ABOUTME: Implements `drwn library list` for local reusable inventory.
// ABOUTME: Surfaces skills and MCP servers without implying online catalog ownership.

import { Option, UsageError } from "clipanion";
import { listLibraryMcpServers, listLibrarySkills, type LibraryMcpServer, type LibrarySkill } from "../../core/library";
import { renderJson, renderTable } from "../../core/output";
import { BaseCommand } from "../base";

type LibraryKind = "skills" | "mcp" | "tools";

export class LibraryListCommand extends BaseCommand {
  static override paths = [["library", "list"]];

  static override usage = BaseCommand.Usage({
    category: "Library",
    description: "List local reusable inventory.",
    details: `
      Lists reusable items available through the local harness inventory under
      ~/.agents and the repo. Optionally filter by kind: skills or mcp.

      This command is read-only.
    `,
    examples: [
      ["List all library items", "drwn library list"],
      ["List only MCP servers", "drwn library list mcp"],
      ["List skills as JSON", "drwn library list skills --json"],
    ],
  });

  kind = Option.String({ required: false });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    if (this.kind && this.kind !== "skills" && this.kind !== "mcp" && this.kind !== "tools") {
      throw new UsageError(`Unsupported library kind: ${this.kind}`);
    }

    const kind = this.kind as LibraryKind | undefined;
    const skills = !kind || kind === "skills"
      ? await listLibrarySkills(this.context.repoRoot, this.context.agentsDir, this.context.homeDir)
      : [];
    const mcpServers = !kind || kind === "mcp" ? await listLibraryMcpServers(this.context.repoRoot, this.context.agentsDir) : [];
    const tools: Array<never> = [];
    const items: Array<LibrarySkill | LibraryMcpServer> = [...skills, ...mcpServers, ...tools];

    if (this.json) {
      this.context.stdout.write(renderJson(items));
      return 0;
    }

    if (items.length === 0) {
      this.context.stdout.write(kind === "tools" ? "No local tools registered yet.\n" : "No local library items found.\n");
      return 0;
    }

    const rows = items.map((item) => {
      if (item.kind === "skill") {
        return [item.id, item.kind, item.source, item.scope];
      }
      return [item.id, item.kind, item.source, item.server.transport];
    });
    this.context.stdout.write(renderTable(["id", "kind", "source", "detail"], rows));
    return 0;
  }
}
