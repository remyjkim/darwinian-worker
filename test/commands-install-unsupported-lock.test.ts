// ABOUTME: Verifies install rejects prototype project lock formats without migration.
// ABOUTME: Protects project and machine state from mutation after unsupported input.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture, writeSupportedProjectConfig } from "./helpers";

const tempRoots: string[] = [];
afterEach(async () => cleanupTempRoots(tempRoots));

test("install rejects an unsupported prototype lock without changing any bytes", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const projectDir = join(fixture.root, "project");
  const stateDir = join(projectDir, ".agents", "drwn");
  await writeSupportedProjectConfig(projectDir, { workers: ["@me/old@1.0.0"], activeWorker: "@me/old" });
  await mkdir(stateDir, { recursive: true });
  const prototypeLock = `${JSON.stringify({ lockfileVersion: 5, cards: [] }, null, 2)}\n`;
  await writeFile(join(stateDir, "card.lock"), prototypeLock);
  const configBefore = await readFile(join(stateDir, "config.json"), "utf8");

  const result = await runAgentsCli(["install", "--no-write"], envFor(fixture), projectDir);

  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain("PROJECT_LOCK_INVALID");
  expect(await readFile(join(stateDir, "config.json"), "utf8")).toBe(configBefore);
  expect(await readFile(join(stateDir, "card.lock"), "utf8")).toBe(prototypeLock);
  expect(existsSync(join(fixture.agentsDir, "drwn"))).toBe(false);
  expect(existsSync(join(projectDir, ".claude"))).toBe(false);
});
