// ABOUTME: Verifies the `drwn card catalog publish` command surface.
// ABOUTME: Covers parsing, JSON/human output, duplicate errors, and direct catalog discovery.

import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as git from "../cli/core/git";
import { cleanupTempRoots, envFor, publishCardWithSkills, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("card catalog publish --dry-run --json plans a local catalog entry without writing", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const cardRemote = await publishPushableCard(fixture);
  const catalogDir = await createCatalogDir({ scope: "@team" });

  const result = await runAgentsCli(
    [
      "card",
      "catalog",
      "publish",
      "@team/backend@1.0.0",
      "--catalog",
      catalogDir,
      "--mode",
      "local",
      "--tag",
      "server",
      "--tag",
      "node",
      "--dry-run",
      "--json",
    ],
    envFor(fixture),
  );

  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout);
  expect(parsed).toMatchObject({
    ok: true,
    mode: "local",
    action: "add",
    changed: true,
    entry: {
      name: "backend",
      url: `git+${cardRemote.url}#v1.0.0`,
      tags: ["node", "server"],
    },
  });
  expect((await readCatalog(catalogDir)).cards).toEqual([]);
});

test("card catalog publish writes local catalog entries with human output", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const cardRemote = await publishPushableCard(fixture);
  const catalogDir = await createCatalogDir({ scope: "@team" });

  const result = await runAgentsCli(
    [
      "card",
      "catalog",
      "publish",
      "@team/backend@1.0.0",
      "--catalog",
      catalogDir,
      "--mode",
      "local",
      "--description",
      "Backend card",
    ],
    envFor(fixture),
  );

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Added backend to @team catalog");
  expect(result.stdout).toContain("drwn search card backend --scope @team");
  expect((await readCatalog(catalogDir)).cards).toEqual([
    {
      name: "backend",
      url: `git+${cardRemote.url}#v1.0.0`,
      description: "Backend card",
    },
  ]);
});

test("card catalog publish reports duplicate catalog entries as structured JSON errors", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishPushableCard(fixture);
  const catalogDir = await createCatalogDir({
    scope: "@team",
    cards: [{ name: "backend", url: "git+file:///tmp/backend.git#v0.9.0" }],
  });

  const result = await runAgentsCli(
    [
      "card",
      "catalog",
      "publish",
      "@team/backend@1.0.0",
      "--catalog",
      catalogDir,
      "--mode",
      "local",
      "--json",
    ],
    envFor(fixture),
  );

  expect(result.exitCode).toBe(1);
  const parsed = JSON.parse(result.stderr);
  expect(parsed).toMatchObject({
    ok: false,
    error: { code: "CATALOG_DUPLICATE_CARD" },
  });
});

test("card catalog publish --mode direct updates a registered scope and makes search discover it", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishPushableCard(fixture);
  const catalog = await createCatalogRemote({ scope: "@team" });
  expect((await runAgentsCli(["library", "catalog", "add", catalog.url], envFor(fixture))).exitCode).toBe(0);

  const published = await runAgentsCli(
    [
      "card",
      "catalog",
      "publish",
      "@team/backend@1.0.0",
      "--catalog",
      "@team",
      "--mode",
      "direct",
      "--json",
    ],
    envFor(fixture),
  );
  expect(published.exitCode).toBe(0);
  const payload = JSON.parse(published.stdout);
  expect(payload.commit).toMatch(/^[a-f0-9]{40}$/);

  const searched = await runAgentsCli(["search", "card", "backend", "--scope", "@team", "--json"], envFor(fixture));
  expect(searched.exitCode).toBe(0);
  expect(JSON.parse(searched.stdout).results).toEqual([
    expect.objectContaining({
      name: "backend",
      scope: "@team",
    }),
  ]);
});

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

async function createCatalogDir(options: {
  scope: string;
  cards?: Array<{ name: string; url: string; description?: string; tags?: string[] }>;
}) {
  const dir = await mkdtemp(join(tmpdir(), "drwn-catalog-src-"));
  tempRoots.push(dir);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "catalog.json"),
    JSON.stringify(
      {
        catalogVersion: 1,
        scope: options.scope,
        description: `Test ${options.scope} catalog`,
        cards: options.cards ?? [],
      },
      null,
      2,
    ) + "\n",
  );
  return dir;
}

async function createCatalogRemote(options: {
  scope: string;
  cards?: Array<{ name: string; url: string; description?: string; tags?: string[] }>;
}) {
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
        description: `Test ${options.scope} catalog`,
        cards: options.cards ?? [],
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

async function readCatalog(dir: string) {
  return JSON.parse(await readFile(join(dir, "catalog.json"), "utf8"));
}
