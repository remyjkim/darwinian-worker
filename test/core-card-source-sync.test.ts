// ABOUTME: Verifies upstream skill sync for editable card sources.
// ABOUTME: Covers fresh, stale, and moved upstream detection without mutating on --check.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { classifyAndApplySkillSync } from "../cli/core/card-source-sync";
import { createTempRoot, cleanupTempRoots } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function writeSkill(dir: string, content: string) {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "SKILL.md"), content);
}

describe("classifyAndApplySkillSync", () => {
  test("reports synced when local skill matches upstream", async () => {
    const root = await createTempRoot("upstream-sync-");
    tempRoots.push(root);
    const upstreamDir = join(root, "upstream");
    const localDir = join(root, "local");
    const content = "---\nname: alpha\ndescription: from upstream\n---\n";
    await writeSkill(upstreamDir, content);
    await writeSkill(localDir, content);
    const outcome = await classifyAndApplySkillSync({
      skillName: "alpha",
      localSkillDir: localDir,
      upstreamSkillDir: upstreamDir,
      upstreamRef: "git+https://h/r.git#skills/alpha",
      commit: "a".repeat(40),
      check: true,
    });
    expect(outcome.synced).toBe(true);
    expect(outcome.stale).toBe(false);
    expect(outcome.moved).toBe(false);
  });

  test("reports stale when local skill differs from upstream", async () => {
    const root = await createTempRoot("upstream-stale-");
    tempRoots.push(root);
    const upstreamDir = join(root, "upstream");
    const localDir = join(root, "local");
    await writeSkill(upstreamDir, "---\nname: alpha\ndescription: upstream\n---\n");
    await writeSkill(localDir, "---\nname: alpha\ndescription: local edit\n---\n");
    const outcome = await classifyAndApplySkillSync({
      skillName: "alpha",
      localSkillDir: localDir,
      upstreamSkillDir: upstreamDir,
      upstreamRef: "git+https://h/r.git#skills/alpha",
      commit: "a".repeat(40),
      check: true,
    });
    expect(outcome.stale).toBe(true);
    expect(outcome.synced).toBe(false);
  });

  test("copies upstream into local skill when not checking", async () => {
    const root = await createTempRoot("upstream-copy-");
    tempRoots.push(root);
    const upstreamDir = join(root, "upstream");
    const localDir = join(root, "local");
    await writeSkill(upstreamDir, "---\nname: alpha\ndescription: fresh upstream\n---\n");
    await writeSkill(localDir, "---\nname: alpha\ndescription: stale local\n---\n");
    const outcome = await classifyAndApplySkillSync({
      skillName: "alpha",
      localSkillDir: localDir,
      upstreamSkillDir: upstreamDir,
      upstreamRef: "git+https://h/r.git#skills/alpha",
      commit: "a".repeat(40),
      check: false,
    });
    expect(outcome.synced).toBe(true);
    expect(await readFile(join(localDir, "SKILL.md"), "utf8")).toContain("fresh upstream");
  });

  test("reports moved when upstream commit advances after last sync", async () => {
    const root = await createTempRoot("upstream-moved-");
    tempRoots.push(root);
    const upstreamDir = join(root, "upstream");
    const localDir = join(root, "local");
    await writeSkill(upstreamDir, "---\nname: alpha\ndescription: v2\n---\n");
    await writeSkill(localDir, "---\nname: alpha\ndescription: v1\n---\n");
    const upstreamRef = "git+https://h/r.git#skills/alpha";
    const outcome = await classifyAndApplySkillSync({
      skillName: "alpha",
      localSkillDir: localDir,
      upstreamSkillDir: upstreamDir,
      upstreamRef,
      commit: "b".repeat(40),
      prior: { commit: "a".repeat(40), upstreamRef },
      check: true,
    });
    expect(outcome.moved).toBe(true);
    expect(outcome.stale).toBe(true);
    expect(await readFile(join(localDir, "SKILL.md"), "utf8")).toContain("v1");
  });
});

describe("validateCardManifest upstream", () => {
  test("rejects upstream key not in include", async () => {
    const { validateCardManifest } = await import("../cli/core/card-manifest");
    const result = validateCardManifest({
      name: "@me/x",
      version: "1.0.0",
      skills: { include: ["a"], upstream: { b: "git+https://h/r.git#skills/b" } },
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("upstream key");
  });

  test("rejects local-path upstream values", async () => {
    const { validateCardManifest } = await import("../cli/core/card-manifest");
    const result = validateCardManifest({
      name: "@me/x",
      version: "1.0.0",
      skills: { include: ["a"], upstream: { a: "file:/tmp/x" } },
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("local path");
  });
});
