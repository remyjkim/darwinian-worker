// ABOUTME: Scans active optional Worker Mind surfaces for removed numbered-memory contracts.
// ABOUTME: Keeps explicit rejection fixtures separate from production and real-card sources.

import { expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..");
const mindToolsRoot = "/Users/pureicis/dev/darwinian-cards/mind-tools";
const mindStarterRoot = "/Users/pureicis/dev/darwinian-cards/mind-starter";
const workerSkillsRoot = join(repoRoot, "darwinian-worker-skills");

function filesUnder(path: string): string[] {
  if (!existsSync(path)) return [];
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).sort().flatMap((name) => name === ".git" ? [] : filesUnder(join(path, name)));
}

test("active Worker Mind code, integration tests, and canonical Cards use semantic memory only", () => {
  const activePaths = [
    join(repoRoot, "cli/core/card-manifest.ts"),
    join(repoRoot, "cli/core/card-lock.ts"),
    join(repoRoot, "cli/core/mind-capability.ts"),
    join(repoRoot, "cli/core/mind-store"),
    join(repoRoot, "cli/commands/worker/mind"),
    join(repoRoot, "test/mind-substrate-e2e.test.ts"),
    join(repoRoot, "test/mind-substrate-pollution.test.ts"),
    join(repoRoot, "test/scenarios-mind-cards-smoke.test.ts"),
    join(repoRoot, "test/e2e-mind-journey.test.ts"),
    join(repoRoot, "test/core-fake-bgdb.test.ts"),
    mindToolsRoot,
    mindStarterRoot,
    join(workerSkillsRoot, "skills", "author-mind-content"),
    join(workerSkillsRoot, "skills", "audit-mind-visibility"),
    join(workerSkillsRoot, "cards", "base-mind"),
  ];
  const numbered = new RegExp(`\\b[Ll][${"456"}]\\b|/l[${"456"}](?:/|\\b)|memoryLayerRoot|MEMORY_LAYER_NAMES|MemoryLayerName|memory layers?`, "g");
  const forbiddenPaths = new RegExp(`/pool/raw_data(?:/|\\b)|/memory/raw_data(?:/|\\b)`, "g");
  const violations: string[] = [];

  for (const file of activePaths.flatMap(filesUnder)) {
    const content = readFileSync(file, "utf8");
    if (numbered.test(content)) violations.push(`${file}: numbered contract residue`);
    numbered.lastIndex = 0;
    if (forbiddenPaths.test(content)) violations.push(`${file}: unsupported raw_data path`);
    forbiddenPaths.lastIndex = 0;
  }

  expect(violations).toEqual([]);
});

test("negative fixtures remain scoped to explicit hard-cut rejection tests", () => {
  const negativeFixtures = [
    "test/core-card-manifest.test.ts",
    "test/core-card-lock.test.ts",
    "test/core-mind-store-mind-index.test.ts",
    "test/core-mind-store-paths.test.ts",
    "test/core-mind-store-client.test.ts",
    "test/commands-worker-mind.test.ts",
  ];
  for (const relative of negativeFixtures) {
    expect(existsSync(join(repoRoot, relative))).toBe(true);
  }
});
