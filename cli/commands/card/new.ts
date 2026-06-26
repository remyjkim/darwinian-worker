// ABOUTME: Implements `drwn card new` for creating editable local card sources.
// ABOUTME: Persists authoring scope so repeated card creation stays concise.

import { Option } from "clipanion";
import { createInterface } from "node:readline/promises";
import { captureProjectAsCard } from "../../core/card-capture";
import { isCardUnscopedName } from "../../core/card-manifest";
import { createCardSource, readMachineConfig } from "../../core/card-store";
import { probeAuthoringScope, resolveScopeForCardNew } from "../../core/authoring-scope";
import { defaultProbeGh, defaultProbeGit } from "../../core/authoring-scope-probes";
import { BaseCommand } from "../base";

export class CardNewCommand extends BaseCommand {
  static override paths = [["card", "new"]];

  static override usage = BaseCommand.Usage({
    category: "Cards",
    description: "Create an editable Mind Card source under ~/.agents/drwn/sources.",
    details: `
      Creates a source directory with card.json, skills/, and mcp-servers/.
      Unscoped names require --scope or a saved authoring.scope in machine.json.
      By default the source directory is initialized as a git repository.
      Use --from-project to snapshot the current project's effective harness as
      a self-contained card source.
    `,
    examples: [
      ["Create a scoped card source", "drwn card new backend --scope @your-handle"],
      ["Create a fully-qualified card source", "drwn card new @your-handle/backend --no-git"],
      ["Capture the current project", "drwn card new @your-handle/project-harness --from-project ."],
    ],
  });

  name = Option.String({ required: true });
  projectPath = Option.String({ required: false });

  fromProject = Option.Boolean("--from-project", false, {
    description: "Capture a project's effective harness into the new card source.",
  });

  scope = Option.String("--scope", {
    description: "Scope to apply to an unscoped card name (e.g., @your-handle). Auto-derived from gh / git config on first use.",
  });

  noGit = Option.Boolean("--no-git", false, {
    description: "Do not initialize a git repository in the new source directory.",
  });

  async execute() {
    if (this.projectPath && !this.fromProject) {
      this.context.stderr.write("Project path is only valid with --from-project\n");
      return 1;
    }
    const machine = await readMachineConfig(this.context.agentsDir);

    let scopeForCreate: string | undefined = this.scope ?? machine.authoring?.scope;
    if (isCardUnscopedName(this.name) && !scopeForCreate) {
      const resolved = await resolveScopeForCardNew({
        explicit: this.scope,
        savedScope: machine.authoring?.scope,
        isInteractive: process.stdin.isTTY === true && process.stdout.isTTY === true,
        probe: () => probeAuthoringScope({ runGh: defaultProbeGh, runGit: defaultProbeGit }),
        prompt: async (suggested) => {
          const rl = createInterface({ input: process.stdin, output: process.stdout });
          try {
            const answer = (
              await rl.question(`Use ${suggested} as your default card scope? [Y/n] `)
            )
              .trim()
              .toLowerCase();
            return answer === "" || answer === "y" || answer === "yes";
          } finally {
            rl.close();
          }
        },
      });

      if (resolved.kind === "error") {
        this.context.stderr.write(`${resolved.message}\n`);
        return 1;
      }
      scopeForCreate = resolved.scope;
    }

    if (this.fromProject) {
      let captured;
      try {
        captured = await captureProjectAsCard({
          agentsDir: this.context.agentsDir,
          repoRoot: this.context.repoRoot,
          homeDir: this.context.homeDir,
          projectPath: this.projectPath ?? this.context.cwd,
          name: this.name,
          scope: scopeForCreate,
          noGit: this.noGit,
        });
      } catch (error) {
        this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        return 1;
      }
      this.context.stdout.write(`Captured card source ${captured.name}: ${captured.sourceDir}\n`);
      this.context.stdout.write(`Skills captured: ${captured.skillCount}\n`);
      this.context.stdout.write(`MCP servers captured: ${captured.serverCount}\n`);
      this.context.stdout.write(`Extensions captured: ${captured.extensionCount}\n`);
      this.context.stdout.write(`Targets captured: ${captured.targetCount}\n`);
      this.context.stdout.write(`Next: drwn card publish ${captured.name}\n`);
      return 0;
    }
    let source;
    try {
      source = await createCardSource({
        agentsDir: this.context.agentsDir,
        name: this.name,
        scope: scopeForCreate,
        noGit: this.noGit,
      });
    } catch (error) {
      this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
    this.context.stdout.write(`Created card source ${source.name}: ${source.sourceDir}\n`);
    return 0;
  }
}
