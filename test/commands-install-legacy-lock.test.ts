// ABOUTME: Verifies legacy card.lock entries without treeSha survive install and trust paths.
// ABOUTME: Ensures persistCardLock backfills treeSha and frozen mode rejects silent mutation.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cardLockPath, loadCardLock } from "../cli/core/card-lock";
import { resolveCardBareRepoPath } from "../cli/core/store-paths";
import * as git from "../cli/core/git";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture } from "./helpers";
import { createLocalCardRepo } from "./fixtures/git-helpers";

const tempRoots: string[] = [];
afterEach(async () => cleanupTempRoots(tempRoots));

async function seedLegacyV4LockWithoutTreeSha(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>, remote: Awaited<ReturnType<typeof createLocalCardRepo>>) {
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
  await writeFile(join(projectDir, ".agents", "drwn", "config.json"), JSON.stringify({ version: 1, cards: ["@team/backend@1.0.0"] }, null, 2));
  const barePath = resolveCardBareRepoPath(fixture.agentsDir, "@team/backend");
  await git.cloneBare(remote.url, barePath);
  await git.configSet(barePath, "drwn.cardName", "@team/backend");
  const commit = await git.revParse(barePath, "refs/tags/v1.0.0");
  const extractedDir = join(fixture.agentsDir, "drwn", "extracted", await git.getCommitTree(barePath, commit));
  await mkdir(extractedDir, { recursive: true });
  await writeFile(
    join(extractedDir, "card.json"),
    JSON.stringify({ name: "@team/backend", version: "1.0.0", skills: { include: ["alpha"] } }, null, 2),
  );
  const { computeCardIntegrity } = await import("../cli/core/card-store");
  const integrity = await computeCardIntegrity(extractedDir);
  await writeFile(
    cardLockPath(projectDir),
    `${JSON.stringify(
      {
        lockfileVersion: 4,
        cards: [
          {
            name: "@team/backend",
            requested: `git+${remote.url}#v1.0.0`,
            version: "1.0.0",
            path: extractedDir,
            integrity,
            manifest: { name: "@team/backend", version: "1.0.0", skills: { include: ["alpha"] } },
            skills: ["alpha"],
            hooks: [],
            registry: null,
            origin: "git",
            git: { url: remote.url, ref: "v1.0.0", commit },
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  return { projectDir, commit };
}

test("install --no-apply backfills missing treeSha into v5 lock", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const remote = await createLocalCardRepo({ name: "@team/backend", version: "1.0.0", skills: ["alpha"] });
  tempRoots.push(remote.tempDir);
  const { projectDir } = await seedLegacyV4LockWithoutTreeSha(fixture, remote);

  const result = await runAgentsCli(["install", "--no-apply"], envFor(fixture), projectDir);
  expect(result.exitCode).toBe(0);

  const lock = await loadCardLock(projectDir);
  expect(lock?.lockfileVersion).toBe(5);
  expect(lock?.cards[0]?.treeSha).toMatch(/^[0-9a-f]{40}$/);
});

test("install --frozen --no-apply rejects legacy lock missing treeSha", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const remote = await createLocalCardRepo({ name: "@team/backend", version: "1.0.0", skills: ["alpha"] });
  tempRoots.push(remote.tempDir);
  const { projectDir } = await seedLegacyV4LockWithoutTreeSha(fixture, remote);
  const before = await readFile(cardLockPath(projectDir), "utf8");

  const result = await runAgentsCli(["install", "--frozen", "--no-apply"], envFor(fixture), projectDir);
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toMatch(/--frozen|treeSha/i);
  expect(await readFile(cardLockPath(projectDir), "utf8")).toBe(before);
});

test("card trust --hooks persists v5 lock with treeSha from legacy v4 fixture", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const remote = await createLocalCardRepo({
    name: "@team/hooks",
    version: "1.0.0",
    skills: ["alpha"],
  });
  tempRoots.push(remote.tempDir);
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
  await writeFile(join(projectDir, ".agents", "drwn", "config.json"), JSON.stringify({ version: 1, cards: ["@team/hooks@1.0.0"] }, null, 2));
  const barePath = resolveCardBareRepoPath(fixture.agentsDir, "@team/hooks");
  await git.cloneBare(remote.url, barePath);
  const commit = await git.revParse(barePath, "refs/tags/v1.0.0");
  const extractedDir = join(fixture.agentsDir, "drwn", "extracted", await git.getCommitTree(barePath, commit));
  await mkdir(join(extractedDir, "hooks", "audit"), { recursive: true });
  await writeFile(join(extractedDir, "card.json"), JSON.stringify({ name: "@team/hooks", version: "1.0.0", hooks: { include: ["audit"] } }, null, 2));
  await writeFile(join(extractedDir, "hooks", "audit", "policy.ts"), "export default {};\n");
  const { computeCardIntegrity } = await import("../cli/core/card-store");
  const integrity = await computeCardIntegrity(extractedDir);
  await writeFile(
    cardLockPath(projectDir),
    `${JSON.stringify(
      {
        lockfileVersion: 4,
        cards: [
          {
            name: "@team/hooks",
            requested: `git+${remote.url}#v1.0.0`,
            version: "1.0.0",
            path: extractedDir,
            integrity,
            manifest: { name: "@team/hooks", version: "1.0.0", hooks: { include: ["audit"] } },
            skills: [],
            hooks: ["audit"],
            registry: null,
            origin: "git",
            git: { url: remote.url, ref: "v1.0.0", commit },
          },
        ],
      },
      null,
      2,
    )}\n`,
  );

  const trust = await runAgentsCli(["card", "trust", "@team/hooks", "--hooks"], envFor(fixture), projectDir);
  expect(trust.exitCode).toBe(0);
  const lock = await loadCardLock(projectDir);
  expect(lock?.lockfileVersion).toBe(5);
  expect(lock?.cards[0]?.treeSha).toMatch(/^[0-9a-f]{40}$/);
  expect(lock?.cards[0]?.hookConsent?.consentedRange).toBeDefined();
});

test("card untrust on legacy v4 fixture persists v5 with treeSha", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const remote = await createLocalCardRepo({ name: "@team/untrust", version: "1.0.0", skills: ["alpha"] });
  tempRoots.push(remote.tempDir);
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
  await writeFile(join(projectDir, ".agents", "drwn", "config.json"), JSON.stringify({ version: 1, cards: ["@team/untrust@1.0.0"] }, null, 2));
  const barePath = resolveCardBareRepoPath(fixture.agentsDir, "@team/untrust");
  await git.cloneBare(remote.url, barePath);
  const commit = await git.revParse(barePath, "refs/tags/v1.0.0");
  const extractedDir = join(fixture.agentsDir, "drwn", "extracted", await git.getCommitTree(barePath, commit));
  await mkdir(extractedDir, { recursive: true });
  await writeFile(join(extractedDir, "card.json"), JSON.stringify({ name: "@team/untrust", version: "1.0.0" }, null, 2));
  const { computeCardIntegrity } = await import("../cli/core/card-store");
  const integrity = await computeCardIntegrity(extractedDir);
  await writeFile(
    cardLockPath(projectDir),
    `${JSON.stringify(
      {
        lockfileVersion: 4,
        cards: [
          {
            name: "@team/untrust",
            requested: `git+${remote.url}#v1.0.0`,
            version: "1.0.0",
            path: extractedDir,
            integrity,
            manifest: { name: "@team/untrust", version: "1.0.0" },
            skills: [],
            hooks: [],
            hookConsent: { consentedAt: "2026-01-01T00:00:00.000Z", consentedRange: "^1.0.0" },
            registry: null,
            origin: "git",
            git: { url: remote.url, ref: "v1.0.0", commit },
          },
        ],
      },
      null,
      2,
    )}\n`,
  );

  const untrust = await runAgentsCli(["card", "untrust", "@team/untrust", "--hooks"], envFor(fixture), projectDir);
  expect(untrust.exitCode).toBe(0);
  const lock = await loadCardLock(projectDir);
  expect(lock?.lockfileVersion).toBe(5);
  expect(lock?.cards[0]?.treeSha).toMatch(/^[0-9a-f]{40}$/);
  expect(lock?.cards[0]?.hookConsent).toBeUndefined();
  expect(existsSync(cardLockPath(projectDir))).toBe(true);
});
