// ABOUTME: Enforces structural-classification versus declared-bump consistency at publish time.
// ABOUTME: Protects card consumers from silent breaking changes within minor or patch releases.

import type { CardDiffClassification } from "./card-diff";
import { DrwnError } from "./errors";
import { classifyBump, type SemverBumpKind } from "./semver-utils";

const BUMP_RANK: Record<SemverBumpKind, number> = {
  patch: 0,
  minor: 1,
  major: 2,
};

const REQUIRED_BUMP: Record<CardDiffClassification, SemverBumpKind> = {
  patch: "patch",
  minor: "minor",
  major: "major",
};

export interface SemverGuardrailInput {
  previousVersion: string;
  nextVersion: string;
  classification: CardDiffClassification;
}

export function assertSemverBumpMatchesClassification(input: SemverGuardrailInput): void {
  const declared = classifyBump(input.previousVersion, input.nextVersion);
  if (declared === null) {
    throw new DrwnError(
      "CARD_SEMVER_NOT_BUMPED",
      `CARD_SEMVER_NOT_BUMPED: version ${input.nextVersion} is not greater than ${input.previousVersion}`,
    );
  }

  const required = REQUIRED_BUMP[input.classification];
  if (BUMP_RANK[declared] < BUMP_RANK[required]) {
    throw new DrwnError(
      "CARD_SEMVER_GUARDRAIL",
      `CARD_SEMVER_GUARDRAIL: structural changes classify as ${input.classification} and require a ${required} bump, but version moved from ${input.previousVersion} to ${input.nextVersion} as a ${declared} bump. Re-bump version or pass --force-bump-mismatch.`,
    );
  }
}

export function bumpOverrideConfigKey(version: string): string {
  return `drwn.bumpOverride.v${version.replace(/\./g, "-")}`;
}
