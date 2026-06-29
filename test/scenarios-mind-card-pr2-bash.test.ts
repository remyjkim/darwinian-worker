// ABOUTME: Runs a Bash workflow for per-mind materialization and activation.
// ABOUTME: Exercises shell-facing PR2 contracts through the public CLI.

import { afterEach, expect, test as baseTest } from "bun:test";
const test = baseTest.skipIf(process.platform === "win32");
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("bash CLI materializes minds, activates a stack, and projects only active cards", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishMind(fixture, "@team/base", "alpha");
  await publishMind(fixture, "@team/overlay", "beta");
  const projectDir = join(fixture.root, "project");
  const configPath = join(projectDir, ".agents", "drwn", "config.json");
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify({ version: 1, cards: ["@team/base@1.0.0", "@team/overlay@1.0.0"] }, null, 2));

  const result = await runBash(
    `
set -euo pipefail
cd "$PROJECT_DIR"
"$BUN_BIN" run "$DRWN_ENTRYPOINT" write --json > "$WRITE_ONE"
test -f .agents/drwn/generated/minds.json
test -d .agents/drwn/generated/minds/@team/base
test -d .agents/drwn/generated/minds/@team/overlay
test -d .agents/drwn/generated/mind
test -d .claude/skills/alpha
test -d .claude/skills/beta
"$BUN_BIN" run "$DRWN_ENTRYPOINT" mind clear --json > "$CLEAR_ONE"
"$BUN_BIN" run "$DRWN_ENTRYPOINT" write --json > "$WRITE_CLEAR"
test ! -e .claude/skills/alpha
test ! -e .claude/skills/beta
test ! -e .agents/drwn/generated/mind
"$BUN_BIN" run "$DRWN_ENTRYPOINT" mind use @team/base --json > "$USE_ONE"
"$BUN_BIN" run "$DRWN_ENTRYPOINT" write --json > "$WRITE_TWO"
test -d .claude/skills/alpha
test ! -e .claude/skills/beta
"$BUN_BIN" run "$DRWN_ENTRYPOINT" mind use @team/base @team/overlay --json > "$USE_TWO"
"$BUN_BIN" run "$DRWN_ENTRYPOINT" write --json > "$WRITE_THREE"
test -d .claude/skills/alpha
test -d .claude/skills/beta
node <<'NODE'
const fs = require('fs');
const listed = JSON.parse(fs.readFileSync(process.env.USE_TWO, 'utf8'));
if (listed.activeMinds.join(',') !== '@team/base,@team/overlay') throw new Error('bad active stack');
NODE
`,
    {
      ...envFor(fixture),
      PROJECT_DIR: projectDir,
      WRITE_ONE: join(fixture.root, "write-one.json"),
      WRITE_CLEAR: join(fixture.root, "write-clear.json"),
      WRITE_TWO: join(fixture.root, "write-two.json"),
      WRITE_THREE: join(fixture.root, "write-three.json"),
      CLEAR_ONE: join(fixture.root, "clear-one.json"),
      USE_ONE: join(fixture.root, "use-one.json"),
      USE_TWO: join(fixture.root, "use-two.json"),
    },
  );

  expect(result.exitCode).toBe(0);
});

async function publishMind(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>, name: string, skill: string) {
  expect((await runAgentsCli(["card", "new", name, "--no-git"], envFor(fixture))).exitCode).toBe(0);
  const [, scope, cardName] = name.match(/^(@[^/]+)\/(.+)$/) ?? [];
  const sourceDir = join(fixture.agentsDir, "drwn", "sources", scope!, cardName!);
  const manifest = JSON.parse(await Bun.file(join(sourceDir, "card.json")).text());
  manifest.skills = { include: [skill] };
  await writeFile(join(sourceDir, "card.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await mkdir(join(sourceDir, "skills", skill), { recursive: true });
  await writeFile(join(sourceDir, "skills", skill, "SKILL.md"), `---\nname: ${skill}\ndescription: ${skill}\n---\n`);
  expect((await runAgentsCli(["card", "publish", name], envFor(fixture))).exitCode).toBe(0);
}

async function runBash(script: string, env: Record<string, string>) {
  const proc = Bun.spawn(["bash", "-lc", script], {
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      ...env,
      BUN_BIN: process.execPath,
      DRWN_ENTRYPOINT: new URL("../cli/index.ts", import.meta.url).pathname,
    },
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`bash workflow failed\nstdout:\n${stdout}\nstderr:\n${stderr}`);
  }
  return { stdout, stderr, exitCode: exitCode ?? -1 };
}
