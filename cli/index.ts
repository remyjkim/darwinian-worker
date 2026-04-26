#!/usr/bin/env bun
// ABOUTME: CLI entrypoint that creates the Clipanion application and runs it.
// ABOUTME: All command registration starts here; reusable logic lives outside the command layer.

import { Builtins, Cli } from "clipanion";
import { DoctorCommand } from "./commands/doctor";
import { InitCommand } from "./commands/init";
import { createAgentsContext, validateRepoRoot } from "./context";
import { McpListCommand } from "./commands/mcp/list";
import { McpSyncCommand } from "./commands/mcp/sync";
import { SyncCommand } from "./commands/sync";
import { StatusCommand } from "./commands/status";
import { SkillsCurateCommand } from "./commands/skills/curate";
import { SkillsListCommand } from "./commands/skills/list";
import { SkillsPackagesAddCommand } from "./commands/skills/packages/add";
import { SkillsPackagesListCommand } from "./commands/skills/packages/list";
import { SkillsPackagesShowCommand } from "./commands/skills/packages/show";
import { SkillsSyncCommand } from "./commands/skills/sync";
import { SkillsUncurateCommand } from "./commands/skills/uncurate";

const cli = new Cli({
  binaryLabel: "bgng",
  binaryName: "bgng",
  binaryVersion: "0.1.0",
});

cli.register(SkillsListCommand);
cli.register(SkillsPackagesAddCommand);
cli.register(SkillsPackagesListCommand);
cli.register(SkillsPackagesShowCommand);
cli.register(SkillsCurateCommand);
cli.register(SkillsUncurateCommand);
cli.register(SkillsSyncCommand);
cli.register(McpListCommand);
cli.register(McpSyncCommand);
cli.register(SyncCommand);
cli.register(StatusCommand);
cli.register(DoctorCommand);
cli.register(InitCommand);
cli.register(Builtins.HelpCommand);
cli.register(Builtins.VersionCommand);

const context = createAgentsContext();

try {
  validateRepoRoot(context.repoRoot);
  await cli.runExit(process.argv.slice(2), context);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
