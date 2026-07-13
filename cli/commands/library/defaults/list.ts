// ABOUTME: Lists explicit machine capability selections without mutating machine state.
// ABOUTME: Keeps global defaults visible without mutating inventory or project config.

import { Option } from "clipanion";
import { mergeUserMcpLibrary, resolveMachineCapabilities } from "../../../core/defaults";
import { readMachineConfig } from "../../../core/card-store";
import { loadRegistry } from "../../../core/registry";
import { buildSkillInventory } from "../../../core/skills";
import { loadMcpLibrary } from "../../../core/mcp-library";
import { renderJson, renderTable } from "../../../core/output";
import { BaseCommand } from "../../base";

export class LibraryDefaultsListCommand extends BaseCommand {
  static override paths = [["library", "defaults", "list"]];

  static override usage = BaseCommand.Usage({
    category: "Library",
    description: "List machine-wide default library items.",
    details: `
      Lists explicitly selected machine skills and MCP servers. Machine
      capabilities remain ambient and are never inherited into project config.

      This command is read-only.
    `,
    examples: [
      ["Show machine-wide defaults", "drwn library defaults list"],
      ["Show defaults as JSON", "drwn library defaults list --json"],
    ],
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const [builtInRegistry, userMcpLibrary, skills] = await Promise.all([
      loadRegistry(this.context.repoRoot),
      loadMcpLibrary(this.context.agentsDir),
      buildSkillInventory(this.context.repoRoot, this.context.agentsDir, this.context.homeDir),
    ]);
    const registry = mergeUserMcpLibrary(builtInRegistry, userMcpLibrary);
    const config = await readMachineConfig(this.context.agentsDir);
    const effective = await resolveMachineCapabilities({
      repoRoot: this.context.repoRoot,
      agentsDir: this.context.agentsDir,
    });
    const skillMap = new Map(skills.map((skill) => [skill.name, skill]));

    const payload = {
      profile: config.capabilities.profile?.id ?? null,
      skills: effective.skills.map((item) => ({
        id: item.id,
        status: "resolved",
        provenance: item.source,
        source: item.source === "profile" ? "profile" : skillMap.get(item.id)?.sourceType ?? "repo",
      })),
      mcpServers: effective.mcpServers.map((item) => ({
        id: item.id,
        status: "resolved",
        provenance: item.source,
        source: item.source === "profile"
          ? "profile"
          : builtInRegistry.servers[item.id]
            ? "built-in"
            : userMcpLibrary.servers[item.id]
              ? "library"
              : registry.servers[item.id]
                ? "registry"
                : "missing",
      })),
    };

    if (this.json) {
      this.context.stdout.write(renderJson(payload));
      return 0;
    }

    const rows = [
      ...payload.skills.map((item) => ["skill", item.id, item.provenance, item.source]),
      ...payload.mcpServers.map((item) => ["mcp", item.id, item.provenance, item.source]),
    ];
    this.context.stdout.write(rows.length > 0 ? renderTable(["kind", "id", "provenance", "source"], rows) : "No global defaults configured.\n");
    return 0;
  }
}
