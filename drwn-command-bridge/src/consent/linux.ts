// ABOUTME: Implements Linux consent through zenity or kdialog approval prompts.
// ABOUTME: Avoids notification-only channels because they cannot approve safely.

import { runCommand } from "../exec/executor";
import { ConsentChannelUnavailable, type ConsentGate, type ConsentRequest } from "./gate";
import type { ConsentRunner } from "./macos";

function promptText(req: ConsentRequest) {
  return `Approve host command?\n\nProgram: ${req.program}\nArgs: ${req.argv.join(" ")}\nCWD: ${req.cwd}\nRisk: ${req.risk}\nReason: ${req.reason ?? ""}`;
}

export class LinuxConsentGate implements ConsentGate {
  constructor(private readonly runner: ConsentRunner = (argv) => runCommand({ argv, env: process.env as Record<string, string> })) {}

  async request(req: ConsentRequest) {
    const message = promptText(req);
    const zenity = await this.runner(["zenity", "--question", "--title", "drwn-command-bridge consent", "--text", message]);
    if (!zenity.spawnError) {
      return zenity.exitCode === 0;
    }

    const kdialog = await this.runner(["kdialog", "--yesno", message]);
    if (!kdialog.spawnError) {
      return kdialog.exitCode === 0;
    }

    throw new ConsentChannelUnavailable("zenity and kdialog are unavailable");
  }
}
