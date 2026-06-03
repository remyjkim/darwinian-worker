// ABOUTME: Resolves analyzer bearer auth from explicit env vars or persisted credentials.
// ABOUTME: Requires DRWN_ANALYZER_URL with DRWN_TOKEN to avoid accidental cross-environment calls.

import { readCredentials } from "./credentials";

export interface ResolveTokenInput {
  credentialsPath: string;
  env: Partial<Record<"DRWN_TOKEN" | "DRWN_ANALYZER_URL", string | undefined>>;
}

export interface ResolvedAuth {
  token: string;
  apiUrl: string;
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export async function resolveToken(input: ResolveTokenInput): Promise<ResolvedAuth | null> {
  if (input.env.DRWN_TOKEN && input.env.DRWN_ANALYZER_URL) {
    return {
      token: input.env.DRWN_TOKEN,
      apiUrl: trimTrailingSlashes(input.env.DRWN_ANALYZER_URL),
    };
  }

  if (input.env.DRWN_TOKEN && !input.env.DRWN_ANALYZER_URL) return null;

  const creds = await readCredentials(input.credentialsPath);
  if (!creds) return null;
  return { token: creds.access_token, apiUrl: trimTrailingSlashes(creds.api_url) };
}
