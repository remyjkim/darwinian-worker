// ABOUTME: Exercises Wave 2 capture, quality fields, and URL cache together.
// ABOUTME: Provides an end-to-end regression for the Git-backed adoption flow.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readUrlCardName } from "../cli/core/url-card-map";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture } from "./helpers";
import { createLocalCardRepo } from "./fixtures/git-helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("Wave 2 flow captures a Git-backed project, publishes it, and consumes the captured card", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const remote = await createLocalCardRepo({ name: "@team/base", version: "1.0.0", skills: ["remote-alpha"] });
  tempRoots.push(remote.tempDir);
  const projectA = join(fixture.root, "project-a");
  await mkdir(join(projectA, ".agents", "drwn"), { recursive: true });
  await writeFile(join(projectA, ".agents", "drwn", "config.json"), JSON.stringify({ version: 1 }, null, 2));

  const addRemote = await runAgentsCli(["add", `git+${remote.url}#v1.0.0`], envFor(fixture), projectA);
  const useRemote = await runAgentsCli(["mind", "use", "@team/base"], envFor(fixture), projectA);
  const writeA = await runAgentsCli(["write"], envFor(fixture), projectA);

  expect(addRemote.exitCode).toBe(0);
  expect(useRemote.exitCode).toBe(0);
  expect(writeA.exitCode).toBe(0);
  expect(existsSync(join(projectA, ".claude", "skills", "remote-alpha"))).toBe(true);
  expect((await readUrlCardName(fixture.agentsDir, remote.url))?.name).toBe("@team/base");

  const capture = await runAgentsCli(["card", "new", "@me/captured-wave2", "--from-project", projectA, "--no-git"], envFor(fixture));
  expect(capture.exitCode).toBe(0);
  const sourceDir = join(fixture.agentsDir, "drwn", "sources", "@me", "captured-wave2");
  const manifestPath = join(sourceDir, "card.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.stability = "stable";
  manifest.lastValidatedWith = "0.1.0";
  manifest.testStatusBadge = "https://example.com/captured-wave2.svg";
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const publish = await runAgentsCli(["card", "publish", "@me/captured-wave2"], envFor(fixture));
  expect(publish.exitCode).toBe(0);

  const projectB = join(fixture.root, "project-b");
  await mkdir(join(projectB, ".agents", "drwn"), { recursive: true });
  await writeFile(join(projectB, ".agents", "drwn", "config.json"), JSON.stringify({ version: 1 }, null, 2));
  const addCaptured = await runAgentsCli(["add", "@me/captured-wave2@0.1.0"], envFor(fixture), projectB);
  const useCaptured = await runAgentsCli(["mind", "use", "@me/captured-wave2"], envFor(fixture), projectB);
  const writeB = await runAgentsCli(["write"], envFor(fixture), projectB);
  const show = await runAgentsCli(["card", "show", "@me/captured-wave2@0.1.0", "--json"], envFor(fixture));

  expect(addCaptured.exitCode).toBe(0);
  expect(useCaptured.exitCode).toBe(0);
  expect(writeB.exitCode).toBe(0);
  expect(existsSync(join(projectB, ".claude", "skills", "remote-alpha"))).toBe(true);
  expect(show.exitCode).toBe(0);
  const shown = JSON.parse(show.stdout);
  expect(shown.manifest.stability).toBe("stable");
  expect(shown.manifest.testStatusBadge).toBe("https://example.com/captured-wave2.svg");
});
