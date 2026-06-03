// ABOUTME: Verifies card catalog registration, refresh, and card search.
// ABOUTME: Uses local Git catalog repos so discovery tests do not need network access.

import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture } from "./helpers";
import {
  commitTree,
  createAnnotatedTag,
  initBare,
  revParse,
  updateRef,
  writeTreeFromDir,
} from "../cli/core/git";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function createCatalogRepo({
  scope = "@team",
  cards = [
    {
      name: "backend",
      url: "file:///tmp/backend.git",
      description: "Backend baseline card",
      tags: ["server", "node"],
    },
  ],
}: {
  scope?: string;
  cards?: Array<{ name: string; url: string; description?: string; tags?: string[] }>;
} = {}) {
  const tempDir = await mkdtemp(join(tmpdir(), "drwn-catalog-"));
  const sourceDir = join(tempDir, "source");
  const bareRepoPath = join(tempDir, "catalog.git");
  await mkdir(sourceDir, { recursive: true });
  await writeManifest(sourceDir, scope, cards);
  await initBare(bareRepoPath);
  const tree = await writeTreeFromDir(bareRepoPath, sourceDir);
  const commit = await commitTree(bareRepoPath, tree, null, "Publish catalog");
  await updateRef(bareRepoPath, "refs/heads/main", commit);
  await createAnnotatedTag(bareRepoPath, "v1", commit, "v1");
  return {
    tempDir,
    sourceDir,
    bareRepoPath,
    url: `file://${bareRepoPath}`,
    addCards: async (newCards: Array<{ name: string; url: string; description?: string; tags?: string[] }>) => {
      const all = [...cards, ...newCards];
      await writeManifest(sourceDir, scope, all);
      const newTree = await writeTreeFromDir(bareRepoPath, sourceDir);
      const newCommit = await commitTree(bareRepoPath, newTree, commit, "Add cards");
      await updateRef(bareRepoPath, "refs/heads/main", newCommit);
    },
  };
}

async function writeManifest(
  sourceDir: string,
  scope: string,
  cards: Array<{ name: string; url: string; description?: string; tags?: string[] }>,
) {
  await writeFile(
    join(sourceDir, "catalog.json"),
    `${JSON.stringify(
      {
        catalogVersion: 1,
        scope,
        description: `Test ${scope} catalog`,
        cards,
      },
      null,
      2,
    )}\n`,
  );
}

test("library catalog add registers a catalog by URL and discovers its scope", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const catalog = await createCatalogRepo();
  tempRoots.push(catalog.tempDir);

  const added = await runAgentsCli(
    ["library", "catalog", "add", catalog.url],
    envFor(fixture),
  );
  expect(added.exitCode).toBe(0);
  expect(added.stdout).toContain("@team");

  const listed = await runAgentsCli(
    ["library", "catalog", "list", "--json"],
    envFor(fixture),
  );
  const index = JSON.parse(listed.stdout);
  expect(index.catalogsVersion).toBe(1);
  expect(index.catalogs).toHaveLength(1);
  expect(index.catalogs[0].scope).toBe("@team");
  expect(index.catalogs[0].url).toBe(catalog.url);
  expect(index.catalogs[0].cardCount).toBe(1);
});

test("library catalog list returns an empty index when no catalogs are registered", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  const result = await runAgentsCli(
    ["library", "catalog", "list", "--json"],
    envFor(fixture),
  );

  expect(result.exitCode).toBe(0);
  const index = JSON.parse(result.stdout);
  expect(index.catalogsVersion).toBe(1);
  expect(index.catalogs).toEqual([]);
});

test("library catalog remove accepts a scope identifier", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const catalog = await createCatalogRepo();
  tempRoots.push(catalog.tempDir);

  await runAgentsCli(["library", "catalog", "add", catalog.url], envFor(fixture));
  const removed = await runAgentsCli(
    ["library", "catalog", "remove", "@team"],
    envFor(fixture),
  );

  expect(removed.exitCode).toBe(0);
  const listed = await runAgentsCli(
    ["library", "catalog", "list", "--json"],
    envFor(fixture),
  );
  expect(JSON.parse(listed.stdout).catalogs).toEqual([]);
});

test("library catalog remove also accepts the URL", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const catalog = await createCatalogRepo();
  tempRoots.push(catalog.tempDir);

  await runAgentsCli(["library", "catalog", "add", catalog.url], envFor(fixture));
  const removed = await runAgentsCli(
    ["library", "catalog", "remove", catalog.url],
    envFor(fixture),
  );

  expect(removed.exitCode).toBe(0);
});

test("library catalog add refuses duplicate scope from different URLs", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const catalogA = await createCatalogRepo();
  const catalogB = await createCatalogRepo();
  tempRoots.push(catalogA.tempDir, catalogB.tempDir);

  await runAgentsCli(["library", "catalog", "add", catalogA.url], envFor(fixture));
  const collisionResult = await runAgentsCli(
    ["library", "catalog", "add", catalogB.url],
    envFor(fixture),
  );

  expect(collisionResult.exitCode).not.toBe(0);
  const collisionMessage = (collisionResult.stderr + collisionResult.stdout).toLowerCase();
  expect(collisionMessage).toContain("scope");
});

test("library catalog refresh updates the cached card count after new cards are added upstream", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const catalog = await createCatalogRepo();
  tempRoots.push(catalog.tempDir);

  await runAgentsCli(["library", "catalog", "add", catalog.url], envFor(fixture));
  const before = JSON.parse(
    (
      await runAgentsCli(
        ["library", "catalog", "list", "--json"],
        envFor(fixture),
      )
    ).stdout,
  );
  expect(before.catalogs[0].cardCount).toBe(1);

  await catalog.addCards([
    {
      name: "observability",
      url: "file:///tmp/observability.git",
      description: "Observability card",
    },
  ]);

  const refreshed = await runAgentsCli(
    ["library", "catalog", "refresh"],
    envFor(fixture),
  );
  expect(refreshed.exitCode).toBe(0);

  const after = JSON.parse(
    (
      await runAgentsCli(
        ["library", "catalog", "list", "--json"],
        envFor(fixture),
      )
    ).stdout,
  );
  expect(after.catalogs[0].cardCount).toBe(2);
});

test("search card finds cards from a registered catalog", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const catalog = await createCatalogRepo();
  tempRoots.push(catalog.tempDir);

  await runAgentsCli(["library", "catalog", "add", catalog.url], envFor(fixture));
  const result = await runAgentsCli(
    ["search", "card", "backend", "--json"],
    envFor(fixture),
  );

  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout);
  expect(parsed.results).toHaveLength(1);
  expect(parsed.results[0]).toMatchObject({
    name: "backend",
    scope: "@team",
    url: "file:///tmp/backend.git",
    description: "Backend baseline card",
  });
});

test("search card --scope filters by catalog scope", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const teamCatalog = await createCatalogRepo({
    scope: "@team",
    cards: [{ name: "backend", url: "file:///tmp/backend.git" }],
  });
  const personalCatalog = await createCatalogRepo({
    scope: "@me",
    cards: [{ name: "backend", url: "file:///tmp/me-backend.git" }],
  });
  tempRoots.push(teamCatalog.tempDir, personalCatalog.tempDir);

  await runAgentsCli(["library", "catalog", "add", teamCatalog.url], envFor(fixture));
  await runAgentsCli(["library", "catalog", "add", personalCatalog.url], envFor(fixture));

  const filtered = await runAgentsCli(
    ["search", "card", "backend", "--scope", "@team", "--json"],
    envFor(fixture),
  );

  expect(filtered.exitCode).toBe(0);
  const parsed = JSON.parse(filtered.stdout);
  expect(parsed.results).toHaveLength(1);
  expect(parsed.results[0].scope).toBe("@team");
});

test("DRWN_STORE_READONLY refuses library catalog add", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const catalog = await createCatalogRepo();
  tempRoots.push(catalog.tempDir);

  const env = { ...envFor(fixture), DRWN_STORE_READONLY: "1" };
  const result = await runAgentsCli(["library", "catalog", "add", catalog.url], env);

  expect(result.exitCode).not.toBe(0);
  const errorMessage = (result.stderr + result.stdout).toLowerCase();
  expect(errorMessage).toContain("read-only");
});

test("init --no-default-catalogs skips default catalog pre-registration", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  // Run init in a fresh project dir
  const projectDir = await mkdtemp(join(tmpdir(), "drwn-init-"));
  tempRoots.push(projectDir);
  const env = { ...envFor(fixture), PWD: projectDir };

  const result = await runAgentsCli(
    ["init", "--non-interactive", "--no-default-catalogs"],
    env,
    projectDir,
  );

  expect(result.exitCode).toBe(0);
  const listed = await runAgentsCli(
    ["library", "catalog", "list", "--json"],
    envFor(fixture),
  );
  expect(JSON.parse(listed.stdout).catalogs).toEqual([]);
});
