// ABOUTME: Loads and saves the packaged MCP registry file for the drwn harness CLI.
// ABOUTME: Provides the single shared entrypoint for registry reads and future mutation commands.

import { readFile, writeFile } from "node:fs/promises";
import { resolvePackagedMcpRegistryPath } from "./paths";
import type { CanonicalRegistry } from "./types";

export async function loadRegistry(repoRoot: string): Promise<CanonicalRegistry> {
  return JSON.parse(await readFile(resolvePackagedMcpRegistryPath(repoRoot), "utf8")) as CanonicalRegistry;
}

export async function saveRegistry(repoRoot: string, registry: CanonicalRegistry) {
  await writeFile(resolvePackagedMcpRegistryPath(repoRoot), `${JSON.stringify(registry, null, 2)}\n`);
}
