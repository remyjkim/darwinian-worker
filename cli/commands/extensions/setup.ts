// ABOUTME: Implements drwn extensions setup for explicit extension setup flows.
// ABOUTME: Starts with Beads project setup while preserving dry-run and non-destructive defaults.

import { Option, UsageError } from "clipanion";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { ensureBeadsProjectExtensionConfig, executeBeadsSetupPlan, normalizeBeadsTargets, planBeadsSetup } from "../../core/extensions/beads";
import { findCommand, runExternalCommand } from "../../core/extensions/commands";
import { ensureMarkitdownProjectExtensionConfig, planMarkitdownSetup } from "../../core/extensions/markitdown";
import { ensureParallelProjectExtensionConfig, planParallelSetup } from "../../core/extensions/parallel";
import { resolveInstallDecisionMode } from "../../core/interactivity";
import { renderJson } from "../../core/output";
import { BaseCommand } from "../base";

export class ExtensionsSetupCommand extends BaseCommand {
  static override paths = [["extensions", "setup"]];

  static override usage = BaseCommand.Usage({
    category: "Extensions",
    description: "Set up one extension. Behavior varies by extension: Beads can run bd commands, MarkItDown can install its CLI, Parallel writes project config.",
    details: `
      Sets up one extension in the current project. Beads can run bd init and
      bd setup, controlled by Beads only flags such as --target, --stealth,
      --skip-bd-init, --skip-bd-setup, and --include-skill.

      MarkItDown can install the markitdown CLI via uv. Use --install to
      approve install without prompting, or --no-install to skip installation.
      Parallel setup writes project config only.
    `,
    examples: [
      ["Preview Beads setup", "drwn extensions setup beads --dry-run"],
      ["Set up Beads with the project skill", "drwn extensions setup beads --include-skill"],
      ["Install MarkItDown without prompting", "drwn extensions setup markitdown --install"],
    ],
  });

  extensionName = Option.String({ required: true });

  dryRun = Option.Boolean("--dry-run", false, {
    description: "Preview setup without writing.",
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  target = Option.String("--target", {
    description: "Comma-separated Beads setup targets. Beads only.",
  });

  stealth = Option.Boolean("--stealth", false, {
    description: "Use Beads stealth setup mode where supported. Beads only.",
  });

  skipBdInit = Option.Boolean("--skip-bd-init", false, {
    description: "Skip bd init even when .beads is absent. Beads only.",
  });

  skipBdSetup = Option.Boolean("--skip-bd-setup", false, {
    description: "Skip bd setup target recipes. Beads only.",
  });

  includeSkill = Option.Boolean("--include-skill", false, {
    description: "Include the Beads project skill in project config. Beads only.",
  });

  mcp = Option.Boolean("--mcp", false, {
    description: "Enable extension MCP mode when supported.",
  });

  skipSkills = Option.Boolean("--skip-skills", false, {
    description: "Do not enable extension skills when supported.",
  });

  install = Option.Boolean("--install", {
    description: "Install the extension CLI prerequisite when supported. Use --no-install to skip installation. MarkItDown only.",
  });

  async execute() {
    if (this.extensionName === "parallel") {
      return this.executeParallelSetup();
    }
    if (this.extensionName === "markitdown") {
      return this.executeMarkitdownSetup();
    }
    if (this.extensionName !== "beads") {
      throw new UsageError(`Setup is not implemented for extension: ${this.extensionName}`);
    }

    return this.executeBeadsSetup();
  }

  private async executeBeadsSetup() {
    const bd = await findCommand("bd", process.env);
    if (!bd.available) {
      throw new UsageError(
        "bd command is not available. Install with: brew install beads OR npm install -g @beads/bd OR curl -fsSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash",
      );
    }

    let targets;
    try {
      targets = normalizeBeadsTargets(this.target);
    } catch (error) {
      throw new UsageError(error instanceof Error ? error.message : "Invalid Beads setup target.");
    }

    const plan = await planBeadsSetup({
      projectDir: this.context.cwd,
      targets,
      stealth: this.stealth,
      skipBdInit: this.skipBdInit,
        skipBdSetup: this.skipBdSetup,
      });
    const projectConfigPath = join(this.context.cwd, ".agents", "bgng", "config.json");
    const skillChange = this.includeSkill && !existsSync(projectConfigPath)
      ? `create ${projectConfigPath} and configure beads extension with beads-task-tracking`
      : this.includeSkill
        ? `configure beads extension with beads-task-tracking in ${projectConfigPath}`
        : `configure beads extension in ${projectConfigPath}`;
    const projectConfigChange = {
      extensionName: "beads",
      config: { enabled: true, targets, includeSkill: this.includeSkill },
      path: projectConfigPath,
    };

    if (this.dryRun) {
      const payload = { plan, projectConfigChange };
      if (this.json) {
        this.context.stdout.write(renderJson(payload));
      } else {
        const lines = [
          "Planned Beads setup:",
          ...plan.commands.map((command) => `- ${command.cmd.join(" ")} (${command.reason})`),
          ...(skillChange ? [`- ${skillChange}`] : []),
        ];
        this.context.stdout.write(`${lines.join("\n")}\n`);
      }
      return 0;
    }

    const results = await executeBeadsSetupPlan(plan, process.env);
    const failed = results.find((result) => result.exitCode !== 0);
    if (failed) {
      const payload = { plan, results };
      if (this.json) {
        this.context.stdout.write(renderJson(payload));
      }
      throw new UsageError(`Beads setup command failed: ${failed.cmd.join(" ")}`);
    }
    const configPath = ensureBeadsProjectExtensionConfig(this.context.cwd, {
      targets,
      includeSkill: this.includeSkill,
    });
    const payload = { plan, results, projectConfigPath: configPath };

    if (this.json) {
      this.context.stdout.write(renderJson(payload));
    } else {
      const lines = [
        "Beads setup complete.",
        ...results.map((result) => `- ${result.cmd.join(" ")}: exit ${result.exitCode}`),
        ...(configPath ? [`- Updated ${configPath}`] : []),
      ];
      this.context.stdout.write(`${lines.join("\n")}\n`);
    }
    return 0;
  }

  private async executeParallelSetup() {
    const plan = planParallelSetup({
      projectDir: this.context.cwd,
      skills: !this.skipSkills,
      mcp: this.mcp,
    });

    if (this.dryRun) {
      if (this.json) {
        this.context.stdout.write(renderJson(plan));
      } else {
        this.context.stdout.write(
          [
            "Planned Parallel setup:",
            `- configure parallel extension in ${plan.projectConfigChange.path}`,
            `- skills: ${plan.projectConfigChange.config.skills ? "enabled" : "disabled"}`,
            `- mcp: ${plan.projectConfigChange.config.mcp ? "enabled" : "disabled"}`,
          ].join("\n") + "\n",
        );
      }
      return 0;
    }

    const configPath = ensureParallelProjectExtensionConfig({
      projectDir: this.context.cwd,
      skills: !this.skipSkills,
      mcp: this.mcp,
    });

    if (this.json) {
      this.context.stdout.write(renderJson({ ...plan, projectConfigPath: configPath }));
    } else {
      this.context.stdout.write(`Parallel extension configured in ${configPath}\n`);
    }
    return 0;
  }

  private async executeMarkitdownSetup() {
    const markitdown = await findCommand("markitdown", process.env);
    const uv = await findCommand("uv", process.env);
    let installApproved = false;

    if (!markitdown.available) {
      const mode = resolveInstallDecisionMode({
        install: this.install === true,
        noInstall: this.install === false,
        stdinIsTTY: process.stdin.isTTY === true,
        stdoutIsTTY: process.stdout.isTTY === true,
      });
      if (mode.mode === "error") {
        throw new UsageError(mode.message ?? "Invalid install decision.");
      }
      installApproved = mode.mode === "install";
      if (mode.mode === "prompt") {
        installApproved = await this.promptMarkitdownInstall();
      }
    }

    if (installApproved && !uv.available && !markitdown.available) {
      throw new UsageError(
        "uv command is required to install MarkItDown. Install uv with: brew install uv OR curl -LsSf https://astral.sh/uv/install.sh | sh",
      );
    }

    const plan = planMarkitdownSetup({
      projectDir: this.context.cwd,
      markitdownAvailable: markitdown.available,
      uvAvailable: uv.available,
      installApproved,
      skills: !this.skipSkills,
    });

    if (this.dryRun) {
      if (this.json) {
        this.context.stdout.write(renderJson(plan));
      } else {
        const lines = [
          "Planned MarkItDown setup:",
          ...plan.commands.map((command) => `- ${command.cmd.join(" ")} (${command.reason})`),
          `- configure markitdown extension in ${plan.projectConfigChange.path}`,
          `- skills: ${plan.projectConfigChange.config.skills ? "enabled" : "disabled"}`,
          ...plan.warnings.map((warning) => `- warning: ${warning}`),
        ];
        this.context.stdout.write(`${lines.join("\n")}\n`);
      }
      return 0;
    }

    const results: Array<{ cmd: string[]; exitCode: number; stdout: string; stderr: string }> = [];
    for (const command of plan.commands) {
      const result = await runExternalCommand({ cmd: command.cmd, cwd: this.context.cwd, env: process.env });
      results.push({ cmd: command.cmd, ...result });
      if (result.exitCode !== 0) {
        const payload = { plan, results };
        if (this.json) {
          this.context.stdout.write(renderJson(payload));
        }
        throw new UsageError(`MarkItDown setup command failed: ${command.cmd.join(" ")}`);
      }
    }

    const configPath = ensureMarkitdownProjectExtensionConfig({
      projectDir: this.context.cwd,
      skills: !this.skipSkills,
    });
    const refreshed = await findCommand("markitdown", process.env);
    const payload = {
      plan,
      results,
      projectConfigPath: configPath,
      runtimeAvailable: refreshed.available,
      runtimePath: refreshed.path,
    };

    if (this.json) {
      this.context.stdout.write(renderJson(payload));
    } else {
      const lines = [
        "MarkItDown setup complete.",
        ...results.map((result) => `- ${result.cmd.join(" ")}: exit ${result.exitCode}`),
        `- Updated ${configPath}`,
        refreshed.available
          ? `- markitdown: ${refreshed.path}`
          : "- Warning: MarkItDown runtime is not available on PATH. Run uv tool update-shell and restart your shell.",
      ];
      this.context.stdout.write(`${lines.join("\n")}\n`);
    }
    return 0;
  }

  private async promptMarkitdownInstall() {
    const rl = createInterface({ input, output });
    try {
      const answer = (await rl.question("Install MarkItDown with uv now? [y/N] ")).trim().toLowerCase();
      return answer === "y" || answer === "yes";
    } finally {
      rl.close();
    }
  }
}
