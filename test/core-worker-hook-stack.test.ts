// ABOUTME: Verifies active-stack hook projection uses one matcher entry.
// ABOUTME: Protects Task 54 owned-hook identity and Task 55 signal coexistence.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function publishHookCard(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>, name: string, hook: string) {
  expect((await runAgentsCli(["card", "new", name, "--no-git"], envFor(fixture))).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "source", "add-hook", name, hook], envFor(fixture))).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "publish", name], envFor(fixture))).exitCode).toBe(0);
}

async function publishBlueprint(
  fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>,
  name: string,
  members: string[],
) {
  expect((await runAgentsCli(["card", "new", name, "--no-git"], envFor(fixture))).exitCode).toBe(0);
  const [, scope, cardName] = name.match(/^(@[^/]+)\/(.+)$/)!;
  const manifestPath = join(fixture.agentsDir, "drwn", "sources", scope!, cardName!, "card.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.kind = "blueprint";
  manifest.composedFrom = members;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  expect((await runAgentsCli(["card", "publish", name], envFor(fixture))).exitCode).toBe(0);
}

test("one Blueprint Worker composes member hooks and preserves signals", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishHookCard(fixture, "@me/base", "guard");
  await publishHookCard(fixture, "@me/overlay", "audit");
  await publishBlueprint(fixture, "@me/worker", ["@me/base@1.0.0", "@me/overlay@1.0.0"]);
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
  await writeFile(
    join(projectDir, ".agents", "drwn", "config.json"),
    JSON.stringify(
      {
        version: 2,
        hooks: { signals: { enabled: true } },
      },
      null,
      2,
    ),
  );
  expect((await runAgentsCli(["card", "apply", "@me/worker@1.0.0"], envFor(fixture), projectDir)).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "trust", "@me/base", "--hooks"], envFor(fixture), projectDir)).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "trust", "@me/overlay", "--hooks"], envFor(fixture), projectDir)).exitCode).toBe(0);

  const write = await runAgentsCli(["write", "--target", "claude"], envFor(fixture), projectDir);
  const settings = JSON.parse(await readFile(join(projectDir, ".claude", "settings.json"), "utf8"));

  expect(write.exitCode).toBe(0);
  expect(existsSync(join(projectDir, ".agents", "drwn", "generated", "workers", "@me", "base", "hooks", "claude", "composer.mjs"))).toBe(true);
  expect(existsSync(join(projectDir, ".agents", "drwn", "generated", "workers", "@me", "overlay", "hooks", "claude", "composer.mjs"))).toBe(true);
  const preToolMatchers = settings.hooks.PreToolUse.map((entry: { matcher?: string }) => entry.matcher);
  expect(preToolMatchers.filter((matcher: string | undefined) => matcher === ".*")).toHaveLength(1);
  expect(preToolMatchers).toContain("Skill");
  expect(settings._drwn.ownedHooks.PreToolUse["m:.*"]).toStartWith("sha256-");
  expect(settings._drwn.ownedHooks.PreToolUse["m:Skill"]).toStartWith("sha256-");
});

test("clearing the active stack drops the card composer entry while signal hooks survive", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishHookCard(fixture, "@me/base", "guard");
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
  await writeFile(
    join(projectDir, ".agents", "drwn", "config.json"),
    JSON.stringify(
      {
        version: 2,
        hooks: { signals: { enabled: true } },
      },
      null,
      2,
    ),
  );
  expect((await runAgentsCli(["card", "apply", "@me/base@1.0.0"], envFor(fixture), projectDir)).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "trust", "@me/base", "--hooks"], envFor(fixture), projectDir)).exitCode).toBe(0);

  // Active stack: both the card composer (.*) and the signal (Skill) entries are owned.
  expect((await runAgentsCli(["write", "--target", "claude"], envFor(fixture), projectDir)).exitCode).toBe(0);
  const active = JSON.parse(await readFile(join(projectDir, ".claude", "settings.json"), "utf8"));
  expect(active.hooks.PreToolUse.filter((entry: { matcher?: string }) => entry.matcher === ".*")).toHaveLength(1);
  expect(active._drwn.ownedHooks.PreToolUse["m:.*"]).toStartWith("sha256-");
  expect(active._drwn.ownedHooks.PreToolUse["m:Skill"]).toStartWith("sha256-");

  // Deactivate the stack and re-project: the card composer entry is dropped, signals remain.
  expect((await runAgentsCli(["worker", "stack", "clear"], envFor(fixture), projectDir)).exitCode).toBe(0);
  expect((await runAgentsCli(["write", "--target", "claude"], envFor(fixture), projectDir)).exitCode).toBe(0);
  const cleared = JSON.parse(await readFile(join(projectDir, ".claude", "settings.json"), "utf8"));
  expect(cleared.hooks.PreToolUse.some((entry: { matcher?: string }) => entry.matcher === ".*")).toBe(false);
  expect(cleared.hooks.PreToolUse.some((entry: { matcher?: string }) => entry.matcher === "Skill")).toBe(true);
  expect(cleared._drwn.ownedHooks.PreToolUse["m:.*"]).toBeUndefined();
  expect(cleared._drwn.ownedHooks.PreToolUse["m:Skill"]).toStartWith("sha256-");
});
