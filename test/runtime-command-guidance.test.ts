// ABOUTME: Rejects removed prelaunch command grammar in production CLI guidance.
// ABOUTME: Keeps remediation messages aligned with the first supported public contract.

import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const cliRoot = join(import.meta.dir, "..", "cli");
const forbidden = [
  /drwn card (?:add|apply|pin|remove|update|detach)\b/g,
  /drwn worker stack\b/g,
  /drwn mind (?:list|use|clear)\b/g,
  /drwn library\b/g,
  /drwn store\b/g,
  /drwn skills (?:curate|uncurate)\b/g,
  /drwn install --no-apply\b/g,
];

async function productionTypeScriptFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return productionTypeScriptFiles(path);
    return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
  }));
  return files.flat();
}

function withoutComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("production runtime command guidance", () => {
  test("contains no removed command grammar", async () => {
    const findings: string[] = [];
    for (const path of await productionTypeScriptFiles(cliRoot)) {
      const source = withoutComments(await readFile(path, "utf8"));
      for (const pattern of forbidden) {
        for (const match of source.matchAll(pattern)) {
          findings.push(`${path.slice(cliRoot.length + 1)}: ${match[0]}`);
        }
      }
    }

    expect(findings).toEqual([]);
  });
});
