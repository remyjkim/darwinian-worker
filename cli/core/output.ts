// ABOUTME: Formats human-readable and JSON command output for the drwn harness CLI.
// ABOUTME: Keeps presentation logic separate from filesystem and sync domain logic.

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

export function renderSyncResult(result: { changes: string[]; warnings: string[] }) {
  if (result.changes.length === 0 && result.warnings.length === 0) {
    return "No changes.\n";
  }

  const parts: string[] = [];
  if (result.changes.length > 0) {
    parts.push(`Changes:\n${result.changes.map((change) => `- ${change}`).join("\n")}`);
  }
  if (result.warnings.length > 0) {
    parts.push(`Warnings:\n${result.warnings.map((warning) => `- ${warning}`).join("\n")}`);
  }

  return `${parts.join("\n")}\n`;
}

export function renderDoctorReport(report: {
  brokenSymlinks: string[];
  staleSkillSymlinks: string[];
  mcpDrift: string[];
  missingGeneratedFiles: string[];
  projectConfigIssues?: string[];
}) {
  const sections: string[] = [];

  const categories = [
    { label: "Broken symlinks", items: report.brokenSymlinks },
    { label: "Stale skill symlinks", items: report.staleSkillSymlinks },
    { label: "MCP drift", items: report.mcpDrift },
    { label: "Missing generated files", items: report.missingGeneratedFiles },
    { label: "Project config issues", items: report.projectConfigIssues ?? [] },
  ];

  for (const { label, items } of categories) {
    if (items.length > 0) {
      sections.push(`${label}:\n${items.map((item) => `  - ${item}`).join("\n")}`);
    }
  }

  return sections.length > 0 ? `${sections.join("\n\n")}\n` : "No issues found.\n";
}
