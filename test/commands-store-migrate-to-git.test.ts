// ABOUTME: Verifies migration from per-version card directories to Wave 1 bare repos.
// ABOUTME: Protects integrity checks, idempotency, dry-run behavior, and tmp cleanup.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { computeCardIntegrity, resolveCard } from "../cli/core/card-store";
import { listTags } from "../cli/core/git";
import { resolveCardBareRepoPath } from "../cli/core/store-paths";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function writeLegacyVersion(
  agentsDir: string,
  options: { name?: string; version: string; skills?: string[]; corruptIntegrity?: boolean },
) {
  const name = options.name ?? "@me/backend";
  const [, scope, cardName] = name.match(/^(@[^/]+)\/(.+)$/)!;
  const versionDir = join(agentsDir, "drwn", "cards", scope!, cardName!, options.version);
  await mkdir(join(versionDir, "skills"), { recursive: true });
  const skills = options.skills ?? ["alpha"];
  await writeFile(
    join(versionDir, "card.json"),
    `${JSON.stringify({ name, version: options.version, skills: { include: skills } }, null, 2)}\n`,
  );
  for (const skill of skills) {
    await mkdir(join(versionDir, "skills", skill), { recursive: true });
    await writeFile(join(versionDir, "skills", skill, "SKILL.md"), `# ${skill}\n`);
  }
  const integrity = options.corruptIntegrity ? `sha256-${"0".repeat(64)}` : await computeCardIntegrity(versionDir);
  await writeFile(join(versionDir, ".integrity"), `${integrity}\n`);
  const indexPath = join(agentsDir, "drwn", "cards", scope!, cardName!, "versions.json");
  await writeFile(
    indexPath,
    `${JSON.stringify({ name, versions: [{ version: options.version, publishedAt: `2026-01-${options.version === "1.0.0" ? "01" : "02"}T00:00:00.000Z`, integrity }] }, null, 2)}\n`,
  );
  return versionDir;
}

test("store migrate-to-git converts legacy versions into a bare repo and removes old directories", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await writeLegacyVersion(fixture.agentsDir, { version: "1.0.0", skills: ["alpha"] });
  await writeLegacyVersion(fixture.agentsDir, { version: "1.1.0", skills: ["alpha", "beta"] });

  const result = await runAgentsCli(["store", "migrate-to-git", "--json"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  expect(existsSync(resolveCardBareRepoPath(fixture.agentsDir, "@me/backend"))).toBe(true);
  expect(existsSync(join(fixture.agentsDir, "drwn", "cards", "@me", "backend"))).toBe(false);
  expect(await listTags(resolveCardBareRepoPath(fixture.agentsDir, "@me/backend"))).toEqual(["v1.0.0", "v1.1.0"]);
  expect((await resolveCard(fixture.agentsDir, "@me/backend@^1.0.0")).version).toBe("1.1.0");
});

test("store migrate-to-git dry-run reports without modifying", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await writeLegacyVersion(fixture.agentsDir, { version: "1.0.0" });

  const result = await runAgentsCli(["store", "migrate-to-git", "--dry-run", "--json"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout).cards[0].name).toBe("@me/backend");
  expect(existsSync(join(fixture.agentsDir, "drwn", "cards", "@me", "backend", "1.0.0"))).toBe(true);
  expect(existsSync(resolveCardBareRepoPath(fixture.agentsDir, "@me/backend"))).toBe(false);
});

test("store migrate-to-git is idempotent after successful migration", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await writeLegacyVersion(fixture.agentsDir, { version: "1.0.0" });
  expect((await runAgentsCli(["store", "migrate-to-git"], envFor(fixture))).exitCode).toBe(0);

  const second = await runAgentsCli(["store", "migrate-to-git", "--json"], envFor(fixture));

  expect(second.exitCode).toBe(0);
  expect(JSON.parse(second.stdout).cards).toEqual([]);
});

test("store migrate-to-git removes stale tmp repos before retrying", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await writeLegacyVersion(fixture.agentsDir, { version: "1.0.0" });
  await mkdir(`${resolveCardBareRepoPath(fixture.agentsDir, "@me/backend")}.tmp`, { recursive: true });

  const result = await runAgentsCli(["store", "migrate-to-git"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  expect(existsSync(`${resolveCardBareRepoPath(fixture.agentsDir, "@me/backend")}.tmp`)).toBe(false);
});

test("store migrate-to-git aborts when recorded integrity does not match version content", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await writeLegacyVersion(fixture.agentsDir, { version: "1.0.0", corruptIntegrity: true });

  const result = await runAgentsCli(["store", "migrate-to-git"], envFor(fixture));

  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain("integrity mismatch");
  expect(existsSync(join(fixture.agentsDir, "drwn", "cards", "@me", "backend", "1.0.0"))).toBe(true);
});
