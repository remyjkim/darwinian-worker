// ABOUTME: Implements the bgng init command for creating per-project config scaffolding.
// ABOUTME: Keeps project bootstrap simple and explicit without mutating gitignore or other repo state.

import { Option } from "clipanion";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { ensureBeadsProjectExtensionConfig, normalizeBeadsTargets } from "../core/extensions/beads";
import { ensureParallelProjectExtensionConfig } from "../core/extensions/parallel";
import { resolveInitMode } from "../core/interactivity";
import { scaffoldProjectConfig } from "../core/project";
import { BaseCommand } from "./base";

export class InitCommand extends BaseCommand {
  static override paths = [["init"]];

  static override usage = BaseCommand.Usage({
    category: "General",
    description: "Create per-project configuration. In a TTY this runs guided setup; prompt-free modes write a bare config and warn if .gitignore excludes .agents.",
    details: `
      Writes <project>/.agents/bgng/config.json.

      In a TTY, runs guided setup that can configure Parallel and Beads project
      options. Outside a TTY, use --non-interactive or --minimal to write the
      minimal { "version": 1 } config. Warns if .gitignore appears to exclude
      .agents.

      Use --force to overwrite an existing config. Use --guided to force the
      interactive flow when stdin and stdout are TTYs.
    `,
    examples: [
      ["First-time setup in an interactive shell", "bgng init"],
      ["Minimal config without prompts", "bgng init --non-interactive"],
      ["Re-run setup over an existing config", "bgng init --force --guided"],
    ],
  });

  force = Option.Boolean("--force", false, {
    description: "Overwrite an existing project config.",
  });

  guided = Option.Boolean("--guided", false, {
    description: "Force guided interactive project setup (the default in a TTY).",
  });

  nonInteractive = Option.Boolean("--non-interactive", false, {
    description: "Create minimal project config without prompts.",
  });

  minimal = Option.Boolean("--minimal", false, {
    description: "Alias for prompt-free minimal project config creation.",
  });

  async execute() {
    const projectDir = process.cwd();
    const mode = resolveInitMode({
      guided: this.guided,
      minimal: this.minimal,
      nonInteractive: this.nonInteractive,
      stdinIsTTY: process.stdin.isTTY === true,
      stdoutIsTTY: process.stdout.isTTY === true,
    });
    if (mode.mode === "error") {
      throw new Error(mode.message ?? "Invalid init mode.");
    }

    const configPath = mode.mode === "guided"
      ? await this.executeGuided(projectDir)
      : await scaffoldProjectConfig(projectDir, { force: this.force });
    const gitignorePath = join(projectDir, ".gitignore");
    const messages: string[] = [`Created project config: ${configPath}`];

    if (existsSync(gitignorePath)) {
      const gitignore = readFileSync(gitignorePath, "utf8");
      if (gitignore.includes(".agents")) {
        messages.push("Warning: .gitignore appears to exclude .agents; this config may not be shared with collaborators.");
      }
    }

    this.context.stdout.write(`${messages.join("\n")}\n`);
    return 0;
  }

  private async executeGuided(projectDir: string) {
    const configPath = await scaffoldProjectConfig(projectDir, { force: this.force });
    const rl = createInterface({ input, output });
    try {
      const parallelAnswer = (await rl.question("Enable Parallel extension for this project? [y/N] ")).trim().toLowerCase();
      if (parallelAnswer === "y" || parallelAnswer === "yes") {
        const mcpAnswer = (await rl.question("Enable Parallel MCP too? [y/N] ")).trim().toLowerCase();
        ensureParallelProjectExtensionConfig({
          projectDir,
          skills: true,
          mcp: mcpAnswer === "y" || mcpAnswer === "yes",
        });
      }

      const beadsAnswer = (await rl.question("Enable Beads extension for this project? [y/N] ")).trim().toLowerCase();
      if (beadsAnswer === "y" || beadsAnswer === "yes") {
        const targetAnswer = (await rl.question("Beads targets? [codex,claude,cursor] ")).trim();
        const includeSkillAnswer = (await rl.question("Include beads-task-tracking skill? [y/N] ")).trim().toLowerCase();
        ensureBeadsProjectExtensionConfig(projectDir, {
          targets: normalizeBeadsTargets(targetAnswer || undefined),
          includeSkill: includeSkillAnswer === "y" || includeSkillAnswer === "yes",
        });
      }
    } finally {
      rl.close();
    }
    return configPath;
  }
}
