// ABOUTME: Implements `bgng export sessions` — discovers and archives Claude/Codex session logs.
// ABOUTME: Writes a .tar archive under .agents/bgng/session-log-exports/ for the current project and its worktrees.

import { Option } from "clipanion";
import { join } from "node:path";
import { BaseCommand } from "../base";
import { resolveProjectRoot, deriveProjectSlug, discoverClaudeSessions, discoverCodexSessions, gitWorktreeRoots } from "../../core/export/session-discovery";
import { archiveSessions, makeTimestamp } from "../../core/export/archiver";

export class ExportSessionsCommand extends BaseCommand {
  static override paths = [["export", "sessions"]];

  static override usage = BaseCommand.Usage({
    category: "Export",
    description: "Discover and archive Claude/Codex session logs for the current project.",
    details: `
      Scans ~/.claude/projects and ~/.codex/sessions for session files belonging to
      this project (and any git worktrees). Writes a .tar archive under
      .agents/bgng/session-log-exports/ by default, or to the path specified by --out.

      Use --dry-run to preview which files would be archived without writing anything.
    `,
    examples: [
      ["Preview session files", "bgng export sessions --dry-run"],
      ["Archive to default path", "bgng export sessions"],
      ["Archive to a specific file", "bgng export sessions --out /tmp/my-sessions.tar"],
    ],
  });

  dryRun = Option.Boolean("--dry-run", false, {
    description: "List files that would be archived, then exit without writing.",
  });

  out = Option.String("--out", {
    description: "Override the destination .tar path.",
  });

  async execute() {
    try {
      const projectRoot = await resolveProjectRoot(this.context.cwd);
      const projectSlug = deriveProjectSlug(projectRoot);
      const projectRoots = await gitWorktreeRoots(projectRoot);

      const claudeProjectsDir = join(this.context.homeDir, ".claude", "projects");
      const codexSessionsDir = join(this.context.homeDir, ".codex", "sessions");

      const [claudeFiles, codexFiles] = await Promise.all([
        discoverClaudeSessions(claudeProjectsDir, projectSlug),
        discoverCodexSessions(codexSessionsDir, projectRoots),
      ]);

      const files = [...claudeFiles, ...codexFiles];

      if (files.length === 0) {
        this.context.stdout.write("No session files found for this project.\n");
        return 0;
      }

      if (this.dryRun) {
        this.context.stdout.write(`Found ${files.length} session file(s) — dry run, no archive written.\n`);
        for (const file of files) {
          this.context.stdout.write(`  ${file.archivePath}\n`);
        }
        return 0;
      }

      const outputPath = this.out
        ? this.out
        : join(this.context.cwd, ".agents", "bgng", "session-log-exports", `${makeTimestamp()}.tar`);

      await archiveSessions(files, outputPath);

      this.context.stdout.write(`Archived ${files.length} file(s) to: ${outputPath}\n`);
      return 0;
    } catch (error) {
      this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
  }

}
