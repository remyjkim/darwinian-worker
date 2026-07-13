// ABOUTME: Formats human-readable and JSON command output for the drwn harness CLI.
// ABOUTME: Keeps presentation logic separate from filesystem and sync domain logic.

import type { OptionalMcpReport } from "./mcp-report";
import { formatAmbientCollision, type AmbientCollision } from "./ambient-policy";

export function renderJson(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function renderTable(headers: string[], rows: string[][]) {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0)),
  );
  const formatRow = (row: string[]) => row.map((cell, index) => cell.padEnd(widths[index] ?? 0)).join("  ");

  return `${formatRow(headers)}\n${rows.map((row) => formatRow(row)).join("\n")}\n`;
}

export function renderSyncResult(result: {
  changes: string[];
  warnings: string[];
  cardModes?: Record<string, { mode: string; reason: string; lane: string; sourcePath?: string }>;
}) {
  if (result.changes.length === 0 && result.warnings.length === 0 && !result.cardModes) {
    return "No changes.\n";
  }

  const parts: string[] = [];
  if (result.changes.length > 0) {
    parts.push(`Changes:\n${result.changes.map((change) => `- ${change}`).join("\n")}`);
  }
  if (result.cardModes && Object.keys(result.cardModes).length > 0) {
    parts.push(
      `Modes:\n${Object.entries(result.cardModes)
        .map(([name, mode]) => {
          const source = mode.sourcePath ? ` source=${mode.sourcePath}` : "";
          return `- ${name}: ${mode.mode} (${mode.reason}) lane=${mode.lane}${source}`;
        })
        .join("\n")}`,
    );
  }
  if (result.warnings.length > 0) {
    parts.push(`Warnings:\n${result.warnings.map((warning) => `- ${warning}`).join("\n")}`);
  }

  if (parts.length === 0) {
    return "No changes.\n";
  }
  return `${parts.join("\n")}\n`;
}

export function renderOptionalMcpReport(report: OptionalMcpReport | null | undefined) {
  if (!report || report.entries.length === 0) {
    return "";
  }

  const byCard = new Map<string, typeof report.entries>();
  for (const entry of report.entries) {
    const key = `${entry.cardName}@${entry.cardVersion}`;
    const existing = byCard.get(key) ?? [];
    existing.push(entry);
    byCard.set(key, existing);
  }

  const lines = ["Optional MCP servers from cards:"];
  for (const [card, entries] of byCard) {
    lines.push(`  ${card}`);
    for (const entry of entries) {
      if (entry.status === "active") {
        lines.push(`    + ${entry.serverName} (active)`);
      } else if (entry.status === "shadowed") {
        lines.push(`    ! ${entry.serverName} (shadowed - active definition differs from this card)`);
      } else {
        const suffix = entry.optInCommand ? `skipped - enable with \`${entry.optInCommand}\`` : "skipped";
        lines.push(`    - ${entry.serverName} (${suffix})`);
      }
    }
  }

  return `${lines.join("\n")}\n`;
}

export function renderDoctorReport(report: {
  brokenSymlinks: string[];
  staleSkillSymlinks: string[];
  mcpDrift: string[];
  machineProjectionConflicts?: string[];
  machineCapabilityIssues?: string[];
  missingGeneratedFiles: string[];
  hookIssues?: string[];
  projectConfigIssues?: string[];
  surfaceNotes?: string[];
  platformChecks?: Array<{ name: string; ok: boolean; detail?: string }>;
  ambientMcpCollisions?: AmbientCollision[];
}) {
  const sections: string[] = [];

  const categories = [
    { label: "Broken symlinks", items: report.brokenSymlinks },
    { label: "Stale skill symlinks", items: report.staleSkillSymlinks },
    { label: "MCP drift", items: report.mcpDrift },
    { label: "Machine projection conflicts", items: report.machineProjectionConflicts ?? [] },
    { label: "Machine capability issues", items: report.machineCapabilityIssues ?? [] },
    { label: "Missing generated files", items: report.missingGeneratedFiles },
    { label: "Hook issues", items: report.hookIssues ?? [] },
    { label: "Project config issues", items: report.projectConfigIssues ?? [] },
    {
      label: "Ambient MCP collisions",
      items: (report.ambientMcpCollisions ?? []).map(formatAmbientCollision),
    },
  ];

  for (const { label, items } of categories) {
    if (items.length > 0) {
      sections.push(`${label}:\n${items.map((item) => `  - ${item}`).join("\n")}`);
    }
  }

  let output = sections.length > 0 ? `${sections.join("\n\n")}\n` : "No issues found.\n";

  const platformChecks = report.platformChecks ?? [];
  if (platformChecks.length > 0) {
    const lines = platformChecks.map(
      (check) => `  - ${check.ok ? "ok" : "FAILED"}: ${check.name}${check.detail ? ` (${check.detail})` : ""}`,
    );
    output += `\nPlatform checks:\n${lines.join("\n")}\n`;
  }

  const surfaceNotes = report.surfaceNotes ?? [];
  if (surfaceNotes.length > 0) {
    output += `\nSurfaces:\n${surfaceNotes.map((note) => `  - ${note}`).join("\n")}\n`;
  }

  return output;
}
