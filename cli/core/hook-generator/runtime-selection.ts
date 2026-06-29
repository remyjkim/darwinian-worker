// ABOUTME: Resolves which hook runtimes should be materialized for a sync run.
// ABOUTME: Keeps hook runtime selection separate from MCP target names.

import type { Runtime } from "../hook-policy/types";
import type { CanonicalConfig, ProjectConfig, TargetName } from "../types";
import { ALL_TARGET_NAMES, getTargetDescriptor } from "../targets";

export interface HookRuntimeSelectionInput {
  effectiveConfig: Pick<CanonicalConfig, "targets">;
  projectConfig?: ProjectConfig | null;
  target?: TargetName;
}

const ORDERED_RUNTIMES: Runtime[] = ["claude-code", "codex", "mastra"];

function defaultEnabled(runtime: Runtime, config: Pick<CanonicalConfig, "targets">) {
  const owningTarget = ALL_TARGET_NAMES.find((name) => getTargetDescriptor(name).hookRuntime === runtime);
  return owningTarget ? config.targets[owningTarget].enabled : false;
}

function targetAllowsRuntime(target: TargetName | undefined, runtime: Runtime) {
  if (!target) {
    return true;
  }
  return getTargetDescriptor(target).hookRuntime === runtime;
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
