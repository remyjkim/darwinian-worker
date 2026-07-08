// ABOUTME: Implements `drwn worker mind doctor`: diagnoses binding reachability, provisioning, drift, and pool health.
// ABOUTME: The pool has no server-side GC; unplaced and pool-orphaned entries are surfaced here for human action.

import { Option } from "clipanion";
import { DrwnError } from "../../../core/errors";
import { createMindDbClient, type MindDbClient } from "../../../core/mind-store/client";
import { resolveBgdbConfig } from "../../../core/mind-store/config";
import { computeDrift, readMindIndex } from "../../../core/mind-store/ledger";
import { loadProjectMindCards, resolveMindId } from "../../../core/mind-store/project";
import { renderJson } from "../../../core/output";
import { BaseCommand } from "../../base";
import { requireProjectRoot } from "../../card/project-command";

interface MindDoctorIssue {
  code: string;
  severity: "error" | "warning";
  message: string;
  path?: string;
}

async function walkPoolFiles(client: MindDbClient): Promise<string[]> {
  const files: string[] = [];
  for (const layer of await client.list("/pool")) {
    if (layer.kind !== "dir") {
      continue;
    }
    for (const day of await client.list(`/pool/${layer.name}`)) {
      if (day.kind !== "dir") {
        continue;
      }
      for (const file of await client.list(`/pool/${layer.name}/${day.name}`)) {
        if (file.kind === "file") {
          files.push(`/pool/${layer.name}/${day.name}/${file.name}`);
        }
      }
    }
  }
  return files;
}

export class WorkerMindDoctorCommand extends BaseCommand {
  static override paths = [["worker", "mind", "doctor"]];

  static override usage = BaseCommand.Usage({
    category: "Worker",
    description: "Diagnose a mind's binding, seed ledger, and memory-pool health.",
    details: `
      Checks that the BeginningDB binding is reachable (unreachable is a
      warning, not a failure), the mind is provisioned, seeded files still
      exist, and pool entries have memory views. Unplaced pool entries and
      live-edit drift are reported for human follow-up; nothing is repaired.
    `,
    examples: [["Run diagnostics", "drwn worker mind doctor --json"]],
  });

  mindId = Option.String("--mind-id", { description: "Mind id (defaults to the one in BGDB_PATH_PREFIX)." });

  json = Option.Boolean("--json", false, { description: "Emit machine-readable JSON output." });

  async execute() {
    const issues: MindDoctorIssue[] = [];
    try {
      const projectRoot = requireProjectRoot(this);
      const mindId = resolveMindId({ flag: this.mindId });
      const client = createMindDbClient(resolveBgdbConfig());

      let reachable = true;
      let index = null;
      try {
        index = await readMindIndex(client, mindId);
      } catch (error) {
        if (error instanceof DrwnError && error.code === "MIND_DB_UNREACHABLE") {
          reachable = false;
          issues.push({ code: "mind_db_unreachable", severity: "warning", message: error.message });
        } else {
          throw error;
        }
      }

      if (reachable && !index) {
        issues.push({ code: "mind_not_provisioned", severity: "warning", message: `Mind ${mindId} has no mind.json; run: drwn worker mind provision` });
      }

      if (reachable && index) {
        const cards = await loadProjectMindCards(projectRoot);
        for (const row of await computeDrift(client, index, cards)) {
          if (row.state === "db-edited") {
            issues.push({ code: "drift_db_edited", severity: "warning", message: `Live DB edits not in the card baseline: ${row.path}`, path: row.path });
          }
          if (row.state === "missing") {
            issues.push({ code: "seeded_file_missing", severity: "error", message: `Seeded file was deleted from the DB: ${row.path}`, path: row.path });
          }
        }
        for (const poolPath of await walkPoolFiles(client)) {
          const stat = await client.stat(poolPath);
          if (!stat) {
            continue;
          }
          const placements = await client.placements(stat.inodeId);
          if (placements.length === 1) {
            issues.push({ code: "unplaced_pool_entry", severity: "warning", message: `Pool entry has no memory views: ${poolPath}`, path: poolPath });
          }
        }
      }

      const ok = issues.every((issue) => issue.severity !== "error");
      if (this.json) {
        this.context.stdout.write(renderJson({ ok, issues }));
        return 0;
      }
      this.context.stdout.write(ok ? "Mind is healthy.\n" : "Mind has issues.\n");
      for (const issue of issues) {
        this.context.stdout.write(`  - [${issue.severity}] ${issue.code}: ${issue.message}\n`);
      }
      return 0;
    } catch (error) {
      this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
  }
}
