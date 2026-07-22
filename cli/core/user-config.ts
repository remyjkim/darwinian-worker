// ABOUTME: Loads strict machine intent and merges only approved policy into packaged runtime config.
// ABOUTME: Never reads prototype config or infers machine capabilities from ambient directories.

import { resolveMachineConfigPath } from "./store-paths";
import {
  initializeMachineConfig,
  readMachineConfigFile,
} from "./machine-config";
import { ALL_TARGET_NAMES } from "./targets";
import type { CanonicalConfig, CanonicalRegistry, MachineConfig } from "./types";

export async function loadOrInitializeMachineConfig(options: {
  repoConfig: CanonicalConfig;
  registry: CanonicalRegistry;
  agentsDir: string;
}) {
  void options.repoConfig;
  void options.registry;
  const path = resolveMachineConfigPath(options.agentsDir);
  const initialized = await initializeMachineConfig(path);
  return { path, ...initialized };
}

export async function loadEffectiveConfig(repoConfig: CanonicalConfig, agentsDir: string) {
  const path = resolveMachineConfigPath(agentsDir);
  const machineConfig = await readMachineConfigFile(path);
  if (!machineConfig) {
    return { config: repoConfig, userConfigPath: null };
  }
  return { config: mergeMachinePolicy(repoConfig, machineConfig), userConfigPath: path };
}

function mergeMachinePolicy(repoConfig: CanonicalConfig, machineConfig: MachineConfig): CanonicalConfig {
  const merged: CanonicalConfig = structuredClone(repoConfig);
  const policy = machineConfig.policy;

  for (const target of ALL_TARGET_NAMES) {
    if (policy.targets?.[target]) {
      merged.targets[target] = { ...merged.targets[target], ...policy.targets[target] };
    }
  }
  if (policy.catalogs) {
    merged.catalogs = {
      ...merged.catalogs,
      ...policy.catalogs,
      npmSkills: policy.catalogs.npmSkills
        ? { ...merged.catalogs?.npmSkills, ...policy.catalogs.npmSkills }
        : merged.catalogs?.npmSkills,
      mcp: policy.catalogs.mcp
        ? { ...merged.catalogs?.mcp, ...policy.catalogs.mcp }
        : merged.catalogs?.mcp,
    };
  }
  if (policy.analyzer) {
    merged.analyzer = { ...merged.analyzer, ...policy.analyzer };
  }
  if (policy.trustedSources) {
    merged.trustedSources = { ...merged.trustedSources, ...policy.trustedSources };
  }
  return merged;
}
