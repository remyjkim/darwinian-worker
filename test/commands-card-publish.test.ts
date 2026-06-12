// ABOUTME: Verifies card publish command guardrails and override wiring.
// ABOUTME: Exercises publish behavior through the CLI rather than core helpers alone.

import { afterEach, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { bumpOverrideConfigKey } from "../cli/core/card-publish-guardrail";
import { resolveCardBareRepoPath } from "../cli/core/store-paths";
import * as git from "../cli/core/git";
import { cleanupTempRoots, envFor, publishCardWithSkills, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function updateCardSource(
  fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>,
  options: { version: string; skills: string[] },
) {
  const sourceRoot = join(fixture.agentsDir, "drwn", "sources", "@me", "backend");
  const manifestPath = join(sourceRoot, "card.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.version = options.version;
  manifest.skills = { include: options.skills };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  for (const skill of options.skills) {
    const skillDir = join(sourceRoot, "skills", skill);
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), `---\nname: ${skill}\ndescription: ${skill}\n---\n`);
  }
}

test("card publish rejects structural major change declared as patch", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/backend", version: "1.0.0", skills: ["alpha"] });
  await updateCardSource(fixture, { version: "1.0.1", skills: [] });

  const result = await runAgentsCli(["card", "publish", "@me/backend"], envFor(fixture));

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("structural changes classify as major");
  expect(result.stderr).toContain("--force-bump-mismatch");
});

test("card publish override succeeds and records an audit marker", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/backend", version: "1.0.0", skills: ["alpha"] });
  await updateCardSource(fixture, { version: "1.0.1", skills: [] });

  const result = await runAgentsCli(["card", "publish", "@me/backend", "--force-bump-mismatch"], envFor(fixture));

  expect(result.exitCode).toBe(0);
  expect(result.stderr).toContain("--force-bump-mismatch used");
  const marker = await git.configGet(resolveCardBareRepoPath(fixture.agentsDir, "@me/backend"), bumpOverrideConfigKey("1.0.1"));
  expect(marker).toBe("major");
});
