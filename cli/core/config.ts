// ABOUTME: Loads and saves the baseline harness config used by drwn and the sync wrapper.
// ABOUTME: Keeps config access centralized so command and sync code share the same semantics.

import { readFile, writeFile } from "node:fs/promises";
import { resolvePackagedConfigPath } from "./paths";
import type { CanonicalConfig } from "./types";

export async function loadConfig(repoRoot: string): Promise<CanonicalConfig> {
  return JSON.parse(await readFile(resolvePackagedConfigPath(repoRoot), "utf8")) as CanonicalConfig;
}

export async function saveConfig(repoRoot: string, config: CanonicalConfig) {
  await writeFile(resolvePackagedConfigPath(repoRoot), `${JSON.stringify(config, null, 2)}\n`);
}
