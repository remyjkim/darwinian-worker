// ABOUTME: Verifies upstream card catalog publication core behavior.
// ABOUTME: Protects catalog JSON mutation, URL inference, and main-store side-effect boundaries.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publishCardToCatalog } from "../cli/core/card-catalog-publish";
import * as git from "../cli/core/git";
import { resolveCardBareRepoPath } from "../cli/core/store-paths";
import { cleanupTempRoots, envFor, publishCardWithSkills, runAgentsCli, scaffoldCliFixture } from "./helpers";
import { createLocalCardRepo } from "./fixtures/git-helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

describe("card catalog publish core", () => {
  test("dry-run plans an inferred store-origin catalog entry without writing", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await publishCardWithSkills(fixture, { name: "@team/backend", skills: ["alpha"] });
    const cardRemote = await createEmptyBareRemote("card-remote-");
    await runAgentsCli(["card", "remote", "add", "@team/backend", cardRemote.url], envFor(fixture));
    await runAgentsCli(["card", "push", "@team/backend"], envFor(fixture));
    const catalogDir = await createCatalogDir({ scope: "@team" });

    const result = await publishCardToCatalog({
      agentsDir: fixture.agentsDir,
      cardRef: "@team/backend@1.0.0",
      catalog: catalogDir,
      mode: "local",
      dryRun: true,
      tags: ["server", "server", "node"],
    });

    expect(result.action).toBe("add");
    expect(result.changed).toBe(true);
    expect(result.card.installUrl).toBe(`git+${cardRemote.url}#v1.0.0`);
    expect(result.entry).toMatchObject({
      name: "backend",
      url: `git+${cardRemote.url}#v1.0.0`,
      tags: ["node", "server"],
    });
    expect((await readCatalog(catalogDir)).cards).toEqual([]);
  });

  test("local mode writes sorted cards and preserves catalog metadata", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await publishCardWithSkills(fixture, { name: "@team/backend", skills: ["alpha"] });
    const cardRemote = await createEmptyBareRemote("card-remote-");
    await runAgentsCli(["card", "remote", "add", "@team/backend", cardRemote.url], envFor(fixture));
    await runAgentsCli(["card", "push", "@team/backend"], envFor(fixture));
    const catalogDir = await createCatalogDir({
      scope: "@team",
      cards: [{ name: "zeta", url: "git+file:///tmp/zeta.git#v1.0.0" }],
    });

    const result = await publishCardToCatalog({
      agentsDir: fixture.agentsDir,
      cardRef: "@team/backend@1.0.0",
      catalog: catalogDir,
      mode: "local",
      description: "Backend card",
      tags: ["server", "node"],
    });

    const catalog = await readCatalog(catalogDir);
    expect(result.action).toBe("add");
    expect(catalog.description).toBe("Test @team catalog");
    expect(catalog.cards.map((card: { name: string }) => card.name)).toEqual(["backend", "zeta"]);
    expect(catalog.cards[0]).toEqual({
      name: "backend",
      url: `git+${cardRemote.url}#v1.0.0`,
      description: "Backend card",
      tags: ["node", "server"],
    });
  });

  test("duplicate entries require replace unless payload is identical", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await publishCardWithSkills(fixture, { name: "@team/backend", skills: ["alpha"] });
    const cardRemote = await createEmptyBareRemote("card-remote-");
    await runAgentsCli(["card", "remote", "add", "@team/backend", cardRemote.url], envFor(fixture));
    await runAgentsCli(["card", "push", "@team/backend"], envFor(fixture));
    const catalogDir = await createCatalogDir({
      scope: "@team",
      cards: [{ name: "backend", url: `git+${cardRemote.url}#v0.9.0` }],
    });

    await expect(
      publishCardToCatalog({
        agentsDir: fixture.agentsDir,
        cardRef: "@team/backend@1.0.0",
        catalog: catalogDir,
        mode: "local",
      }),
    ).rejects.toThrow("CATALOG_DUPLICATE_CARD");

    const replaced = await publishCardToCatalog({
      agentsDir: fixture.agentsDir,
      cardRef: "@team/backend@1.0.0",
      catalog: catalogDir,
      mode: "local",
      replace: true,
    });
    expect(replaced.action).toBe("replace");

    const noop = await publishCardToCatalog({
      agentsDir: fixture.agentsDir,
      cardRef: "@team/backend@1.0.0",
      catalog: catalogDir,
      mode: "local",
    });
    expect(noop.action).toBe("noop");
    expect(noop.changed).toBe(false);
  });

  test("invalid catalog manifests fail before mutation", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await publishCardWithSkills(fixture, { name: "@team/backend", skills: ["alpha"] });
    const catalogDir = await mkdtemp(join(tmpdir(), "drwn-invalid-catalog-"));
    tempRoots.push(catalogDir);
    await writeFile(join(catalogDir, "catalog.json"), JSON.stringify({ catalogVersion: 1, scope: "team", cards: [] }, null, 2));

    await expect(
      publishCardToCatalog({
        agentsDir: fixture.agentsDir,
        cardRef: "@team/backend@1.0.0",
        catalog: catalogDir,
        mode: "local",
        url: "git+file:///tmp/backend.git#v1.0.0",
      }),
    ).rejects.toThrow("CATALOG_INVALID_MANIFEST");
  });

  test("git-origin card refs resolve without importing the card into the main store", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const remote = await createLocalCardRepo({ name: "@team/backend", version: "1.0.0" });
    tempRoots.push(remote.tempDir);
    const catalogDir = await createCatalogDir({ scope: "@team" });

    const result = await publishCardToCatalog({
      agentsDir: fixture.agentsDir,
      cardRef: `git+${remote.url}#v1.0.0`,
      catalog: catalogDir,
      mode: "local",
      dryRun: true,
    });

    expect(result.card.name).toBe("@team/backend");
    expect(result.card.installUrl).toBe(`git+${remote.url}#v1.0.0`);
    expect(existsSync(resolveCardBareRepoPath(fixture.agentsDir, "@team/backend"))).toBe(false);
  });

  test("direct mode clones a catalog URL, commits the entry, and pushes main", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await publishCardWithSkills(fixture, { name: "@team/backend", skills: ["alpha"] });
    const cardRemote = await createEmptyBareRemote("card-remote-");
    await runAgentsCli(["card", "remote", "add", "@team/backend", cardRemote.url], envFor(fixture));
    await runAgentsCli(["card", "push", "@team/backend"], envFor(fixture));
    const catalog = await createCatalogRemote({ scope: "@team" });

    const result = await publishCardToCatalog({
      agentsDir: fixture.agentsDir,
      cardRef: "@team/backend@1.0.0",
      catalog: catalog.url,
      mode: "direct",
      description: "Backend card",
    });

    const manifest = await catalog.readRemoteManifest();
    expect(result.action).toBe("add");
    expect(result.changed).toBe(true);
    expect(result.commit).toMatch(/^[a-f0-9]{40}$/);
    expect(manifest.cards).toEqual([
      {
        name: "backend",
        url: `git+${cardRemote.url}#v1.0.0`,
        description: "Backend card",
      },
    ]);
  });

  test("direct mode refuses a dirty local catalog worktree before writing", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await publishCardWithSkills(fixture, { name: "@team/backend", skills: ["alpha"] });
    const cardRemote = await createEmptyBareRemote("card-remote-");
    await runAgentsCli(["card", "remote", "add", "@team/backend", cardRemote.url], envFor(fixture));
    await runAgentsCli(["card", "push", "@team/backend"], envFor(fixture));
    const catalogDir = await createCatalogDir({ scope: "@team" });
    await git.runGit(["init"], { cwd: catalogDir });
    await git.addWorktreePaths(catalogDir, ["catalog.json"]);
    await git.commitWorktree(catalogDir, "Initial catalog");
    await writeFile(join(catalogDir, "notes.txt"), "untracked local note\n");

    await expect(
      publishCardToCatalog({
        agentsDir: fixture.agentsDir,
        cardRef: "@team/backend@1.0.0",
        catalog: catalogDir,
        mode: "direct",
      }),
    ).rejects.toThrow("CATALOG_WORKTREE_DIRTY");

    expect((await readCatalog(catalogDir)).cards).toEqual([]);
  });

  test("direct mode resolves registered catalog scopes", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await publishCardWithSkills(fixture, { name: "@team/backend", skills: ["alpha"] });
    const cardRemote = await createEmptyBareRemote("card-remote-");
    await runAgentsCli(["card", "remote", "add", "@team/backend", cardRemote.url], envFor(fixture));
    await runAgentsCli(["card", "push", "@team/backend"], envFor(fixture));
    const catalog = await createCatalogRemote({ scope: "@team" });
    expect((await runAgentsCli(["library", "catalog", "add", catalog.url], envFor(fixture))).exitCode).toBe(0);

    const result = await publishCardToCatalog({
      agentsDir: fixture.agentsDir,
      cardRef: "@team/backend@1.0.0",
      catalog: "@team",
      mode: "direct",
    });

    const manifest = await catalog.readRemoteManifest();
    expect(result.catalog.scope).toBe("@team");
    expect(result.catalog.url).toBe(catalog.url);
    expect(manifest.cards.map((card: { name: string }) => card.name)).toEqual(["backend"]);
  });
});

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

async function readCatalog(dir: string) {
  return JSON.parse(await readFile(join(dir, "catalog.json"), "utf8"));
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

  return {
    tempDir,
    sourceDir,
    bareRepoPath,
    url: `file://${bareRepoPath}`,
    readRemoteManifest: async () => JSON.parse(await git.showBlob(bareRepoPath, "HEAD:catalog.json")),
  };
}
