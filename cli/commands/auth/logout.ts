// ABOUTME: Implements `drwn logout` by removing local analyzer credentials.
// ABOUTME: Attempts server-side sign-out but treats local credential deletion as authoritative.

import { BaseCommand } from "../base";
import { deleteCredentials, readCredentials } from "../../core/auth/credentials";
import { createAnalyzerClient } from "../../core/http/analyzer-client";
import { resolveCredentialsPath } from "../../core/paths";

type LogoutDeps = {
  fetch?: typeof fetch;
};

export class LogoutCommand extends BaseCommand {
  static override paths = [["logout"]];

  static testDeps: LogoutDeps | undefined;

  static override usage = BaseCommand.Usage({
    category: "Auth",
    description: "Revoke the analyzer session and remove local credentials.",
    details: `
      Reads ~/.agents/drwn/credentials.json, attempts a best-effort sign-out
      request against the analyzer API, and then removes the local credentials
      file. If the server is unreachable, local logout still succeeds.

      This command is safe to run when not logged in.
    `,
    examples: [
      ["Log out locally and remotely", "drwn logout"],
      ["Verify after logout", "drwn whoami"],
    ],
  });

  async execute() {
    const credentialsPath = resolveCredentialsPath(this.context.agentsDir);
    const creds = await readCredentials(credentialsPath);
    if (!creds) {
      this.context.stdout.write("Not logged in.\n");
      return 0;
    }

    const deps = LogoutCommand.testDeps ?? {};
    await createAnalyzerClient(creds.api_url, deps.fetch ?? fetch).signOut(creds.access_token);
    await deleteCredentials(credentialsPath);
    this.context.stdout.write("Logged out. Credentials removed.\n");
    return 0;
  }
}
