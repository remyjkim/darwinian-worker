// ABOUTME: Validates whether a locked card has usable hook execution consent.
// ABOUTME: Shared by write sync, card status, and diagnostics.

import type { CardLockEntry } from "./card-lock";
import { satisfies } from "./semver-utils";

export function isHookConsentValid(entry: CardLockEntry) {
  if (entry.hooks.length === 0) {
    return true;
  }
  if (!entry.hookConsent) {
    return false;
  }
  return satisfies(entry.version, entry.hookConsent.consentedRange, { includePrerelease: true });
}
