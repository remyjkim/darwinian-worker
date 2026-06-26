// ABOUTME: Resolves which hook runtimes should be materialized for a sync run.
// ABOUTME: Keeps hook runtime selection separate from MCP target names.

import type { Runtime } from "../hook-policy/types";
import type { CanonicalConfig, ProjectConfig, TargetName } from "../types";

export interface HookRuntimeSelectionInput {
  effectiveConfig: Pick<CanonicalConfig, "targets">;
  projectConfig?: ProjectConfig | null;
  target?: TargetName;
}

const ORDERED_RUNTIMES: Runtime[] = ["claude-code", "codex", "mastra"];

function defaultEnabled(runtime: Runtime, config: Pick<CanonicalConfig, "targets">) {
  if (runtime === "claude-code") {
    return config.targets.claude.enabled;
  }
  if (runtime === "codex") {
    return config.targets.codex.enabled;
  }
  return false;
}

function targetAllowsRuntime(target: TargetName | undefined, runtime: Runtime) {
  if (!target) {
    return true;
  }
  if (target === "claude") {
    return runtime === "claude-code";
  }
  if (target === "codex") {
    return runtime === "codex";
  }
  return false;
}

export function resolveHookRuntimes(input: HookRuntimeSelectionInput): Runtime[] {
  const runtimeOverrides = input.projectConfig?.hooks?.runtimes ?? {};

  return ORDERED_RUNTIMES.filter((runtime) => {
    if (!targetAllowsRuntime(input.target, runtime)) {
      return false;
    }
    return runtimeOverrides[runtime]?.enabled ?? defaultEnabled(runtime, input.effectiveConfig);
  });
}
