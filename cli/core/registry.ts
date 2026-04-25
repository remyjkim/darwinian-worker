// ABOUTME: Loads and saves the canonical MCP registry file for the agents CLI.
// ABOUTME: Provides the single shared entrypoint for registry reads and future mutation commands.

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CanonicalRegistry } from "./types";

export async function loadRegistry(repoRoot: string): Promise<CanonicalRegistry> {
  return JSON.parse(await readFile(join(repoRoot, "mcp-servers.json"), "utf8")) as CanonicalRegistry;
}

export async function saveRegistry(repoRoot: string, registry: CanonicalRegistry) {
  await writeFile(join(repoRoot, "mcp-servers.json"), `${JSON.stringify(registry, null, 2)}\n`);
}
