// ABOUTME: Runs real Bash workflows around `drwn card catalog publish`.
// ABOUTME: Exercises shell-facing JSON contracts, Git pushes, and read-only catalog-cache behavior.

import { afterEach, expect, test as baseTest } from "bun:test";
const test = baseTest.skipIf(process.platform === "win32");
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as git from "../cli/core/git";
import { cleanupTempRoots, envFor, publishCardWithSkills, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("bash dry-run validates a local catalog publish without writing catalog.json", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const cardRemote = await publishPushableCard(fixture);
  const catalogDir = await createCatalogDir({ scope: "@team" });
  const outPath = join(fixture.root, "dry-run.json");

  const result = await runBash(
    `
set -euo pipefail
"$BUN_BIN" run "$DRWN_ENTRYPOINT" card catalog publish @team/backend@1.0.0 --catalog "$CATALOG_DIR" --mode local --tag server --dry-run --json > "$OUT_PATH"
node <<'NODE'
const fs = require('fs');
const payload = JSON.parse(fs.readFileSync(process.env.OUT_PATH, 'utf8'));
if (!payload.ok || payload.action !== 'add' || payload.entry.url !== process.env.EXPECTED_URL) {
  throw new Error('unexpected publish payload: ' + JSON.stringify(payload));
}
const catalog = JSON.parse(fs.readFileSync(process.env.CATALOG_DIR + '/catalog.json', 'utf8'));
if (catalog.cards.length !== 0) {
  throw new Error('dry-run wrote catalog.json');
}
NODE
`,
    {
      ...envFor(fixture),
      CATALOG_DIR: catalogDir,
      OUT_PATH: outPath,
      EXPECTED_URL: `git+${cardRemote.url}#v1.0.0`,
    },
  );

  expect(result.exitCode).toBe(0);
});

test("bash direct publish still pushes when read-only store skips local catalog refresh", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishPushableCard(fixture);
  const catalog = await createCatalogRemote({ scope: "@team" });
  expect((await runAgentsCli(["library", "catalog", "add", catalog.url], envFor(fixture))).exitCode).toBe(0);
  const outPath = join(fixture.root, "direct.json");
  const searchPath = join(fixture.root, "search.json");

  const result = await runBash(
    `
set -euo pipefail
DRWN_STORE_READONLY=1 "$BUN_BIN" run "$DRWN_ENTRYPOINT" card catalog publish @team/backend@1.0.0 --catalog @team --mode direct --json > "$OUT_PATH"
node <<'NODE'
const fs = require('fs');
const payload = JSON.parse(fs.readFileSync(process.env.OUT_PATH, 'utf8'));
if (!payload.ok || !/^[a-f0-9]{40}$/.test(payload.commit || '')) {
  throw new Error('direct publish did not return a commit: ' + JSON.stringify(payload));
}
if (!payload.warnings.some((warning) => warning.includes('read-only'))) {
  throw new Error('read-only refresh warning missing: ' + JSON.stringify(payload.warnings));
}
NODE
"$BUN_BIN" run "$DRWN_ENTRYPOINT" library catalog refresh @team
"$BUN_BIN" run "$DRWN_ENTRYPOINT" search card backend --scope @team --json > "$SEARCH_PATH"
node <<'NODE'
const fs = require('fs');
const payload = JSON.parse(fs.readFileSync(process.env.SEARCH_PATH, 'utf8'));
if (payload.results.length !== 1 || payload.results[0].name !== 'backend') {
  throw new Error('search did not discover backend: ' + JSON.stringify(payload));
}
NODE
`,
    {
      ...envFor(fixture),
      OUT_PATH: outPath,
      SEARCH_PATH: searchPath,
    },
  );

  expect(result.exitCode).toBe(0);
});

async function runBash(script: string, env: Record<string, string>) {
  const proc = Bun.spawn(["bash", "-lc", script], {
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      ...env,
      BUN_BIN: (Bun.which("bun") ?? process.execPath),
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

async function publishPushableCard(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  await publishCardWithSkills(fixture, { name: "@team/backend", skills: ["alpha"] });
  const cardRemote = await createEmptyBareRemote("card-remote-");
  const added = await runAgentsCli(["card", "remote", "add", "@team/backend", cardRemote.url], envFor(fixture));
  expect(added.exitCode).toBe(0);
  const pushed = await runAgentsCli(["card", "push", "@team/backend"], envFor(fixture));
  expect(pushed.exitCode).toBe(0);
  return cardRemote;
}

async function createEmptyBareRemote(prefix: string) {
  const tempDir = await mkdtemp(join(tmpdir(), prefix));
  tempRoots.push(tempDir);
  const path = join(tempDir, "remote.git");
  await git.initBare(path);
  return { tempDir, path, url: `file://${path}` };
}

async function createCatalogDir(options: { scope: string }) {
  const dir = await mkdtemp(join(tmpdir(), "drwn-catalog-src-"));
  tempRoots.push(dir);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "catalog.json"),
    JSON.stringify(
      {
        catalogVersion: 1,
        scope: options.scope,
        cards: [],
      },
      null,
      2,
    ) + "\n",
  );
  return dir;
}

async function createCatalogRemote(options: { scope: string }) {
  const tempDir = await mkdtemp(join(tmpdir(), "drwn-catalog-remote-"));
  tempRoots.push(tempDir);
  const sourceDir = join(tempDir, "source");
  const bareRepoPath = join(tempDir, "catalog.git");
  await mkdir(sourceDir, { recursive: true });
  await writeFile(
    join(sourceDir, "catalog.json"),
    JSON.stringify(
      {
        catalogVersion: 1,
        scope: options.scope,
        cards: [],
      },
      null,
      2,
    ) + "\n",
  );
  await git.initBare(bareRepoPath);
  const tree = await git.writeTreeFromDir(bareRepoPath, sourceDir);
  const commit = await git.commitTree(bareRepoPath, tree, null, "Initial catalog");
  await git.updateRef(bareRepoPath, "refs/heads/main", commit);
  await git.runGit(["--git-dir", bareRepoPath, "symbolic-ref", "HEAD", "refs/heads/main"]);
  return { tempDir, sourceDir, bareRepoPath, url: `file://${bareRepoPath}` };
}
