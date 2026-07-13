// ABOUTME: Verifies cwd and path-like argv confinement under allowed roots.
// ABOUTME: Blocks traversal, symlink escape, and Cowork VM-internal paths.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parsePolicyText } from "../src/policy/load";
import { resolveCwdWithinRoots, validatePathArgsWithinRoots } from "../src/policy/paths";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tempRoot() {
  const root = await mkdtemp(join(tmpdir(), "drwn-command-bridge-policy-"));
  roots.push(root);
  return root;
}

describe("resolveCwdWithinRoots", () => {
  test("resolves an allowed cwd", async () => {
    const root = await tempRoot();
    const project = join(root, "project");
    await mkdir(project);
    const policy = parsePolicyText(`version: 1\ndefault: deny\nallow:\n  - program: git\n    risk: low\nroots_allow: [${JSON.stringify(project)}]\n`, {
      homeDir: root,
    });

    await expect(resolveCwdWithinRoots(project, policy)).resolves.toBe(await realpath(project));
  });

  test("denies traversal outside allowed roots", async () => {
    const root = await tempRoot();
    const project = join(root, "project");
    const outside = join(root, "outside");
    await mkdir(project);
    await mkdir(outside);
    const policy = parsePolicyText(`version: 1\ndefault: deny\nallow:\n  - program: git\n    risk: low\nroots_allow: [${JSON.stringify(project)}]\n`, {
      homeDir: root,
    });

    await expect(resolveCwdWithinRoots("../outside", policy)).rejects.toThrow(/outside allowed roots/);
  });

  test("denies symlink escape", async () => {
    const root = await tempRoot();
    const project = join(root, "project");
    const outside = join(root, "outside");
    const link = join(project, "link");
    await mkdir(project);
    await mkdir(outside);
    await symlink(outside, link);
    const policy = parsePolicyText(`version: 1\ndefault: deny\nallow:\n  - program: git\n    risk: low\nroots_allow: [${JSON.stringify(project)}]\n`, {
      homeDir: root,
    });

    await expect(resolveCwdWithinRoots(link, policy)).rejects.toThrow(/outside allowed roots/);
  });
});

describe("validatePathArgsWithinRoots", () => {
  test("denies Cowork VM-internal paths", async () => {
    const root = await tempRoot();
    const policy = parsePolicyText(`version: 1\ndefault: deny\nallow:\n  - program: git\n    risk: low\nroots_allow: [${JSON.stringify(root)}]\n`, {
      homeDir: root,
    });

    await expect(validatePathArgsWithinRoots(["git", "status", "/sessions/x/mnt/file"], root, policy)).rejects.toThrow(
      /VM-internal/,
    );
  });

  test("denies symlink path arg escape", async () => {
    const root = await tempRoot();
    const project = join(root, "project");
    const outside = join(root, "outside");
    await mkdir(project);
    await mkdir(outside);
    await writeFile(join(outside, "secret.txt"), "secret");
    await symlink(join(outside, "secret.txt"), join(project, "secret-link"));
    const policy = parsePolicyText(`version: 1\ndefault: deny\nallow:\n  - program: git\n    risk: low\nroots_allow: [${JSON.stringify(project)}]\n`, {
      homeDir: root,
    });

    await expect(validatePathArgsWithinRoots(["git", "status", "./secret-link"], project, policy)).rejects.toThrow(
      /outside allowed roots/,
    );
  });
});
