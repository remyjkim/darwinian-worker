// ABOUTME: Enforces card source allowlist policy at card and catalog resolution boundaries.
// ABOUTME: Lets teams constrain which git hosts, owners, catalog scopes, and explicit refs the CLI may fetch.

import { loadConfig } from "./config";
import type { ParsedCardRef } from "./card-store";
import { DrwnError } from "./errors";
import { findProjectConfig, loadProjectConfig } from "./project";
import { loadEffectiveConfig } from "./user-config";
import type { TrustedSourcesPolicy } from "./types";

export type { TrustedSourcesPolicy } from "./types";

function uniq(values: Array<string | undefined> | undefined) {
  return [...new Set((values ?? []).filter((value): value is string => Boolean(value)))];
}

export function mergeTrustedSourcesPolicies(
  policies: Array<TrustedSourcesPolicy | undefined>,
): TrustedSourcesPolicy | undefined {
  const present = policies.filter((policy): policy is TrustedSourcesPolicy => Boolean(policy));
  if (present.length === 0) {
    return undefined;
  }
  return {
    strict: present.some((policy) => policy.strict === true) || undefined,
    gitHosts: uniq(present.flatMap((policy) => policy.gitHosts ?? [])),
    gitOwners: uniq(present.flatMap((policy) => policy.gitOwners ?? [])),
    catalogScopes: uniq(present.flatMap((policy) => policy.catalogScopes ?? [])),
    refs: uniq(present.flatMap((policy) => policy.refs ?? [])),
  };
}

export async function loadEffectiveTrustedSourcesPolicy(options: {
  agentsDir: string;
  repoRoot?: string;
  cwd?: string;
}): Promise<TrustedSourcesPolicy | undefined> {
  const policies: Array<TrustedSourcesPolicy | undefined> = [];

  if (options.repoRoot) {
    const repoConfig = await loadConfig(options.repoRoot);
    policies.push(repoConfig.trustedSources);
    const effective = await loadEffectiveConfig(repoConfig, options.agentsDir);
    policies.push(effective.config.trustedSources);
  }

  const projectConfigPath = options.cwd ? findProjectConfig(options.cwd) : null;
  if (projectConfigPath) {
    const projectConfig = await loadProjectConfig(projectConfigPath);
    policies.push(projectConfig.trustedSources);
  }

  if (process.env.DRWN_TRUSTED_SOURCES_STRICT === "1" || process.env.DRWN_TRUSTED_SOURCES_STRICT === "true") {
    policies.push({ strict: true });
  }

  return mergeTrustedSourcesPolicies(policies);
}

export function assertSourceTrusted(
  parsed: ParsedCardRef,
  policy: TrustedSourcesPolicy | undefined,
): void {
  if (!policy || policy.strict !== true) {
    return;
  }
  if (isExplicitlyAllowed(parsed.original, policy)) {
    return;
  }
  if (parsed.gitUrl && isExplicitlyAllowed(parsed.gitUrl, policy)) {
    return;
  }
  if (parsed.filePath && isExplicitlyAllowed(parsed.filePath, policy)) {
    return;
  }

  if (parsed.origin === "git" && parsed.gitUrl) {
    assertGitUrlTrusted(parsed.gitUrl, policy);
    return;
  }

  if (parsed.origin === "store") {
    const scope = parsed.name.startsWith("@") ? parsed.name.split("/")[0] : null;
    if (scope && policy.catalogScopes?.includes(scope)) {
      return;
    }
    throw new DrwnError(
      "CARD_SOURCE_UNTRUSTED",
      `CARD_SOURCE_UNTRUSTED: store ref ${parsed.original} is not in trustedSources allowlist. Pass --allow-untrusted-source to override.`,
    );
  }

  if (parsed.origin === "file") {
    throw new DrwnError(
      "CARD_SOURCE_UNTRUSTED",
      `CARD_SOURCE_UNTRUSTED: file ref ${parsed.original} is not in trustedSources.refs allowlist. Pass --allow-untrusted-source to override.`,
    );
  }
}

export function assertCatalogSourceTrusted(
  catalogUrl: string,
  policy: TrustedSourcesPolicy | undefined,
): void {
  if (!policy || policy.strict !== true) {
    return;
  }
  if (isExplicitlyAllowed(catalogUrl, policy)) {
    return;
  }
  assertGitUrlTrusted(catalogUrl, policy, "catalog source");
}

function assertGitUrlTrusted(
  gitUrl: string,
  policy: TrustedSourcesPolicy,
  label = "git source",
): void {
  let url: URL;
  try {
    url = new URL(normalizeScpLikeGitUrl(gitUrl));
  } catch {
    throw new DrwnError(
      "CARD_SOURCE_UNTRUSTED",
      `CARD_SOURCE_UNTRUSTED: ${label} ${gitUrl} is not a parseable trustedSources URL. Pass --allow-untrusted-source to override.`,
    );
  }

  const host = url.hostname;
  const owner = url.pathname.replace(/^\//, "").split("/")[0] ?? "";
  if (host && policy.gitHosts?.includes(host)) {
    return;
  }
  if (owner && policy.gitOwners?.includes(owner)) {
    return;
  }
  throw new DrwnError(
    "CARD_SOURCE_UNTRUSTED",
    `CARD_SOURCE_UNTRUSTED: ${label} ${gitUrl} is not in trustedSources allowlist. Pass --allow-untrusted-source to override.`,
  );
}

function isExplicitlyAllowed(value: string, policy: TrustedSourcesPolicy) {
  return policy.refs?.includes(value) === true;
}

function normalizeScpLikeGitUrl(value: string) {
  const match = value.match(/^git@([^:]+):(.+)$/);
  if (!match) {
    return value;
  }
  return `ssh://git@${match[1]}/${match[2]}`;
}
