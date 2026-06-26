// ABOUTME: Wraps semver so card and bundle code share one version policy.
// ABOUTME: Keeps prerelease handling consistent across resolvers.

import semver from "semver";

export function isStrictSemver(version: string) {
  return semver.valid(version) === version;
}

export function validRange(range: string) {
  return semver.validRange(range) !== null;
}

export function satisfies(version: string, range: string, options?: { includePrerelease?: boolean }) {
  return semver.satisfies(version, range, { includePrerelease: options?.includePrerelease ?? false });
}

export function maxSatisfying(versions: string[], range: string) {
  return semver.maxSatisfying(versions, range, { includePrerelease: false });
}

export function compareVersions(a: string, b: string) {
  return semver.compare(a, b);
}

export function gt(a: string, b: string) {
  return semver.gt(a, b);
}

export type SemverBumpKind = "major" | "minor" | "patch";

export function classifyBump(previousVersion: string, nextVersion: string): SemverBumpKind | null {
  if (!semver.gt(nextVersion, previousVersion)) {
    return null;
  }
  const previous = semver.parse(previousVersion);
  const next = semver.parse(nextVersion);
  if (!previous || !next) {
    return null;
  }
  if (next.major !== previous.major) {
    return "major";
  }
  if (next.minor !== previous.minor) {
    return "minor";
  }
  return "patch";
}
