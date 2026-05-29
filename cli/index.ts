#!/usr/bin/env bun
// ABOUTME: CLI entrypoint that creates the Clipanion application and runs it.
// ABOUTME: All command registration starts here; reusable logic lives outside the command layer.

import { Builtins, Cli } from "clipanion";
import { AddMcpCommand } from "./commands/add/mcp";
import { AddSkillCommand } from "./commands/add/skill";
import { ApplyCommand, CardApplyCommand } from "./commands/card/apply";
import { CardAddCommand } from "./commands/card/add";
import { CardDeprecateCommand } from "./commands/card/deprecate";
import { CardDetachCommand } from "./commands/card/detach";
import { CardDiffCommand } from "./commands/card/diff";
import { CardListCommand } from "./commands/card/list";
import { CardNewCommand } from "./commands/card/new";
import { CardOutdatedCommand } from "./commands/card/outdated";
import { CardPinCommand } from "./commands/card/pin";
import { CardPublishCommand } from "./commands/card/publish";
import { CardRemoveCommand } from "./commands/card/remove";
import { CardShowCommand } from "./commands/card/show";
import { CardStatusCommand } from "./commands/card/status";
import { CardUpdateCommand, UpdateCommand } from "./commands/card/update";
import { DoctorCommand } from "./commands/doctor";
import { InitCommand } from "./commands/init";
import { createAgentsContext, validateRepoRoot } from "./context";
import { ExtensionsAddCommand } from "./commands/extensions/add";
import { ExtensionsDoctorCommand } from "./commands/extensions/doctor";
import { ExtensionsListCommand } from "./commands/extensions/list";
import { ExtensionsSetupCommand } from "./commands/extensions/setup";
import { ExtensionsShowCommand } from "./commands/extensions/show";
import { ExtensionsStatusCommand } from "./commands/extensions/status";
import { LibraryAddSkillCommand } from "./commands/library/add/skill";
import { LibraryAddMcpCommand } from "./commands/library/add/mcp";
import { LibraryDefaultsAddMcpCommand } from "./commands/library/defaults/add-mcp";
import { LibraryDefaultsAddSkillCommand } from "./commands/library/defaults/add-skill";
import { LibraryDefaultsListCommand } from "./commands/library/defaults/list";
import { LibraryDefaultsRemoveMcpCommand } from "./commands/library/defaults/remove-mcp";
import { LibraryDefaultsRemoveSkillCommand } from "./commands/library/defaults/remove-skill";
import { LibraryListCommand } from "./commands/library/list";
import { LibraryShowCommand } from "./commands/library/show";
import { McpListCommand } from "./commands/mcp/list";
import { McpWriteCommand } from "./commands/mcp/write";
import { SearchMcpCommand } from "./commands/search/mcp";
import { SearchSkillCommand } from "./commands/search/skill";
import { ScanCommand } from "./commands/scan";
import { StatusCommand } from "./commands/status";
import { StoreMigrateCommand } from "./commands/store/migrate";
import { StoreStatusCommand } from "./commands/store/status";
import { SkillsCurateCommand } from "./commands/skills/curate";
import { SkillsListCommand } from "./commands/skills/list";
import { SkillsPackagesAddCommand } from "./commands/skills/packages/add";
import { SkillsPackagesListCommand } from "./commands/skills/packages/list";
import { SkillsPackagesShowCommand } from "./commands/skills/packages/show";
import { SkillsUncurateCommand } from "./commands/skills/uncurate";
import { WriteCommand } from "./commands/write";
import { ExportSessionsCommand } from "./commands/export/sessions";
import { detectLegacyLayout } from "./core/migration";

const cli = new Cli({
  binaryLabel: "drwn",
  binaryName: "drwn",
  binaryVersion: "0.1.0",
});

cli.register(SkillsListCommand);
cli.register(SkillsPackagesAddCommand);
cli.register(SkillsPackagesListCommand);
cli.register(SkillsPackagesShowCommand);
cli.register(SkillsCurateCommand);
cli.register(SkillsUncurateCommand);
cli.register(AddSkillCommand);
cli.register(AddMcpCommand);
cli.register(CardNewCommand);
cli.register(CardPublishCommand);
cli.register(CardShowCommand);
cli.register(CardListCommand);
cli.register(CardDiffCommand);
cli.register(CardDeprecateCommand);
cli.register(CardApplyCommand);
cli.register(CardAddCommand);
cli.register(CardPinCommand);
cli.register(CardRemoveCommand);
cli.register(CardDetachCommand);
cli.register(CardUpdateCommand);
cli.register(CardOutdatedCommand);
cli.register(CardStatusCommand);
cli.register(ApplyCommand);
cli.register(UpdateCommand);
cli.register(LibraryAddSkillCommand);
cli.register(LibraryAddMcpCommand);
cli.register(LibraryDefaultsListCommand);
cli.register(LibraryDefaultsAddSkillCommand);
cli.register(LibraryDefaultsRemoveSkillCommand);
cli.register(LibraryDefaultsAddMcpCommand);
cli.register(LibraryDefaultsRemoveMcpCommand);
cli.register(LibraryListCommand);
cli.register(LibraryShowCommand);
cli.register(SearchSkillCommand);
cli.register(SearchMcpCommand);
cli.register(ExtensionsAddCommand);
cli.register(ExtensionsListCommand);
cli.register(ExtensionsShowCommand);
cli.register(ExtensionsStatusCommand);
cli.register(ExtensionsDoctorCommand);
cli.register(ExtensionsSetupCommand);
cli.register(McpWriteCommand);
cli.register(McpListCommand);
cli.register(WriteCommand);
cli.register(ScanCommand);
cli.register(ExportSessionsCommand);
cli.register(StoreMigrateCommand);
cli.register(StoreStatusCommand);
cli.register(StatusCommand);
cli.register(DoctorCommand);
cli.register(InitCommand);
cli.register(Builtins.HelpCommand);
cli.register(Builtins.VersionCommand);

const context = createAgentsContext();

try {
  validateRepoRoot(context.repoRoot);
  if (detectLegacyLayout(context.agentsDir)) {
    process.stderr.write("WARNING: pre-cards layout detected. Run `drwn store migrate` to upgrade.\n");
  }
  await cli.runExit(process.argv.slice(2), context);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
