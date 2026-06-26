// ABOUTME: `drwn hook card-usage` — UserPromptSubmit hook that records active Mind Cards.
// ABOUTME: Reads Claude's hook JSON from stdin, appends a write-on-change card_usage signal, always exits 0 silently.

import { BaseCommand } from "../base";
import { emitCardUsage } from "../../core/hook-runner";
import type { HookPayload } from "../../core/hook-signals";

// Internal subcommand: invoked by Claude as a UserPromptSubmit hook, not by users.
// Intentionally has no `static usage` so it stays hidden from `drwn --help`.
export class HookCardUsageCommand extends BaseCommand {
  static override paths = [["hook", "card-usage"]];

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
