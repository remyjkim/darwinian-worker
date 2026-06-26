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

test("active mind hooks project as one stack composer and preserve signals", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishHookCard(fixture, "@me/base", "guard");
  await publishHookCard(fixture, "@me/overlay", "audit");
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
  await writeFile(
    join(projectDir, ".agents", "drwn", "config.json"),
    JSON.stringify(
      {
        version: 1,
        cards: ["@me/base@1.0.0", "@me/overlay@1.0.0"],
        activeMinds: ["@me/base", "@me/overlay"],
        hooks: { signals: { enabled: true } },
      },
      null,
      2,
    ),
  );
  expect((await runAgentsCli(["card", "apply", "@me/base@1.0.0", "@me/overlay@1.0.0"], envFor(fixture), projectDir)).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "trust", "@me/base", "--hooks"], envFor(fixture), projectDir)).exitCode).toBe(0);
  expect((await runAgentsCli(["card", "trust", "@me/overlay", "--hooks"], envFor(fixture), projectDir)).exitCode).toBe(0);

  const write = await runAgentsCli(["write", "--target", "claude"], envFor(fixture), projectDir);
  const settings = JSON.parse(await readFile(join(projectDir, ".claude", "settings.json"), "utf8"));

  expect(write.exitCode).toBe(0);
  expect(existsSync(join(projectDir, ".agents", "drwn", "generated", "minds", "@me", "base", "hooks", "claude", "composer.mjs"))).toBe(true);
  expect(existsSync(join(projectDir, ".agents", "drwn", "generated", "minds", "@me", "overlay", "hooks", "claude", "composer.mjs"))).toBe(true);
  const preToolMatchers = settings.hooks.PreToolUse.map((entry: { matcher?: string }) => entry.matcher);
  expect(preToolMatchers.filter((matcher: string | undefined) => matcher === ".*")).toHaveLength(1);
  expect(preToolMatchers).toContain("Skill");
  expect(settings._drwn.ownedHooks.PreToolUse["m:.*"]).toStartWith("sha256-");
  expect(settings._drwn.ownedHooks.PreToolUse["m:Skill"]).toStartWith("sha256-");
});
