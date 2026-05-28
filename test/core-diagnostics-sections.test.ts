// ABOUTME: Verifies structured diagnostics sections for store, cards, and write records.
// ABOUTME: Protects status/doctor refactors from losing cards-era operational state.

import { afterEach, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { buildDiagnosticsSections } from "../cli/core/diagnostics";
import { writeCardLock } from "../cli/core/card-lock";
import { saveWriteRecord } from "../cli/core/write-record";
import { cleanupTempRoots, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("diagnostics sections compose cards, store, and write-record state", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = join(fixture.root, "project");
  const configPath = join(projectDir, ".agents", "bgng", "config.json");
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify({ version: 1, cards: ["@me/backend@^1.0.0"] }, null, 2));
  writeCardLock(projectDir, [
    {
      name: "@me/backend",
      requested: "@me/backend@^1.0.0",
      version: "1.0.0",
      path: join(fixture.agentsDir, "bgng", "cards", "@me", "backend", "1.0.0"),
      integrity: "sha256-test",
      manifest: { name: "@me/backend", version: "1.0.0", skills: { include: ["alpha"] } },
      skills: ["alpha"],
      registry: null,
    },
  ]);
  saveWriteRecord(join(projectDir, ".agents", "bgng", "write-record.json"), {
    writeRecordVersion: 1,
    lastWriteAt: "2026-05-20T00:00:00.000Z",
    lastWriteHarnessVersion: "0.1.0",
    managedPaths: [{ path: ".claude/skills/alpha", kind: "symlink", target: "alpha" }],
  });

  const sections = await buildDiagnosticsSections(fixture.repoRoot, fixture.agentsDir, fixture.homeDir, configPath);

  expect(sections.store.path).toContain(".agents/bgng");
  expect(sections.cards.configuredRefs).toEqual(["@me/backend@^1.0.0"]);
  expect(sections.cards.lockedVersions).toEqual(["@me/backend@1.0.0"]);
  expect(sections.writeRecord.present).toBe(true);
  expect(sections.writeRecord.managedPathCount).toBe(1);
});
