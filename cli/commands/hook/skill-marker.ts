// ABOUTME: `drwn hook skill-marker --phase pre|post|fail|expansion` — anchors skill invocations.
// ABOUTME: Reads Claude's hook JSON from stdin, appends a skill signal, always exits 0 silently.

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { emitSkillMarker } from "../../core/hook-runner";
import type { HookPayload, SkillPhase } from "../../core/hook-signals";

const PHASES: SkillPhase[] = ["pre", "post", "fail", "expansion"];

export class HookSkillMarkerCommand extends BaseCommand {
  static override paths = [["hook", "skill-marker"]];

  static override usage = BaseCommand.Usage({
    category: "Hooks",
    description: "Claude Skill hook: anchor a skill invocation (pre/post/fail/expansion).",
    details: `
      Reads the Claude hook payload from stdin and appends a skill signal
      (skill_invocation, skill_result, skill_failure, or raw slash_expansion) to a
      transcript-co-located <session>.drwn-signals.jsonl. Always exits 0, prints nothing.
    `,
    examples: [
      ["Anchor a Skill PreToolUse call", "drwn hook skill-marker --phase pre"],
      ["Anchor a direct /slash expansion", "drwn hook skill-marker --phase expansion"],
    ],
  });

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
