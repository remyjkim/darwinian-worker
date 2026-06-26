// ABOUTME: `drwn hook skill-marker --phase pre|post|fail|expansion` — anchors skill invocations.
// ABOUTME: Reads Claude's hook JSON from stdin, appends a skill signal, always exits 0 silently.

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { emitSkillMarker } from "../../core/hook-runner";
import type { HookPayload, SkillPhase } from "../../core/hook-signals";

const PHASES: SkillPhase[] = ["pre", "post", "fail", "expansion"];

// Internal subcommand: invoked by Claude as Skill Pre/Post/Failure + UserPromptExpansion
// hooks, not by users. Intentionally has no `static usage` so it stays hidden from `drwn --help`.
export class HookSkillMarkerCommand extends BaseCommand {
  static override paths = [["hook", "skill-marker"]];

  phase = Option.String("--phase", {
    description: "Which Skill hook phase: pre | post | fail | expansion.",
  });

  async execute(): Promise<number> {
    try {
      const phase = this.phase as SkillPhase | undefined;
      if (phase && PHASES.includes(phase)) {
        const payload = JSON.parse(await Bun.stdin.text()) as HookPayload;
        await emitSkillMarker(payload, phase);
      }
    } catch {
      // Hooks must never disrupt the agent: swallow everything.
    }
    return 0;
  }
}
