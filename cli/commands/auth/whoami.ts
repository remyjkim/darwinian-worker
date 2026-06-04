// ABOUTME: Implements `drwn whoami` by validating the current analyzer bearer session.
// ABOUTME: Avoids stale local-only identity by always checking the server session endpoint.

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { readCredentials } from "../../core/auth/credentials";
import { resolveToken } from "../../core/auth/resolve-token";
import { AuthExpiredError } from "../../core/http/errors";
import { createAnalyzerClient } from "../../core/http/analyzer-client";
import { resolveCredentialsPath } from "../../core/paths";

type WhoamiDeps = {
  env?: Partial<Record<"DRWN_TOKEN" | "DRWN_ANALYZER_URL", string | undefined>>;
  fetch?: typeof fetch;
};

export class WhoamiCommand extends BaseCommand {
  static override paths = [["whoami"]];

  static testDeps: WhoamiDeps | undefined;

  static override usage = BaseCommand.Usage({
    category: "Auth",
    description: "Print the current analyzer identity after validating the session.",
    details: `
      Resolves auth from DRWN_TOKEN plus DRWN_ANALYZER_URL, or from
      ~/.agents/drwn/credentials.json, then calls the analyzer session endpoint.
      This command intentionally checks the server so revoked or expired local
      credentials are reported accurately.

      Use --json when scripting identity checks.
    `,
    examples: [
      ["Print the signed-in email", "drwn whoami"],
      ["Print JSON identity details", "drwn whoami --json"],
      ["Check an explicit token", "DRWN_TOKEN=... DRWN_ANALYZER_URL=http://localhost:8787 drwn whoami"],
    ],
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const deps = WhoamiCommand.testDeps ?? {};
    const env = deps.env ?? process.env as NonNullable<WhoamiDeps["env"]>;
    const credentialsPath = resolveCredentialsPath(this.context.agentsDir);
    const auth = await resolveToken({
      credentialsPath,
      env,
    });
    if (!auth) {
      this.context.stderr.write("Not authenticated. Run `drwn login` first (or set DRWN_TOKEN + DRWN_ANALYZER_URL).\n");
      return 1;
    }

    try {
      const session = await createAnalyzerClient(auth.apiUrl, deps.fetch ?? fetch).getSession(auth.token);
      if (!session) {
        this.context.stderr.write("Session expired. Run `drwn login`.\n");
        return 1;
      }
      if (this.json) {
        const stored = env.DRWN_TOKEN && env.DRWN_ANALYZER_URL ? null : await readCredentials(credentialsPath);
        this.context.stdout.write(
          JSON.stringify({
            email: session.user.email,
            api_url: auth.apiUrl,
            saved_at: stored?.saved_at,
            expires_at: session.session?.expiresAt,
          }) + "\n",
        );
      } else {
        this.context.stdout.write(`${session.user.email}\n`);
      }
      return 0;
    } catch (error) {
      if (error instanceof AuthExpiredError) {
        this.context.stderr.write("Session expired. Run `drwn login`.\n");
      } else {
        this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      }
      return 1;
    }
  }
}
