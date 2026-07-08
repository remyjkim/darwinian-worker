// ABOUTME: Machine-scoped cache of non-secret mind binding coordinates, keyed by worker slug.
// ABOUTME: Tokens are never persisted here; they are fetched per invocation from the deploy API.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { writeAtomically } from "../fs";
import { resolveUserDrwnDir } from "../paths";

export interface MindBinding {
  mindId: string;
  baseUrl?: string;
  tenantId?: number;
  filesystemId?: string;
  pathPrefix?: string;
}

function bindingsPath(agentsDir: string) {
  return join(resolveUserDrwnDir(agentsDir), "mind-bindings.json");
}

export async function readMindBindings(agentsDir: string): Promise<Record<string, MindBinding>> {
  const path = bindingsPath(agentsDir);
  if (!existsSync(path)) {
    return {};
  }
  return JSON.parse(await readFile(path, "utf8")) as Record<string, MindBinding>;
}

export async function writeMindBinding(agentsDir: string, slug: string, binding: MindBinding): Promise<void> {
  const bindings = await readMindBindings(agentsDir);
  bindings[slug] = binding;
  await writeAtomically(bindingsPath(agentsDir), `${JSON.stringify(bindings, null, 2)}\n`);
}
