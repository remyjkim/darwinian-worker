// ABOUTME: Verifies `drwn card push` publishes a local card repo to its Git remote.
// ABOUTME: Protects the plain push path for capability cards.

import { afterEach, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as git from "../cli/core/git";
import { cleanupTempRoots, envFor, publishCardWithSkills, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function createEmptyBareRemote(prefix: string) {
  const tempDir = await mkdtemp(join(tmpdir(), prefix));
  tempRoots.push(tempDir);
  const path = join(tempDir, "remote.git");
  await git.initBare(path);
  return { tempDir, path, url: `file://${path}` };
}

test("card push publishes a capability card to its remote", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@team/backend", skills: ["alpha"] });
  const remote = await createEmptyBareRemote("card-remote-");
  expect((await runAgentsCli(["card", "remote", "add", "@team/backend", remote.url], envFor(fixture))).exitCode).toBe(0);

  const pushed = await runAgentsCli(["card", "push", "@team/backend"], envFor(fixture));

  expect(pushed.exitCode).toBe(0);
});
