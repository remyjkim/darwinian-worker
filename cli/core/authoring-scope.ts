// ABOUTME: Derives a default authoring scope (@<github-handle>) for `drwn card new`.
// ABOUTME: Pure derivation; probing `gh` and `git config` happens through injected runners.

const SCOPE_HANDLE = /^[a-z0-9-]+$/;

export interface AuthoringScopeProbeResults {
  ghLogin: string | null;
  githubUser?: string | null;
  gitEmail?: string | null;
}

export function deriveAuthoringScopeFromProbeResults(
  probe: AuthoringScopeProbeResults,
): string | null {
  const candidates: Array<string | null | undefined> = [
    probe.ghLogin,
    probe.githubUser,
    extractEmailLocalPart(probe.gitEmail ?? null),
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const normalized = candidate.toLowerCase();
    if (SCOPE_HANDLE.test(normalized)) return `@${normalized}`;
  }
  return null;
}

function extractEmailLocalPart(email: string | null): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at <= 0) return null;
  return email.slice(0, at);
}

export interface AuthoringScopeProbeRunners {
  runGh?: () => Promise<string | null>;
  runGit?: (args: string[]) => Promise<string | null>;
}

export async function probeAuthoringScope(
  runners: AuthoringScopeProbeRunners = {},
): Promise<AuthoringScopeProbeResults> {
  const ghLogin = (await runners.runGh?.()) ?? null;
  if (ghLogin) return { ghLogin, githubUser: null, gitEmail: null };

  const githubUser =
    (await runners.runGit?.(["config", "--global", "github.user"])) ?? null;
  if (githubUser) return { ghLogin: null, githubUser, gitEmail: null };

  const gitEmail =
    (await runners.runGit?.(["config", "--global", "user.email"])) ?? null;
  return { ghLogin: null, githubUser: null, gitEmail };
}

export interface ResolveScopeForCardNewOpts {
  explicit?: string;
  savedScope?: string;
  isInteractive: boolean;
  probe: () => Promise<AuthoringScopeProbeResults>;
  prompt: (suggested: string) => Promise<boolean>;
}

export type ResolveScopeForCardNewResult =
  | { kind: "ok"; scope: string; source: "explicit" | "saved" | "derived" }
  | { kind: "error"; message: string };

const SCOPE_REQUIRED_HINT =
  "Unscoped card names require --scope or a saved authoring.scope.";

export async function resolveScopeForCardNew(
  opts: ResolveScopeForCardNewOpts,
): Promise<ResolveScopeForCardNewResult> {
  if (opts.explicit) {
    return { kind: "ok", scope: opts.explicit, source: "explicit" };
  }
  if (opts.savedScope) {
    return { kind: "ok", scope: opts.savedScope, source: "saved" };
  }

  const derived = deriveAuthoringScopeFromProbeResults(await opts.probe());

  if (!opts.isInteractive) {
    if (derived) {
      return {
        kind: "error",
        message: `${SCOPE_REQUIRED_HINT} Detected ${derived} from your gh / git identity but won't auto-set in non-interactive mode. Rerun with --scope ${derived}.`,
      };
    }
    return {
      kind: "error",
      message: `${SCOPE_REQUIRED_HINT} Couldn't derive one from gh or git config.`,
    };
  }

  if (!derived) {
    return {
      kind: "error",
      message: `${SCOPE_REQUIRED_HINT} Couldn't derive one from gh or git config — rerun with --scope <your-handle>.`,
    };
  }

  const accepted = await opts.prompt(derived);
  if (!accepted) {
    return {
      kind: "error",
      message: `Cancelled. Rerun with --scope <your-handle>.`,
    };
  }
  return { kind: "ok", scope: derived, source: "derived" };
}
