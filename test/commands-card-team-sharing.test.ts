// ABOUTME: Verifies card team-sharing commands over local Git remotes.
// ABOUTME: Exercises remote add/list/set/remove, push/fetch, and clone without network.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publishCardWithSkills, cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture } from "./helpers";
import { initBare, listTags } from "../cli/core/git";
import { resolveCardBareRepoPath } from "../cli/core/store-paths";
import { createLocalCardRepo, tagAdditionalVersion } from "./fixtures/git-helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("card remote add/list/set/remove manages local card remotes", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@team/backend", skills: ["alpha"] });
  const remoteDir = await mkdtemp(join(tmpdir(), "drwn-team-remote-"));
  tempRoots.push(remoteDir);
  const remotePath = join(remoteDir, "backend.git");
  await initBare(remotePath);

  expect((await runAgentsCli(["card", "remote", "add", "@team/backend", `file://${remotePath}`], envFor(fixture))).exitCode).toBe(0);
  const listed = await runAgentsCli(["card", "remote", "list", "@team/backend", "--json"], envFor(fixture));
  expect(JSON.parse(listed.stdout).remotes.origin).toBe(`file://${remotePath}`);

  const nextPath = join(remoteDir, "next.git");
  await initBare(nextPath);
  expect((await runAgentsCli(["card", "remote", "set", "@team/backend", `file://${nextPath}`], envFor(fixture))).exitCode).toBe(0);
  expect(JSON.parse((await runAgentsCli(["card", "remote", "list", "@team/backend", "--json"], envFor(fixture))).stdout).remotes.origin).toBe(`file://${nextPath}`);

  expect((await runAgentsCli(["card", "remote", "remove", "@team/backend"], envFor(fixture))).exitCode).toBe(0);
  expect(JSON.parse((await runAgentsCli(["card", "remote", "list", "@team/backend", "--json"], envFor(fixture))).stdout).remotes).toEqual({});
});

test("card push publishes local tags to a configured remote", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@team/backend", skills: ["alpha"] });
  const remoteDir = await mkdtemp(join(tmpdir(), "drwn-team-remote-"));
  tempRoots.push(remoteDir);
  const remotePath = join(remoteDir, "backend.git");
  await initBare(remotePath);
  expect((await runAgentsCli(["card", "remote", "add", "@team/backend", `file://${remotePath}`], envFor(fixture))).exitCode).toBe(0);

  const pushed = await runAgentsCli(["card", "push", "@team/backend"], envFor(fixture));

  expect(pushed.exitCode).toBe(0);
  expect(await listTags(remotePath)).toContain("v1.0.0");
});

test("card fetch imports new remote tags into an existing local card repo", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const remote = await createLocalCardRepo({ name: "@team/backend", version: "1.0.0" });
  tempRoots.push(remote.tempDir);
  expect((await runAgentsCli(["card", "clone", `git+${remote.url}#v1.0.0`], envFor(fixture))).exitCode).toBe(0);
  await tagAdditionalVersion(remote, { name: "@team/backend", version: "1.1.0", skills: ["sample-skill", "beta"] });

  const fetched = await runAgentsCli(["card", "fetch", "@team/backend"], envFor(fixture));

  expect(fetched.exitCode).toBe(0);
  expect(await listTags(resolveCardBareRepoPath(fixture.agentsDir, "@team/backend"))).toContain("v1.1.0");
});

test("card clone resolves a git ref into the local bare-repo store", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const remote = await createLocalCardRepo({ name: "@team/backend", version: "1.0.0" });
  tempRoots.push(remote.tempDir);

  const cloned = await runAgentsCli(["card", "clone", `git+${remote.url}#v1.0.0`, "--json"], envFor(fixture));

  expect(cloned.exitCode).toBe(0);
  expect(JSON.parse(cloned.stdout).name).toBe("@team/backend");
  expect(existsSync(resolveCardBareRepoPath(fixture.agentsDir, "@team/backend"))).toBe(true);
});
