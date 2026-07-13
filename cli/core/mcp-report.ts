// ABOUTME: Computes write-time visibility for optional MCPs declared by cards.
// ABOUTME: Keeps card optional-MCP reporting pure and independent of file writes.

import type { CardLockEntry } from "./card-lock";
import { isRegistryServerDefinition } from "./card-mcp";
import type { CanonicalRegistry, ProjectConfig, RegistryServer } from "./types";

export type OptionalMcpReportStatus = "active" | "skipped" | "shadowed";

export interface OptionalMcpReportEntry {
  cardName: string;
  cardVersion: string;
  serverName: string;
  status: OptionalMcpReportStatus;
  reason?: "optional-disabled" | "definition-shadowed";
  optInCommand?: string;
}

export interface OptionalMcpReport {
  entries: OptionalMcpReportEntry[];
  skippedCount: number;
  shadowedCount: number;
}

export interface OptionalMcpReportInput {
  lockedCards: CardLockEntry[];
  activeServers: Record<string, RegistryServer>;
  effectiveRegistry: CanonicalRegistry;
  projectConfigPath: string | null;
  projectServerOverrides: ProjectConfig["mcpServers"] | undefined;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entryValue]) => [key, stableValue(entryValue)]),
    );
  }
  return value;
}

function serversEqual(left: RegistryServer, right: RegistryServer) {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

export function computeOptionalMcpReport(input: OptionalMcpReportInput): OptionalMcpReport | null {
  const entries: OptionalMcpReportEntry[] = [];
  let skippedCount = 0;
  let shadowedCount = 0;

  for (const card of input.lockedCards) {
    for (const [serverName, server] of Object.entries(card.manifest.servers ?? {})) {
      if (!isRegistryServerDefinition(server) || server.optional !== true) {
        continue;
      }

      const active = input.activeServers[serverName];
      if (!active) {
        entries.push({
          cardName: card.name,
          cardVersion: card.version,
          serverName,
          status: "skipped",
          reason: "optional-disabled",
          ...(input.projectConfigPath ? { optInCommand: `drwn add mcp ${serverName}` } : {}),
        });
        skippedCount++;
        continue;
      }

      if (!serversEqual(active, server)) {
        entries.push({
          cardName: card.name,
          cardVersion: card.version,
          serverName,
          status: "shadowed",
          reason: "definition-shadowed",
        });
        shadowedCount++;
        continue;
      }

      entries.push({
        cardName: card.name,
        cardVersion: card.version,
        serverName,
        status: "active",
      });
    }
  }

  return entries.length > 0 ? { entries, skippedCount, shadowedCount } : null;
}
