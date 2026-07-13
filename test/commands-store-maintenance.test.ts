// ABOUTME: Verifies store maintenance commands and read-only mutation protection.
// ABOUTME: Covers gc, verify, export, and DRWN_STORE_READONLY.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeContentManifest, manifestIntegrityDigest } from "../cli/core/content-manifest";
import { cleanupTempRoots, envFor, publishCardWithSkills, runAgentsCli, scaffoldCliFixture } from "./helpers";
import { createLocalCardRepo } from "./fixtures/git-helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("store verify reports a valid Git-backed store", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/backend", skills: ["alpha"] });

  const result = await runAgentsCli(["store", "verify", "--json"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout).ok).toBe(true);
});

test("store gc runs maintenance on card repos", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/backend", skills: ["alpha"] });

  const result = await runAgentsCli(["store", "gc"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Garbage collection complete");
});

test("store export refuses whole-store archives before any side effect", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/backend", skills: ["alpha"] });

  const storeRoot = join(fixture.agentsDir, "drwn");
  await writeFile(join(storeRoot, "credentials.json"), "credential-sentinel\n");
  await writeFile(join(storeRoot, "machine.json"), "machine-sentinel\n");
  await writeFile(join(storeRoot, "projects.json"), "project-sentinel\n");
  await writeFile(join(storeRoot, "global-write-record.json"), "write-record-sentinel\n");
  const before = manifestIntegrityDigest(await computeContentManifest(storeRoot));

  const outputRoot = await mkdtemp(join(tmpdir(), "drwn-export-"));
  tempRoots.push(outputRoot);
  const outDir = join(outputRoot, "new-output-dir");
  const out = join(outDir, "store.tar");

  const result = await runAgentsCli(["store", "export", "--out", out], envFor(fixture));

  expect(result.exitCode).not.toBe(0);
  expect(result.stderr + result.stdout).toContain("STORE_EXPORT_DISABLED_UNSAFE");
  expect(result.stderr + result.stdout).toContain("Whole-store export is disabled");
  expect(existsSync(outDir)).toBe(false);
  expect(manifestIntegrityDigest(await computeContentManifest(storeRoot))).toBe(before);
});

test("DRWN_STORE_READONLY blocks store mutations", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  expect((await runAgentsCli(["card", "new", "@me/backend", "--no-git"], envFor(fixture))).exitCode).toBe(0);

  const result = await runAgentsCli(["card", "publish", "@me/backend"], { ...envFor(fixture), DRWN_STORE_READONLY: "1" });

  expect(result.exitCode).not.toBe(0);
  expect((result.stderr + result.stdout).toLowerCase()).toContain("read-only");
});

test("DRWN_STORE_READONLY refuses store migrate-to-git when there is work to do", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  // Plant a fake legacy per-version directory so the migrator has work to refuse.
  const legacyDir = join(fixture.agentsDir, "drwn", "cards", "@me", "legacy");
  await mkdir(join(legacyDir, "1.0.0"), { recursive: true });
  await writeFile(
    join(legacyDir, "1.0.0", "card.json"),
    JSON.stringify({ name: "@me/legacy", version: "1.0.0" }),
  );

  const env = { ...envFor(fixture), DRWN_STORE_READONLY: "1" };
  const result = await runAgentsCli(["store", "migrate-to-git"], env);

  expect(result.exitCode).not.toBe(0);
  expect((result.stderr + result.stdout).toLowerCase()).toContain("read-only");
});

test("DRWN_STORE_READONLY refuses drwn install when a card must be cloned", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  // Stand up a Git-origin card on a local file:// remote and pin it from a project.
  const cardRepo = await createLocalCardRepo({
    name: "@team/baseline",
    version: "1.0.0",
    skills: ["alpha"],
  });
  tempRoots.push(cardRepo.tempDir);

  expect(
    (
      await runAgentsCli(
        ["card", "clone", `git+${cardRepo.url}#v1.0.0`],
        envFor(fixture),
      )
    ).exitCode,
  ).toBe(0);

  // Now wire a project that references this card and produce a lockfile.
  const projectDir = await mkdtemp(join(tmpdir(), "drwn-readonly-install-"));
  tempRoots.push(projectDir);
  expect(
    (
      await runAgentsCli(
        ["init", "--non-interactive", "--no-default-catalogs"],
        envFor(fixture),
        projectDir,
      )
    ).exitCode,
  ).toBe(0);
  expect(
    (
      await runAgentsCli(
        ["card", "add", `git+${cardRepo.url}#v1.0.0`],
        envFor(fixture),
        projectDir,
      )
    ).exitCode,
  ).toBe(0);

  // Wipe the local card store so install must re-clone, then re-run install under READONLY.
  const cardsRoot = join(fixture.agentsDir, "drwn", "cards");
  const extractedRoot = join(fixture.agentsDir, "drwn", "extracted");
  await import("node:fs/promises").then(({ rm }) =>
    Promise.all([
      rm(cardsRoot, { recursive: true, force: true }),
      rm(extractedRoot, { recursive: true, force: true }),
    ]),
  );

  const result = await runAgentsCli(
    ["install"],
    { ...envFor(fixture), DRWN_STORE_READONLY: "1" },
    projectDir,
  );

  expect(result.exitCode).not.toBe(0);
  expect((result.stderr + result.stdout).toLowerCase()).toContain("read-only");
});
