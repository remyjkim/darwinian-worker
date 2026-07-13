// ABOUTME: Implements Windows consent through an explicit PowerShell dialog.
// ABOUTME: Refuses approval when no desktop approval channel is available.

import { runCommand, type RunCommandResult } from "../exec/executor";
import { ConsentChannelUnavailable, type ConsentGate, type ConsentRequest } from "./gate";
import type { ConsentRunner } from "./macos";

function escapePowerShellString(value: string) {
  return value.replace(/'/g, "''");
}

export class WindowsConsentGate implements ConsentGate {
  constructor(private readonly runner: ConsentRunner = (argv) => runCommand({ argv, env: process.env as Record<string, string> })) {}

  async request(req: ConsentRequest) {
    const message = `Approve host command?\n\nProgram: ${req.program}\nArgs: ${req.argv.join(" ")}\nCWD: ${req.cwd}\nRisk: ${req.risk}\nReason: ${req.reason ?? ""}`;
    const script = [
      "Add-Type -AssemblyName PresentationFramework",
      `$r=[System.Windows.MessageBox]::Show('${escapePowerShellString(message)}','drwn-command-bridge consent','YesNo','Warning')`,
      "if ($r -eq 'Yes') { exit 0 } else { exit 1 }",
    ].join("; ");
    const result: RunCommandResult = await this.runner(["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script]).catch(
      (error: unknown) => {
        throw new ConsentChannelUnavailable(error instanceof Error ? error.message : String(error));
      },
    );
    if (result.spawnError) {
      throw new ConsentChannelUnavailable(result.spawnError);
    }
    return result.exitCode === 0;
  }
}
