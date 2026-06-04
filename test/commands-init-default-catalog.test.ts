// ABOUTME: Verifies drwn init reads the default community catalog URL from packaged config.
// ABOUTME: Uses a local bare git repo so the test does not require network access.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanupTempRoots, envFor, runAgentsCli, scaffoldCliFixture } from "./helpers";
import { commitTree, initBare, updateRef, writeTreeFromDir } from "../cli/core/git";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function createLocalCatalogRepo(scope: string) {
  const tempDir = await mkdtemp(join(tmpdir(), "drwn-init-catalog-"));
  const sourceDir = join(tempDir, "source");
  const bareRepoPath = join(tempDir, "catalog.git");
  await mkdir(sourceDir, { recursive: true });
  await writeFile(
    join(sourceDir, "catalog.json"),
    `${JSON.stringify(
      { catalogVersion: 1, scope, description: "Test catalog", cards: [] },
      null,
      2,
    )}\n`,
  );
  await initBare(bareRepoPath);
  const tree = await writeTreeFromDir(bareRepoPath, sourceDir);
  const commit = await commitTree(bareRepoPath, tree, null, "Publish catalog");
  await updateRef(bareRepoPath, "refs/heads/main", commit);
  return { tempDir, url: `file://${bareRepoPath}` };
}

async function patchPackagedConfigWithCatalogUrl(repoRoot: string, url: string | null) {
  const configPath = join(repoRoot, "registry", "config.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  config.defaults = { ...(config.defaults ?? {}), communityCatalogUrl: url };
  await writeFile(configPath, JSON.stringify(config, null, 2));
}

describe("drwn init: default community catalog from packaged config", () => {
  test("registers the catalog at the URL configured in packaged registry/config.json", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const catalog = await createLocalCatalogRepo("@community");
    tempRoots.push(catalog.tempDir);

    await patchPackagedConfigWithCatalogUrl(fixture.repoRoot, catalog.url);

    const projectDir = join(fixture.root, "project");
    await mkdir(projectDir, { recursive: true });
    const init = await runAgentsCli(["init", "--non-interactive"], envFor(fixture), projectDir);

    expect(init.exitCode).toBe(0);
    expect(init.stderr).not.toContain("could not register default community catalog");

    const listed = await runAgentsCli(["library", "catalog", "list", "--json"], envFor(fixture));
    expect(listed.exitCode).toBe(0);
    const index = JSON.parse(listed.stdout);
    const urls = (index.catalogs as Array<{ url: string }>).map((c) => c.url);
    expect(urls).toContain(catalog.url);
  });

  test("skips registration when packaged config sets communityCatalogUrl to null", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    await patchPackagedConfigWithCatalogUrl(fixture.repoRoot, null);

    const projectDir = join(fixture.root, "project");
    await mkdir(projectDir, { recursive: true });
    const init = await runAgentsCli(["init", "--non-interactive"], envFor(fixture), projectDir);

    expect(init.exitCode).toBe(0);
    expect(init.stderr).toBe("");

    const listed = await runAgentsCli(["library", "catalog", "list", "--json"], envFor(fixture));
    expect(listed.exitCode).toBe(0);
    const index = JSON.parse(listed.stdout);
    expect(index.catalogs).toEqual([]);
  });

  test("skips registration when --no-default-catalogs is set even with URL configured", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const catalog = await createLocalCatalogRepo("@community");
    tempRoots.push(catalog.tempDir);

    await patchPackagedConfigWithCatalogUrl(fixture.repoRoot, catalog.url);

    const projectDir = join(fixture.root, "project");
    await mkdir(projectDir, { recursive: true });
    const init = await runAgentsCli(
      ["init", "--non-interactive", "--no-default-catalogs"],
      envFor(fixture),
      projectDir,
    );

    expect(init.exitCode).toBe(0);
    const listed = await runAgentsCli(["library", "catalog", "list", "--json"], envFor(fixture));
    const index = JSON.parse(listed.stdout);
    expect(index.catalogs).toEqual([]);
  });
});
