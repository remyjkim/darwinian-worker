// ABOUTME: Implements `bgng library show` for inspecting local inventory items.
// ABOUTME: Resolves exact skill and MCP ids with stable JSON output.

import { Option, UsageError } from "clipanion";
import { findLibraryMcpServer, findLibrarySkill } from "../../core/library";
import { renderJson } from "../../core/output";
import { BaseCommand } from "../base";

export class LibraryShowCommand extends BaseCommand {
  static override paths = [["library", "show"]];

  static override usage = BaseCommand.Usage({
    category: "Library",
    description: "Show one local library item.",
    details: `
      Shows one skill or MCP server from the local reusable inventory. Skills
      include scope and source metadata; MCP servers include transport and
      server definition details.
    `,
    examples: [
      ["Show a skill", "bgng library show alpha"],
      ["Show an MCP server as JSON", "bgng library show context7 --json"],
    ],
  });

  id = Option.String({ required: true });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const skill = await findLibrarySkill(this.context.repoRoot, this.context.agentsDir, this.context.homeDir, this.id);
    const mcpServer = await findLibraryMcpServer(this.context.repoRoot, this.id, this.context.agentsDir);
    if (skill && mcpServer) {
      throw new UsageError(`Ambiguous library id: ${this.id}`);
    }
    const item = skill ?? mcpServer;
    if (!item) {
      throw new UsageError(`Unknown library item: ${this.id}`);
    }

    if (this.json) {
      this.context.stdout.write(renderJson(item));
      return 0;
    }

    if (item.kind === "skill") {
      this.context.stdout.write(
        [
          `id: ${item.id}`,
          "kind: skill",
          `source: ${item.source}`,
          `scope: ${item.scope}`,
          `path: ${item.path}`,
        ].join("\n") + "\n",
      );
      return 0;
    }

    this.context.stdout.write(
      [
        `id: ${item.id}`,
        "kind: mcp",
        `source: ${item.source}`,
        `transport: ${item.server.transport}`,
        `description: ${item.server.description}`,
      ].join("\n") + "\n",
    );
    return 0;
  }
}
