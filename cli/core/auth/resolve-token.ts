// ABOUTME: Resolves DAH services-audience bearer auth from env or stored credentials.
// ABOUTME: Env-provided tokens are validated before send and are never persisted.

import { readCredentials, writeCredentials, type CliDahCredentialFile } from "./credentials";
import { refreshToken, credentialFromTokens } from "./device-flow";
import { drwnCliProfile, type CliAuthProfile } from "./profile";
import { assertJwtAudience, tokenExpiresWithin } from "./jwt";

export interface ResolveTokenInput {
  credentialsPath: string;
  env: Record<string, string | undefined>;
  fetcher?: typeof fetch;
  profile?: CliAuthProfile;
}

export interface ResolvedAuth {
  token: string;
  source?: "env" | "stored";
  credential?: CliDahCredentialFile;
  apiUrl?: string;
}

const REFRESH_SKEW_MS = 120_000;

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export async function resolveToken(input: ResolveTokenInput): Promise<ResolvedAuth | null> {
  const profile = input.profile ?? drwnCliProfile(input.env);
  const envToken = input.env.DRWN_TOKEN ?? input.env.IMINDS_TOKEN;
  if (envToken) {
    assertJwtAudience(envToken, profile.resource, { requireUnexpired: true });
    return {
      token: envToken,
      source: "env",
      apiUrl: input.env.DRWN_ANALYZER_URL ? trimTrailingSlashes(input.env.DRWN_ANALYZER_URL) : undefined,
    };
  }

  const creds = await readCredentials(input.credentialsPath);
  if (!creds) return null;
  if (!("version" in creds)) {
    return input.env.DRWN_ANALYZER_URL
      ? {
        token: creds.access_token,
        source: "stored",
        apiUrl: trimTrailingSlashes(input.env.DRWN_ANALYZER_URL),
      }
      : null;
  }
  if (creds.resource !== profile.resource || creds.clientId !== profile.clientId) return null;

  if (!tokenExpiresWithin(creds.expiresAt, REFRESH_SKEW_MS)) {
    assertJwtAudience(creds.accessToken, profile.resource, { issuer: creds.issuer, requireUnexpired: true });
    return { token: creds.accessToken, source: "stored", credential: creds };
  }

  const refreshed = await refreshStoredCredential({
    credentialsPath: input.credentialsPath,
    credential: creds,
    profile,
    fetcher: input.fetcher,
  });
  return {
    token: refreshed.accessToken,
    source: "stored",
    credential: refreshed,
  };
}

export async function refreshStoredCredential(input: {
  credentialsPath: string;
  credential?: CliDahCredentialFile;
  profile?: CliAuthProfile;
  fetcher?: typeof fetch;
}): Promise<CliDahCredentialFile> {
  const current = input.credential ?? await readCredentials(input.credentialsPath);
  if (!current) throw new Error("Not authenticated. Run `drwn login` first.");
  if (!("version" in current)) throw new Error("Legacy credentials found. Run `drwn login` again.");
  const profile = input.profile ?? drwnCliProfile();
  const tokens = await refreshToken(profile, current.refreshToken, input.fetcher ?? fetch);
  const refreshed = {
    ...credentialFromTokens(profile, tokens),
    user_email: typeof tokens.claims.email === "string" ? tokens.claims.email : current.user_email,
  };
  await writeCredentials(input.credentialsPath, refreshed);
  return refreshed;
}
