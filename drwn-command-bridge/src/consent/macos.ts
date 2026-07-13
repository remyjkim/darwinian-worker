// ABOUTME: Implements macOS native dialog consent through osascript.
// ABOUTME: Treats unavailable or rejected dialogs as fail-closed denial.

import { runCommand, type RunCommandResult } from "../exec/executor";
import { ConsentChannelUnavailable, type ConsentGate, type ConsentRequest } from "./gate";

export type ConsentRunner = (argv: string[]) => Promise<RunCommandResult>;

function promptText(req: ConsentRequest) {
  return `Approve host command?\n\nProgram: ${req.program}\nArgs: ${req.argv.join(" ")}\nCWD: ${req.cwd}\nRisk: ${req.risk}\nReason: ${req.reason ?? ""}`;
}

export class MacOsConsentGate implements ConsentGate {
  constructor(private readonly runner: ConsentRunner = (argv) => runCommand({ argv, env: process.env as Record<string, string> })) {}

  async request(req: ConsentRequest) {
    const script = `display dialog ${JSON.stringify(promptText(req))} buttons {"Deny", "Approve"} default button "Deny" cancel button "Deny"`;
    const result = await this.runner(["/usr/bin/osascript", "-e", script]).catch((error: unknown) => {
      throw new ConsentChannelUnavailable(error instanceof Error ? error.message : String(error));
    });
    if (result.spawnError) {
      throw new ConsentChannelUnavailable(result.spawnError);
    }
    return result.exitCode === 0 && result.stdout.includes("button returned:Approve");
  }
}
