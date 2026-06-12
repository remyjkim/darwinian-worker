#!/usr/bin/env bun
// ABOUTME: CLI entrypoint that creates the Clipanion application and runs it.
// ABOUTME: All command registration starts here; reusable logic lives outside the command layer.

import { Builtins, Cli } from "clipanion";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AddMcpCommand } from "./commands/add/mcp";
import { AddSkillCommand } from "./commands/add/skill";
import { AnalyzeSessionsCommand } from "./commands/analyze/sessions";
import { LoginCommand } from "./commands/auth/login";
import { LogoutCommand } from "./commands/auth/logout";
import { WhoamiCommand } from "./commands/auth/whoami";
import { ApplyCommand, CardApplyCommand } from "./commands/card/apply";
import { AddCardCommand, CardAddCommand } from "./commands/card/add";
import { CardCatalogPublishCommand } from "./commands/card/catalog-publish";
import { CardDeprecateCommand } from "./commands/card/deprecate";
import { CardDetachCommand } from "./commands/card/detach";
import { CardDiffCommand } from "./commands/card/diff";
import { CardFetchCommand } from "./commands/card/fetch";
import { CardListCommand } from "./commands/card/list";
import { CardCloneCommand } from "./commands/card/clone";
import { CardNewCommand } from "./commands/card/new";
import { CardOutdatedCommand } from "./commands/card/outdated";
import { CardPinCommand } from "./commands/card/pin";
import { CardPushCommand } from "./commands/card/push";
import { CardPublishCommand } from "./commands/card/publish";
import {
  CardRemoteAddCommand,
  CardRemoteListCommand,
  CardRemoteRemoveCommand,
  CardRemoteSetCommand,
} from "./commands/card/remote";
import { CardRemoveCommand } from "./commands/card/remove";
import { CardShowCommand } from "./commands/card/show";
import { CardSourceAddMcpCommand } from "./commands/card/source/add-mcp";
import { CardSourceAddSkillCommand } from "./commands/card/source/add-skill";
import { CardSourceDoctorCommand } from "./commands/card/source/doctor";
import { CardSourceListCommand } from "./commands/card/source/list";
import { CardSourceRemoveMcpCommand } from "./commands/card/source/remove-mcp";
import { CardSourceRemoveSkillCommand } from "./commands/card/source/remove-skill";
import { CardSourceSetCommand } from "./commands/card/source/set";
import { CardSourceShowCommand } from "./commands/card/source/show";
import { CardStatusCommand } from "./commands/card/status";
import { CardUpdateCommand, UpdateCommand } from "./commands/card/update";
import { CardValidateCommand } from "./commands/card/validate";
import { CatalogValidateCommand } from "./commands/catalog/validate";
import { DoctorCommand } from "./commands/doctor";
import { InitCommand } from "./commands/init";
import { InstallCommand } from "./commands/install";
import { createAgentsContext, validateRepoRoot } from "./context";
import { ExtensionsAddCommand } from "./commands/extensions/add";
import { ExtensionsDoctorCommand } from "./commands/extensions/doctor";
import { ExtensionsListCommand } from "./commands/extensions/list";
import { ExtensionsSetupCommand } from "./commands/extensions/setup";
import { ExtensionsShowCommand } from "./commands/extensions/show";
import { ExtensionsStatusCommand } from "./commands/extensions/status";
import { LibraryAddSkillCommand } from "./commands/library/add/skill";
import { LibraryAddMcpCommand } from "./commands/library/add/mcp";
import {
  LibraryCatalogAddCommand,
  LibraryCatalogListCommand,
  LibraryCatalogRefreshCommand,
  LibraryCatalogRemoveCommand,
} from "./commands/library/catalog";
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
import { SearchCardCommand } from "./commands/search/card";
import { SearchSkillCommand } from "./commands/search/skill";
import { ScanCommand } from "./commands/scan";
import { StatusCommand } from "./commands/status";
import { StoreMigrateCommand } from "./commands/store/migrate";
import { StoreMigrateToGitCommand } from "./commands/store/migrate-to-git";
import { StoreGcCommand } from "./commands/store/gc";
import { StoreVerifyCommand } from "./commands/store/verify";
import { StoreExportCommand } from "./commands/store/export";
import { StoreSeedCommand } from "./commands/store/seed";
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

const packageJson = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../package.json"), "utf8"),
) as { version?: string };

const cli = new Cli({
  binaryLabel: "drwn",
  binaryName: "drwn",
  binaryVersion: packageJson.version ?? "0.0.0",
});

cli.register(SkillsListCommand);
cli.register(SkillsPackagesAddCommand);
cli.register(SkillsPackagesListCommand);
cli.register(SkillsPackagesShowCommand);
cli.register(SkillsCurateCommand);
cli.register(SkillsUncurateCommand);
cli.register(AddSkillCommand);
cli.register(AddMcpCommand);
cli.register(AddCardCommand);
cli.register(InstallCommand);
cli.register(CardNewCommand);
cli.register(CardPublishCommand);
cli.register(CardCatalogPublishCommand);
cli.register(CardShowCommand);
cli.register(CardSourceListCommand);
cli.register(CardSourceShowCommand);
cli.register(CardSourceDoctorCommand);
cli.register(CardSourceAddSkillCommand);
cli.register(CardSourceRemoveSkillCommand);
cli.register(CardSourceSetCommand);
cli.register(CardSourceAddMcpCommand);
cli.register(CardSourceRemoveMcpCommand);
cli.register(CardListCommand);
cli.register(CardDiffCommand);
cli.register(CardDeprecateCommand);
cli.register(CardRemoteAddCommand);
cli.register(CardRemoteListCommand);
cli.register(CardRemoteSetCommand);
cli.register(CardRemoteRemoveCommand);
cli.register(CardPushCommand);
cli.register(CardFetchCommand);
cli.register(CardCloneCommand);
cli.register(CardApplyCommand);
cli.register(CardAddCommand);
cli.register(CardPinCommand);
cli.register(CardRemoveCommand);
cli.register(CardDetachCommand);
cli.register(CardUpdateCommand);
cli.register(CardOutdatedCommand);
cli.register(CardStatusCommand);
cli.register(CardValidateCommand);
cli.register(CatalogValidateCommand);
cli.register(ApplyCommand);
cli.register(UpdateCommand);
cli.register(LibraryAddSkillCommand);
cli.register(LibraryAddMcpCommand);
cli.register(LibraryCatalogListCommand);
cli.register(LibraryCatalogAddCommand);
cli.register(LibraryCatalogRemoveCommand);
cli.register(LibraryCatalogRefreshCommand);
cli.register(LibraryDefaultsListCommand);
cli.register(LibraryDefaultsAddSkillCommand);
cli.register(LibraryDefaultsRemoveSkillCommand);
cli.register(LibraryDefaultsAddMcpCommand);
cli.register(LibraryDefaultsRemoveMcpCommand);
cli.register(LibraryListCommand);
cli.register(LibraryShowCommand);
cli.register(SearchSkillCommand);
cli.register(SearchMcpCommand);
cli.register(SearchCardCommand);
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
cli.register(AnalyzeSessionsCommand);
cli.register(ExportSessionsCommand);
cli.register(StoreMigrateCommand);
cli.register(StoreMigrateToGitCommand);
cli.register(StoreGcCommand);
cli.register(StoreVerifyCommand);
cli.register(StoreExportCommand);
cli.register(StoreSeedCommand);
cli.register(StoreStatusCommand);
cli.register(StatusCommand);
cli.register(DoctorCommand);
cli.register(InitCommand);
cli.register(LoginCommand);
cli.register(LogoutCommand);
cli.register(WhoamiCommand);
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
