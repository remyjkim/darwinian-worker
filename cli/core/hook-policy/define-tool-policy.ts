// ABOUTME: Identity helper providing type inference for author policy modules.
// ABOUTME: Kept trivial so future runtime instrumentation can hook in centrally.

import type { ToolPolicy } from "./types";

export function defineToolPolicy(spec: ToolPolicy): ToolPolicy {
  return spec;
}
