// ABOUTME: Verifies card show/status surfaces hook policies and consent state.
// ABOUTME: Protects user-facing diagnostics for hook-enabled cards.

import { afterEach, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function publishHookCard() {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  expect((await runAgentsCli(["card", "new", "@me/policy", "--no-git"], envFor(fixture))).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "source", "add-hook", "@me/policy", "guard"], envFor(fixture))).exitCode).toBe(0);
  const sourceDir = join(fixture.agentsDir, "drwn", "sources", "@me", "policy");
  await writeFile(join(sourceDir, "hooks", "guard", "policy.ts"), `
    import { defineToolPolicy } from "darwinian-minds/hook-policy";
    export default defineToolPolicy({
      policyKind: "enforcement",
      beforeToolCall() { return { action: "allow" }; },
    });
  `);
  await writeFile(join(sourceDir, "hooks", "guard", "README.md"), "# Guard shell commands\n\nDetails.\n");
  expect((await runAgentsCli(["card", "publish", "@me/policy"], envFor(fixture))).exitCode).toBe(0);
  const manifest = JSON.parse(await readFile(join(sourceDir, "card.json"), "utf8"));
  return { fixture, manifest };
}

async function setupProjectWithHookCard() {
  const { fixture, manifest } = await publishHookCard();
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
  await writeFile(join(projectDir, ".agents", "drwn", "config.json"), JSON.stringify({ version: 1, cards: [] }, null, 2));
  expect((await runAgentsCli(["card", "add", `@me/policy@${manifest.version}`], envFor(fixture), projectDir)).exitCode).toBe(0);
  return { fixture, projectDir };
}

test("card show surfaces hook policy summaries", async () => {
  const { fixture, manifest } = await publishHookCard();

  const human = await runAgentsCli(["card", "show", `@me/policy@${manifest.version}`], envFor(fixture));
  const json = await runAgentsCli(["card", "show", `@me/policy@${manifest.version}`, "--json"], envFor(fixture));

  expect(human.exitCode).toBe(0);
  expect(human.stdout).toContain("guard (enforcement) - Guard shell commands");
  expect(JSON.parse(json.stdout).hookPolicies).toEqual([
    { name: "guard", policyKind: "enforcement", summary: "Guard shell commands" },
  ]);
});

test("card status surfaces hook consent state", async () => {
  const { fixture, projectDir } = await setupProjectWithHookCard();

  const absent = await runAgentsCli(["card", "status"], envFor(fixture), projectDir);
  expect(absent.stdout).toContain("hook-consent: absent");

  expect((await runAgentsCli(["card", "trust", "@me/policy", "--hooks"], envFor(fixture), projectDir)).exitCode).toBe(0);
  const granted = await runAgentsCli(["card", "status"], envFor(fixture), projectDir);
  expect(granted.stdout).toContain("hook-consent: granted (^1.0.0)");

  expect((await runAgentsCli(["card", "trust", "@me/policy", "--hooks", "--range", "^0.1.0"], envFor(fixture), projectDir)).exitCode).toBe(0);
  const outOfRange = await runAgentsCli(["card", "status"], envFor(fixture), projectDir);
  const json = await runAgentsCli(["card", "status", "--json"], envFor(fixture), projectDir);
  expect(outOfRange.stdout).toContain("hook-consent: out-of-range (consented: ^0.1.0, locked: 1.0.0)");
  expect(JSON.parse(json.stdout).locked[0].hookConsent).toEqual(
    expect.objectContaining({ consentedRange: "^0.1.0" }),
  );
});
