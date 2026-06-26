// ABOUTME: Verifies hook consent command workflows mutate card.lock safely.
// ABOUTME: Protects explicit user consent before hook materialization.

import { afterEach, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function setupProjectWithHookCard() {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  expect((await runAgentsCli(["card", "new", "@me/policy", "--no-git"], envFor(fixture))).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "source", "add-hook", "@me/policy", "guard"], envFor(fixture))).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "publish", "@me/policy"], envFor(fixture))).exitCode).toBe(0);
  const sourceDir = join(fixture.agentsDir, "drwn", "sources", "@me", "policy");
  const manifest = JSON.parse(await readFile(join(sourceDir, "card.json"), "utf8"));
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
  await writeFile(join(projectDir, ".agents", "drwn", "config.json"), JSON.stringify({ version: 1, cards: [] }, null, 2));
  expect((await runAgentsCli(["card", "add", `@me/policy@${manifest.version}`], envFor(fixture), projectDir)).exitCode).toBe(0);
  return { fixture, projectDir };
}

async function readLock(projectDir: string) {
  return JSON.parse(await readFile(join(projectDir, ".agents", "drwn", "card.lock"), "utf8"));
}

test("card trust --hooks records explicit consent range", async () => {
  const { fixture, projectDir } = await setupProjectWithHookCard();

  const result = await runAgentsCli(["card", "trust", "@me/policy", "--hooks", "--range", "^1.0.0"], envFor(fixture), projectDir);

  expect(result.exitCode).toBe(0);
  const consent = (await readLock(projectDir)).cards[0].hookConsent;
  expect(consent.consentedRange).toBe("^1.0.0");
  expect(new Date(consent.consentedAt).toISOString()).toBe(consent.consentedAt);
});

test("card add warns when the added card declares hooks without consent", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  expect((await runAgentsCli(["card", "new", "@me/policy", "--no-git"], envFor(fixture))).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "source", "add-hook", "@me/policy", "guard"], envFor(fixture))).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "publish", "@me/policy"], envFor(fixture))).exitCode).toBe(0);
  const manifest = JSON.parse(await readFile(join(fixture.agentsDir, "drwn", "sources", "@me", "policy", "card.json"), "utf8"));
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
  await writeFile(join(projectDir, ".agents", "drwn", "config.json"), JSON.stringify({ version: 1, cards: [] }, null, 2));

  const result = await runAgentsCli(["card", "add", `@me/policy@${manifest.version}`], envFor(fixture), projectDir);

  expect(result.exitCode).toBe(0);
  expect(result.stderr).toContain("declares hooks");
  expect(result.stderr).toContain("drwn card trust @me/policy --hooks");
});

test("card trust --hooks defaults range from locked version and updates timestamp idempotently", async () => {
  const { fixture, projectDir } = await setupProjectWithHookCard();

  expect((await runAgentsCli(["card", "trust", "@me/policy", "--hooks"], envFor(fixture), projectDir)).exitCode).toBe(0);
  const first = (await readLock(projectDir)).cards[0].hookConsent;
  await new Promise((resolve) => setTimeout(resolve, 2));
  expect((await runAgentsCli(["card", "trust", "@me/policy", "--hooks"], envFor(fixture), projectDir)).exitCode).toBe(0);
  const second = (await readLock(projectDir)).cards[0].hookConsent;

  expect(first.consentedRange).toBe("^1.0.0");
  expect(second.consentedRange).toBe("^1.0.0");
  expect(second.consentedAt >= first.consentedAt).toBe(true);
});

test("card untrust --hooks clears hook consent", async () => {
  const { fixture, projectDir } = await setupProjectWithHookCard();
  expect((await runAgentsCli(["card", "trust", "@me/policy", "--hooks"], envFor(fixture), projectDir)).exitCode).toBe(0);

  const result = await runAgentsCli(["card", "untrust", "@me/policy", "--hooks"], envFor(fixture), projectDir);

  expect(result.exitCode).toBe(0);
  expect((await readLock(projectDir)).cards[0].hookConsent).toBeUndefined();
});

test("card update drops hook consent when the locked version exits the consent range", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  expect((await runAgentsCli(["card", "new", "@me/policy", "--no-git"], envFor(fixture))).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "source", "add-hook", "@me/policy", "guard"], envFor(fixture))).exitCode).toBe(0);
  const sourceDir = join(fixture.agentsDir, "drwn", "sources", "@me", "policy");
  expect((await runAgentsCli(["card", "publish", "@me/policy"], envFor(fixture))).exitCode).toBe(0);
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
  await writeFile(
    join(projectDir, ".agents", "drwn", "config.json"),
    JSON.stringify({ version: 1, cards: ["@me/policy@>=1.0.0"] }, null, 2),
  );
  expect((await runAgentsCli(["card", "update"], envFor(fixture), projectDir)).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "trust", "@me/policy", "--hooks", "--range", "^1.0.0"], envFor(fixture), projectDir)).exitCode).toBe(0);
  const manifestPath = join(sourceDir, "card.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.version = "2.0.0";
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  expect((await runAgentsCli(["card", "publish", "@me/policy"], envFor(fixture))).exitCode).toBe(0);

  const result = await runAgentsCli(["card", "update"], envFor(fixture), projectDir);

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("hook consent dropped");
  const lock = await readLock(projectDir);
  expect(lock.cards[0].version).toBe("2.0.0");
  expect(lock.cards[0].hookConsent).toBeUndefined();
});

test("card update carries hook consent while locked version remains in range", async () => {
  const { fixture, projectDir } = await setupProjectWithHookCard();
  expect((await runAgentsCli(["card", "trust", "@me/policy", "--hooks", "--range", "^1.0.0"], envFor(fixture), projectDir)).exitCode).toBe(0);

  const result = await runAgentsCli(["card", "update"], envFor(fixture), projectDir);

  expect(result.exitCode).toBe(0);
  expect((await readLock(projectDir)).cards[0].hookConsent?.consentedRange).toBe("^1.0.0");
});

test("card outdated notes when hook consent will need re-granting", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  expect((await runAgentsCli(["card", "new", "@me/policy", "--no-git"], envFor(fixture))).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "source", "add-hook", "@me/policy", "guard"], envFor(fixture))).exitCode).toBe(0);
  const sourceDir = join(fixture.agentsDir, "drwn", "sources", "@me", "policy");
  expect((await runAgentsCli(["card", "publish", "@me/policy"], envFor(fixture))).exitCode).toBe(0);
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
  await writeFile(
    join(projectDir, ".agents", "drwn", "config.json"),
    JSON.stringify({ version: 1, cards: ["@me/policy@>=1.0.0"] }, null, 2),
  );
  expect((await runAgentsCli(["card", "update"], envFor(fixture), projectDir)).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "trust", "@me/policy", "--hooks", "--range", "^1.0.0"], envFor(fixture), projectDir)).exitCode).toBe(0);
  const manifestPath = join(sourceDir, "card.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.version = "2.0.0";
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  expect((await runAgentsCli(["card", "publish", "@me/policy"], envFor(fixture))).exitCode).toBe(0);

  const human = await runAgentsCli(["card", "outdated"], envFor(fixture), projectDir);
  const json = await runAgentsCli(["card", "outdated", "--json"], envFor(fixture), projectDir);

  expect(human.stdout).toContain("hook consent will require re-grant");
  expect(JSON.parse(json.stdout).outdated[0].hookConsentRequiresRegrant).toBe(true);
});

test("card audit prints deferred feature stub", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  const result = await runAgentsCli(["card", "audit"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("v1.1 feature");
});

test("card trust reports an error when the card is not locked", async () => {
  const { fixture, projectDir } = await setupProjectWithHookCard();

  const result = await runAgentsCli(["card", "trust", "@me/missing", "--hooks"], envFor(fixture), projectDir);

  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain("Card is not in project lockfile");
});
