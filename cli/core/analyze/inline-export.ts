// ABOUTME: Builds a gzip session archive inline for `drwn analyze sessions`.
// ABOUTME: Reuses export discovery and archiving helpers without spawning the CLI.

import { join } from "node:path";
import type { AgentsContext } from "../../context";
import { archiveSessions as realArchiveSessions, makeTimestamp as realMakeTimestamp } from "../export/archiver";
import {
  deriveProjectSlug as realDeriveProjectSlug,
  discoverClaudeSessions as realDiscoverClaudeSessions,
  discoverCodexSessions as realDiscoverCodexSessions,
  gitWorktreeRoots as realGitWorktreeRoots,
  resolveProjectRoot as realResolveProjectRoot,
  type SessionFile,
} from "../export/session-discovery";

export interface InlineExportDeps {
  resolveProjectRoot?: (cwd: string) => Promise<string>;
  deriveProjectSlug?: (projectRoot: string) => string;
  gitWorktreeRoots?: (projectRoot: string) => Promise<string[]>;
  discoverClaudeSessions?: (claudeProjectsDir: string, projectSlug: string) => Promise<SessionFile[]>;
  discoverCodexSessions?: (codexSessionsDir: string, projectRoots: string[]) => Promise<SessionFile[]>;
  archiveSessions?: (files: SessionFile[], outputPath: string, options: { gzip: boolean }) => Promise<void>;
  makeTimestamp?: () => string;
}

export async function runInlineExport(context: AgentsContext, deps: InlineExportDeps = {}): Promise<string> {
  const resolveProjectRoot = deps.resolveProjectRoot ?? realResolveProjectRoot;
  const deriveProjectSlug = deps.deriveProjectSlug ?? realDeriveProjectSlug;
  const gitWorktreeRoots = deps.gitWorktreeRoots ?? realGitWorktreeRoots;
  const discoverClaudeSessions = deps.discoverClaudeSessions ?? realDiscoverClaudeSessions;
  const discoverCodexSessions = deps.discoverCodexSessions ?? realDiscoverCodexSessions;
  const archiveSessions = deps.archiveSessions ?? realArchiveSessions;
  const makeTimestamp = deps.makeTimestamp ?? realMakeTimestamp;

  const projectRoot = await resolveProjectRoot(context.cwd);
  const projectSlug = deriveProjectSlug(projectRoot);
  const projectRoots = await gitWorktreeRoots(projectRoot);
  const claudeProjectsDir = join(context.homeDir, ".claude", "projects");
  const codexSessionsDir = join(context.homeDir, ".codex", "sessions");
  const [claudeFiles, codexFiles] = await Promise.all([
    discoverClaudeSessions(claudeProjectsDir, projectSlug),
    discoverCodexSessions(codexSessionsDir, projectRoots),
  ]);
  const files = [...claudeFiles, ...codexFiles];
  if (files.length === 0) {
    throw new Error("No session files found for this project. Nothing to analyze.");
  }

  const outputPath = join(
    context.cwd,
    ".agents",
    "drwn",
    "session-log-exports",
    `${makeTimestamp()}.tar.gz`,
  );
  await archiveSessions(files, outputPath, { gzip: true });
  return outputPath;
}
