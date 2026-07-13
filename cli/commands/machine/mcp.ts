// ABOUTME: Implements standalone MCP record lifecycle and explicit machine MCP selection.
// ABOUTME: Persists secret references only and keeps bundled registry definitions immutable.

import { Option, UsageError } from "clipanion";
import { readFile } from "node:fs/promises";
import { addDefaultValue, removeDefaultValue } from "../../core/defaults";
import {
  assertInventoryUnreferenced,
  scanInventoryReferenceReport,
  withLockedInventoryReferenceReport,
} from "../../core/inventory-references";
import { findStandaloneMcpRecord, listStandaloneMcpRecords } from "../../core/inventory";
import { listLibraryMcpServers } from "../../core/library";
import { mutateMachineConfig, readMachineConfigFile } from "../../core/machine-config";
import {
  createMcpLibraryRecord,
  removeMcpLibraryRecord,
  updateMcpLibraryRecord,
  validateMcpLibraryServer,
} from "../../core/mcp-library";
import { sanitizeMcpServerSecrets } from "../../core/mcp-secret-policy";
import { renderJson, renderTable } from "../../core/output";
import { loadRegistry } from "../../core/registry";
import { resolveMachineConfigPath } from "../../core/store-paths";
import type { RegistryServer } from "../../core/types";
import { BaseCommand } from "../base";

async function readServerFile(path: string, id: string): Promise<RegistryServer> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new UsageError(`Cannot read MCP server definition ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    validateMcpLibraryServer(id, parsed);
    return sanitizeMcpServerSecrets(id, parsed);
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
}

async function reservedMcpIds(repoRoot: string) {
  return Object.keys((await loadRegistry(repoRoot)).servers).sort((a, b) => a.localeCompare(b));
}

function profileMcpProvenance(machine: Awaited<ReturnType<typeof readMachineConfigFile>>, id: string) {
  return machine?.capabilities.profile?.mcpServers.includes(id)
    ? [`profile:${machine.capabilities.profile.id}`]
    : [];
}

abstract class McpJsonCommand extends BaseCommand {
  json = Option.Boolean("--json", false);

  protected output(payload: unknown, human: string) {
    this.context.stdout.write(this.json ? renderJson(payload) : `${human}\n`);
    return 0;
  }
}

export class MachineMcpListCommand extends McpJsonCommand {
  static override paths = [["machine", "mcp", "list"]];
  static override usage = BaseCommand.Usage({
    category: "Machine",
    description: "List bundled and standalone MCP definitions.",
    details: "Lists immutable registry inputs and drwn-managed standalone records without resolving environment references or credential values.",
    examples: [["List as JSON", "drwn machine mcp list --json"]],
  });

  async execute() {
    const machine = await readMachineConfigFile(resolveMachineConfigPath(this.context.agentsDir));
    const explicit = new Set(machine?.capabilities.mcpServers ?? []);
    const profile = new Set(machine?.capabilities.profile?.mcpServers ?? []);
    const records = await listStandaloneMcpRecords(this.context.agentsDir);
    const integrity = new Map(records.map((record) => [record.id, record.integrity]));
    const entries = (await listLibraryMcpServers(this.context.repoRoot, this.context.agentsDir)).map((entry) => ({
      kind: "mcp" as const,
      id: entry.id,
      owner: entry.source === "library" ? "standalone" as const : "registry" as const,
      transport: entry.server.transport,
      integrity: integrity.get(entry.id),
      enabled: explicit.has(entry.id),
      effectiveSources: [
        ...(profile.has(entry.id) ? [`profile:${machine!.capabilities.profile!.id}`] : []),
        ...(explicit.has(entry.id) ? ["explicit"] : []),
      ],
    }));
    if (this.json) return this.output(entries, "");
    if (entries.length === 0) return this.output(entries, "No machine MCP definitions available.");
    this.context.stdout.write(renderTable(
      ["id", "owner", "transport", "enabled"],
      entries.map((entry) => [entry.id, entry.owner, entry.transport, entry.enabled ? "yes" : "no"]),
    ));
    return 0;
  }
}

export class MachineMcpShowCommand extends McpJsonCommand {
  static override paths = [["machine", "mcp", "show"]];
  static override usage = BaseCommand.Usage({
    category: "Machine",
    description: "Show one bundled or standalone MCP definition.",
    details: "Shows <server-id> ownership and its stored definition without resolving secret references or credential-store values.",
    examples: [["Show a server", "drwn machine mcp show notion --json"]],
  });
  serverId = Option.String({ required: true });

  async execute() {
    const entry = (await listLibraryMcpServers(this.context.repoRoot, this.context.agentsDir))
      .find((candidate) => candidate.id === this.serverId);
    if (!entry) throw new UsageError(`Machine MCP server is not available: ${this.serverId}`);
    const standalone = entry.source === "library" ? await findStandaloneMcpRecord(this.context.agentsDir, this.serverId) : null;
    const payload = {
      kind: "mcp" as const,
      id: entry.id,
      owner: entry.source === "library" ? "standalone" as const : "registry" as const,
      server: entry.server,
      integrity: standalone?.integrity,
    };
    return this.output(payload, `${payload.id} (${payload.owner}, ${payload.server.transport})`);
  }
}

export class MachineMcpReferencesCommand extends McpJsonCommand {
  static override paths = [["machine", "mcp", "references"]];
  static override usage = BaseCommand.Usage({
    category: "Machine",
    description: "Report known references to one standalone MCP record.",
    details: "Reports references to <server-id>. Repeated --project roots extend the declared known scan scope.",
    examples: [["Inspect references", "drwn machine mcp references notion --project ./consumer --json"]],
  });
  serverId = Option.String({ required: true });
  projects = Option.Array("--project", []);

  async execute() {
    const record = await findStandaloneMcpRecord(this.context.agentsDir, this.serverId);
    if (!record) throw new UsageError(`Standalone MCP server is not installed: ${this.serverId}`);
    const report = await scanInventoryReferenceReport({ agentsDir: this.context.agentsDir, mcpIds: [this.serverId], projectRoots: this.projects });
    return this.output({ resource: { kind: "mcp", id: this.serverId }, ...report }, `${report.references.length} known reference(s) across ${report.scope.projectRoots.length} project root(s).`);
  }
}

export class MachineMcpAddCommand extends McpJsonCommand {
  static override paths = [["machine", "mcp", "add"]];
  static override usage = BaseCommand.Usage({
    category: "Machine",
    description: "Add an inactive standalone MCP record.",
    details: "Validates <file> as --as <server-id>, stores secret references only, and never enables the record automatically. --dry-run creates no managed state.",
    examples: [["Add a server", "drwn machine mcp add ./notion.json --as notion --dry-run"]],
  });
  file = Option.String({ required: true });
  serverId = Option.String("--as", { required: true });
  dryRun = Option.Boolean("--dry-run", false);

  async execute() {
    const server = await readServerFile(this.file, this.serverId);
    const reservedIds = await reservedMcpIds(this.context.repoRoot);
    if (reservedIds.includes(this.serverId)) throw new UsageError(`MCP server ${this.serverId} is owned by the immutable bundled registry.`);
    if (await findStandaloneMcpRecord(this.context.agentsDir, this.serverId)) {
      throw new UsageError(`MCP server ${this.serverId} already exists in standalone inventory.`);
    }
    if (this.dryRun) {
      return this.output({ action: "would-add", id: this.serverId, server, enabled: false }, `Would add ${this.serverId}; not enabled.`);
    }
    const added = await createMcpLibraryRecord(this.context.agentsDir, this.serverId, server, { reservedIds });
    return this.output({ ...added, enabled: false }, `Added ${this.serverId}; not enabled.`);
  }
}

abstract class McpReferenceMutationCommand extends McpJsonCommand {
  serverId = Option.String({ required: true });
  projects = Option.Array("--project", []);
  dryRun = Option.Boolean("--dry-run", false);
}

export class MachineMcpUpdateCommand extends McpReferenceMutationCommand {
  static override paths = [["machine", "mcp", "update"]];
  static override usage = BaseCommand.Usage({
    category: "Machine",
    description: "Update one standalone MCP record atomically.",
    details: "Updates <server-id> from --from <file>. Repeated --project roots extend reference disclosure; same-ID references do not block behavior updates.",
    examples: [["Update a server", "drwn machine mcp update notion --from ./notion.json --project ./consumer"]],
  });
  file = Option.String("--from", { required: true });

  async execute() {
    if (!await findStandaloneMcpRecord(this.context.agentsDir, this.serverId)) {
      throw new UsageError(`Standalone MCP server is not installed: ${this.serverId}`);
    }
    const server = await readServerFile(this.file, this.serverId);
    const reservedIds = await reservedMcpIds(this.context.repoRoot);
    if (this.dryRun) {
      const report = await scanInventoryReferenceReport({ agentsDir: this.context.agentsDir, mcpIds: [this.serverId], projectRoots: this.projects });
      return this.output({ action: "would-update", id: this.serverId, ...report }, `Would update ${this.serverId}; ${report.references.length} known reference(s).`);
    }
    return withLockedInventoryReferenceReport({
      agentsDir: this.context.agentsDir,
      mcpIds: [this.serverId],
      projectRoots: this.projects,
    }, async (report) => {
      const updated = await updateMcpLibraryRecord(this.context.agentsDir, this.serverId, server, { reservedIds });
      return this.output({ ...updated, ...report }, `Updated ${this.serverId}; ${report.references.length} known reference(s).`);
    });
  }
}

export class MachineMcpRemoveCommand extends McpReferenceMutationCommand {
  static override paths = [["machine", "mcp", "remove"]];
  static override usage = BaseCommand.Usage({
    category: "Machine",
    description: "Remove one unreferenced standalone MCP record.",
    details: "Removes <server-id> only after machine and known project references are empty. Repeated --project roots extend the scan; there is no force bypass.",
    examples: [["Preview removal", "drwn machine mcp remove notion --project ./consumer --dry-run"]],
  });

  async execute() {
    if (!await findStandaloneMcpRecord(this.context.agentsDir, this.serverId)) {
      throw new UsageError(`Standalone MCP server is not installed: ${this.serverId}`);
    }
    if (this.dryRun) {
      const report = await scanInventoryReferenceReport({ agentsDir: this.context.agentsDir, mcpIds: [this.serverId], projectRoots: this.projects });
      assertInventoryUnreferenced(this.serverId, [this.serverId], report.references);
      return this.output({ action: "would-remove", id: this.serverId, ...report }, `Would remove ${this.serverId}.`);
    }
    return withLockedInventoryReferenceReport({
      agentsDir: this.context.agentsDir,
      mcpIds: [this.serverId],
      projectRoots: this.projects,
    }, async (report) => {
      assertInventoryUnreferenced(this.serverId, [this.serverId], report.references);
      const removed = await removeMcpLibraryRecord(this.context.agentsDir, this.serverId);
      return this.output({ action: "removed", ...removed, ...report }, `Removed ${this.serverId}.`);
    });
  }
}

abstract class MachineMcpSelectionCommand extends McpJsonCommand {
  serverId = Option.String({ required: true });
  dryRun = Option.Boolean("--dry-run", false);

  protected async setEnabled(enabled: boolean) {
    if (enabled) {
      const entry = (await listLibraryMcpServers(this.context.repoRoot, this.context.agentsDir))
        .find((candidate) => candidate.id === this.serverId);
      if (!entry || entry.server.transport === "platform-provided") {
        throw new UsageError(`Machine MCP server is not available for explicit enablement: ${this.serverId}`);
      }
    }
    const result = await mutateMachineConfig(this.context.agentsDir, (config) => {
      const wasEnabled = config.capabilities.mcpServers.includes(this.serverId);
      config.capabilities.mcpServers = enabled
        ? addDefaultValue(config.capabilities.mcpServers, this.serverId)
        : removeDefaultValue(config.capabilities.mcpServers, this.serverId);
      return {
        config,
        value: {
          wasEnabled,
          remainingProvenance: enabled ? [] : profileMcpProvenance(config, this.serverId),
        },
      };
    }, { dryRun: this.dryRun });
    const action = enabled
      ? result.wasEnabled ? "already-enabled" : this.dryRun ? "would-enable" : "enabled"
      : result.wasEnabled ? this.dryRun ? "would-disable" : "disabled" : "already-disabled";
    return this.output({ kind: "mcp", id: this.serverId, action, remainingProvenance: result.remainingProvenance }, `${action.replaceAll("-", " ")}: ${this.serverId}`);
  }
}

export class MachineMcpEnableCommand extends MachineMcpSelectionCommand {
  static override paths = [["machine", "mcp", "enable"]];
  static override usage = BaseCommand.Usage({
    category: "Machine",
    description: "Enable one explicit machine MCP capability.",
    details: "Adds <server-id> to explicit machine capability intent without changing project declarations or inventory ownership.",
    examples: [["Enable a server", "drwn machine mcp enable notion"]],
  });
  execute() { return this.setEnabled(true); }
}

export class MachineMcpDisableCommand extends MachineMcpSelectionCommand {
  static override paths = [["machine", "mcp", "disable"]];
  static override usage = BaseCommand.Usage({
    category: "Machine",
    description: "Disable one explicit machine MCP capability.",
    details: "Removes <server-id> only from explicit machine intent and reports profile provenance when the capability remains effective.",
    examples: [["Disable a server", "drwn machine mcp disable notion"]],
  });
  execute() { return this.setEnabled(false); }
}
