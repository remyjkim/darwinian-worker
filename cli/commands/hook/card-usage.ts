// ABOUTME: `drwn hook card-usage` — UserPromptSubmit hook that records active Harness Cards.
// ABOUTME: Reads Claude's hook JSON from stdin, appends a write-on-change card_usage signal, always exits 0 silently.

import { BaseCommand } from "../base";
import { emitCardUsage } from "../../core/hook-runner";
import type { HookPayload } from "../../core/hook-signals";

export class HookCardUsageCommand extends BaseCommand {
  static override paths = [["hook", "card-usage"]];

  static override usage = BaseCommand.Usage({
    category: "Hooks",
    description: "Claude UserPromptSubmit hook: record active Harness Cards (write-on-change).",
    details: `
      Reads the Claude hook payload from stdin and appends a card_usage signal to
      a transcript-co-located <session>.drwn-signals.jsonl. Requires a project
      card.lock; otherwise it does nothing. Always exits 0 and prints nothing.
    `,
    examples: [["Wire as a Claude UserPromptSubmit hook (stdin is the hook JSON)", "drwn hook card-usage"]],
  });

  async execute(): Promise<number> {
    try {
      const payload = JSON.parse(await Bun.stdin.text()) as HookPayload;
      await emitCardUsage(payload);
    } catch {
      // Hooks must never disrupt the agent: swallow everything.
    }
    return 0;
  }
}
