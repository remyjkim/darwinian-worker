// ABOUTME: Lists machine-wide default skills, MCP servers, and extensions.
// ABOUTME: Keeps global defaults visible without mutating inventory or project config.

import { Option } from "clipanion";
import { loadConfig } from "../../../core/config";
import { mergeUserMcpLibrary } from "../../../core/defaults";
import { resolveDefaultMcpNames, resolveDefaultSkillNames } from "../../../core/defaults";
import { getExtension } from "../../../core/extensions/registry";
import { loadRegistry } from "../../../core/registry";
import { buildSkillInventory } from "../../../core/skills";
import { initializeUserConfigFromPackagedDefaults, loadEffectiveConfig } from "../../../core/user-config";
import { loadMcpLibrary } from "../../../core/mcp-library";
import { renderJson, renderTable } from "../../../core/output";
import { BaseCommand } from "../../base";

export class LibraryDefaultsListCommand extends BaseCommand {
  static override paths = [["library", "defaults", "list"]];

  static override usage = BaseCommand.Usage({
    category: "Library",
    description: "List machine-wide default library items.",
    details: `
      Lists machine-wide default skills and MCP servers. These defaults are
      included in every effective config unless a project overlay disables or
      overrides them.

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
    const [repoConfig, builtInRegistry, userMcpLibrary, skills] = await Promise.all([
      loadConfig(this.context.repoRoot),
      loadRegistry(this.context.repoRoot),
      loadMcpLibrary(this.context.agentsDir),
      buildSkillInventory(this.context.repoRoot, this.context.agentsDir, this.context.homeDir),
    ]);
    const registry = mergeUserMcpLibrary(builtInRegistry, userMcpLibrary);
    const loaded = await loadEffectiveConfig(repoConfig, this.context.agentsDir);
    const config = loaded.userConfigPath
      ? loaded.config
      : await initializeUserConfigFromPackagedDefaults(repoConfig, registry, this.context.agentsDir);
    const skillMap = new Map(skills.map((skill) => [skill.name, skill]));

    const payload = {
      skills: resolveDefaultSkillNames(config).map((id) => ({
        id,
        status: skillMap.has(id) ? "resolved" : "missing",
        source: skillMap.get(id)?.sourceType ?? "repo",
      })),
      mcpServers: resolveDefaultMcpNames(config, registry).map((id) => ({
        id,
        status: registry.servers[id] ? "resolved" : "missing",
        source: builtInRegistry.servers[id] ? "built-in" : userMcpLibrary.servers[id] ? "library" : "missing",
      })),
      extensions: Object.keys(config.defaults?.extensions ?? {}).map((id) => ({
        id,
        status: getExtension(id) ? "resolved" : "missing",
      })),
    };

    if (this.json) {
      this.context.stdout.write(renderJson(payload));
      return 0;
    }

    const rows = [
      ...payload.skills.map((item) => ["skill", item.id, item.status, item.source]),
      ...payload.mcpServers.map((item) => ["mcp", item.id, item.status, item.source]),
      ...payload.extensions.map((item) => ["extension", item.id, item.status, "extension"]),
    ];
    this.context.stdout.write(rows.length > 0 ? renderTable(["kind", "id", "status", "source"], rows) : "No global defaults configured.\n");
    return 0;
  }
}
