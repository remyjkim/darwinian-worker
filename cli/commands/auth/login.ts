// ABOUTME: Implements `drwn login` using Better Auth's OAuth device flow.
// ABOUTME: Persists analyzer bearer credentials under ~/.agents/drwn for future commands.

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { openBrowser as defaultOpenBrowser } from "../../core/auth/browser";
import { loadAnalyzerConfig } from "../../core/auth/config";
import { runDeviceFlow } from "../../core/auth/device-flow";
import { writeCredentials } from "../../core/auth/credentials";
import { createAnalyzerClient } from "../../core/http/analyzer-client";
import { resolveCredentialsPath } from "../../core/paths";

type LoginDeps = {
  env?: Partial<Record<"DRWN_ANALYZER_URL" | "DRWN_ANALYZER_WEB_URL", string | undefined>>;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  openBrowser?: (url: string) => void;
};

export class LoginCommand extends BaseCommand {
  static override paths = [["login"]];

  static testDeps: LoginDeps | undefined;

  static override usage = BaseCommand.Usage({
    category: "Auth",
    description: "Authenticate with the Darwinian analyzer via the device flow.",
    details: `
      Requests a device code from the analyzer API, opens the browser for Google
      sign-in and approval, waits for authorization, validates the resulting
      session, and saves credentials to ~/.agents/drwn/credentials.json.

      Set DRWN_ANALYZER_URL or analyzer.apiUrl in the user config before running
      this command. The credentials file is written with owner-only permissions.
    `,
    examples: [
      ["Sign in", "drwn login"],
      ["Print URL only without opening a browser", "drwn login --no-browser"],
      ["Use a local analyzer API", "DRWN_ANALYZER_URL=http://localhost:8787 drwn login"],
    ],
  });

  noBrowser = Option.Boolean("--no-browser", false, {
    description: "Print the verification URL without opening a browser.",
  });

  json = Option.Boolean("--json", false, {
    description: "Emit machine-readable JSON output.",
  });

  async execute() {
    const deps = LoginCommand.testDeps ?? {};
    const env = deps.env ?? process.env as LoginDeps["env"];
    const cfg = await loadAnalyzerConfig(this.context, env);
    if (!cfg.apiUrl) {
      this.context.stderr.write(
        `No analyzer.apiUrl configured. Set it in ${cfg.configPath} or DRWN_ANALYZER_URL.\n`,
      );
      return 1;
    }

    try {
      const client = createAnalyzerClient(cfg.apiUrl, deps.fetch ?? fetch);
      const token = await runDeviceFlow({
        client,
        clientId: cfg.clientId,
        sleep: deps.sleep,
        now: deps.now,
        onUserAction: ({ verification_uri_complete, user_code }) => {
          const instructions =
            `To sign in, visit:\n  ${verification_uri_complete}\nCode: ${user_code}\nWaiting for authorization...\n`;
          if (this.json) {
            this.context.stderr.write(instructions);
          } else {
            this.context.stdout.write(instructions);
          }
          if (!this.noBrowser) {
            (deps.openBrowser ?? defaultOpenBrowser)(verification_uri_complete);
          }
        },
      });
      const session = await client.getSession(token.access_token);
      const email = session?.user.email;
      if (!email) {
        this.context.stderr.write("Authentication succeeded but no user session was returned.\n");
        return 1;
      }

      const credentialsPath = resolveCredentialsPath(this.context.agentsDir);
      const savedAt = new Date().toISOString();
      await writeCredentials(credentialsPath, {
        api_url: cfg.apiUrl,
        access_token: token.access_token,
        user_email: email,
        saved_at: savedAt,
      });
      if (this.json) {
        this.context.stdout.write(JSON.stringify({ email, saved_at: savedAt }) + "\n");
      } else {
        this.context.stdout.write(`Authenticated as ${email}. Credentials saved to ${credentialsPath}.\n`);
      }
      return 0;
    } catch (error) {
      this.context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
  }
}
