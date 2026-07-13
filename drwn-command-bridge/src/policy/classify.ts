// ABOUTME: Classifies bridge policy risk levels and consent thresholds.
// ABOUTME: Keeps risk ordering centralized for policy and server decisions.

import type { Risk } from "../schema";

const riskRank: Record<Risk, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

export function isAboveConsentThreshold(risk: Risk, threshold: Risk) {
  return riskRank[risk] > riskRank[threshold];
}
