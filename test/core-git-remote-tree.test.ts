// ABOUTME: Verifies Git remote, tree, commit, and inspection primitives on local repos.
// ABOUTME: Exercises real file:// remotes without depending on network access.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cloneBare,
  commitTree,
  createAnnotatedTag,
  diff,
  extractTreeToDir,
  fetch,
  listTags,
  log,
  lsRemote,
  push,
  remoteAdd,
  remoteList,
  remoteRemove,
  remoteSet,
  revParse,
  showBlob,
  updateRef,
  writeTreeFromDir,
} from "../cli/core/git";
import { createLocalCardRepo, tagAdditionalVersion } from "./fixtures/git-helpers";

const cleanups: string[] = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("git remote and tree primitives", () => {
  test("lsRemote enumerates refs from a local file remote", async () => {
    const repo = await createLocalCardRepo({ name: "@me/foo" });
    cleanups.push(repo.tempDir);

    const refs = await lsRemote(repo.url);

    expect(refs.some((ref) => ref.ref === "refs/heads/main")).toBe(true);
    expect(refs.some((ref) => ref.ref === "refs/tags/v1.0.0")).toBe(true);
  });

  test("cloneBare, fetch, remote management, and listTags operate on a bare clone", async () => {
    const source = await createLocalCardRepo({ name: "@me/foo" });
    cleanups.push(source.tempDir);
    const tmp = await mkdtemp(join(tmpdir(), "drwn-git-clone-"));
    cleanups.push(tmp);
    const clone = join(tmp, "clone.git");

    await cloneBare(source.url, clone);
    expect(await listTags(clone)).toContain("v1.0.0");
    expect((await remoteList(clone)).origin).toBe(source.url);

    await remoteSet(clone, "origin", `${source.url}`);
    await remoteAdd(clone, "backup", source.url);
    expect((await remoteList(clone)).backup).toBe(source.url);
    await remoteRemove(clone, "backup");
    expect((await remoteList(clone)).backup).toBeUndefined();

    await tagAdditionalVersion(source, { name: "@me/foo", version: "1.1.0", skills: ["sample-skill", "extra"] });
    await fetch(clone, "origin", ["refs/tags/*:refs/tags/*", "refs/heads/*:refs/heads/*"]);

    expect(await listTags(clone)).toContain("v1.1.0");
  });

  test("writeTreeFromDir, commitTree, updateRef, createAnnotatedTag, and push publish content", async () => {
    const remote = await createLocalCardRepo({ name: "@me/foo" });
    cleanups.push(remote.tempDir);
    const tmp = await mkdtemp(join(tmpdir(), "drwn-git-push-"));
    cleanups.push(tmp);
    const repo = join(tmp, "repo.git");
    const sourceDir = join(tmp, "source");
    await cloneBare(remote.url, repo);
    await mkdir(sourceDir, { recursive: true });
    await writeFile(join(sourceDir, "card.json"), JSON.stringify({ name: "@me/foo", version: "2.0.0" }, null, 2));

    const treeSha = await writeTreeFromDir(repo, sourceDir);
    const commitSha = await commitTree(repo, treeSha, await revParse(repo, "refs/heads/main"), "Publish @me/foo@2.0.0");
    await updateRef(repo, "refs/heads/main", commitSha);
    await createAnnotatedTag(repo, "v2.0.0", commitSha, "v2.0.0");
    await push(repo, "origin", ["refs/heads/main", "refs/tags/v2.0.0"]);

    expect((await listTags(remote.bareRepoPath))).toContain("v2.0.0");
  });

  test("extractTreeToDir, log, diff, and showBlob inspect committed card content", async () => {
    const repo = await createLocalCardRepo({ name: "@me/foo" });
    cleanups.push(repo.tempDir);
    await tagAdditionalVersion(repo, { name: "@me/foo", version: "1.1.0", skills: ["sample-skill", "extra"] });
    const tmp = await mkdtemp(join(tmpdir(), "drwn-git-inspect-"));
    cleanups.push(tmp);

    const v1 = await revParse(repo.bareRepoPath, "refs/tags/v1.0.0^{commit}");
    const v2 = await revParse(repo.bareRepoPath, "refs/tags/v1.1.0^{commit}");
    const treeSha = await revParse(repo.bareRepoPath, `${v2}^{tree}`);
    const extracted = join(tmp, "extracted");

    await extractTreeToDir(repo.bareRepoPath, treeSha, extracted);

    expect(existsSync(join(extracted, "card.json"))).toBe(true);
    expect(await showBlob(repo.bareRepoPath, `${v2}:card.json`)).toContain('"version": "1.1.0"');
    expect(await diff(repo.bareRepoPath, v1, v2)).toContain("extra");
    expect((await log(repo.bareRepoPath, { maxCount: 2 })).map((entry) => entry.subject)).toContain("Publish @me/foo@1.1.0");
    expect(JSON.parse(await readFile(join(extracted, "card.json"), "utf8")).version).toBe("1.1.0");
  });
});
