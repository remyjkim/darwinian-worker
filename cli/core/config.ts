// ABOUTME: Loads and saves the canonical config file used by the agents CLI and sync wrapper.
// ABOUTME: Keeps config access centralized so command and sync code share the same semantics.

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CanonicalConfig } from "./types";

export async function loadConfig(repoRoot: string): Promise<CanonicalConfig> {
  return JSON.parse(await readFile(join(repoRoot, "config.json"), "utf8")) as CanonicalConfig;
}

export async function saveConfig(repoRoot: string, config: CanonicalConfig) {
  await writeFile(join(repoRoot, "config.json"), `${JSON.stringify(config, null, 2)}\n`);
}
