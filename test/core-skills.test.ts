// ABOUTME: Verifies the extracted skill curation and sync helpers for the drwn harness CLI core.
// ABOUTME: Keeps shared-skill publication semantics stable while commands are added on top.

import { afterEach, describe, expect, test } from "bun:test";
import { lstat, mkdtemp, mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { normalizeSyncPathOptions } from "../cli/core/paths";
import { createInstalledSkillBundle } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (root) => {
      await rm(root, { recursive: true, force: true });
    }),
  );
});

async function createTempRoot() {
  const root = await mkdtemp(join(tmpdir(), "agents-core-skills-"));
  tempRoots.push(root);
  return root;
}

async function createInstalledBundle(
  agentsDir: string,
  options?: { packageName?: string; version?: string; skillName?: string; scope?: "shared" | "claude-only" | "codex-only" | "experimental" },
) {
  const packageName = options?.packageName ?? "@acme/skills-sample";
  const version = options?.version ?? "1.0.0";
  const skillName = options?.skillName ?? "hello-skill";
  const scope = options?.scope ?? "shared";
  const packageRoot = join(agentsDir, "packages", "skills", ...packageName.split("/"), version);
  const skillDir = join(packageRoot, "skills", scope, skillName);
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, "SKILL.md"), `---\nname: ${skillName}\ndescription: hello\n---\n`);
  await writeFile(
    join(packageRoot, "bundle.json"),
    JSON.stringify({
      schemaVersion: 1,
      bundleName: packageName,
      version,
      skills: [{ name: skillName, scope, path: `skills/${scope}/${skillName}` }],
    }),
  );
  await symlink(version, join(dirname(packageRoot), "current"));
}

describe("core skills", () => {
  test("listSkillsByScope returns repo skills across all four scopes", async () => {
    const root = await createTempRoot();
    const sharedPath = join(root, "skills", "shared", "alpha");
    const experimentalPath = join(root, "skills", "experimental", "beta");

    await mkdir(sharedPath, { recursive: true });
    await mkdir(experimentalPath, { recursive: true });
    await writeFile(join(sharedPath, "SKILL.md"), "---\nname: alpha\ndescription: alpha\n---\n");
    await writeFile(join(experimentalPath, "SKILL.md"), "---\nname: beta\ndescription: beta\n---\n");

    const { listSkillsByScope } = await import("../cli/core/skills");
    const result = await listSkillsByScope(root);

    expect(result.shared.map((skill) => skill.name)).toContain("alpha");
    expect(result.experimental.map((skill) => skill.name)).toContain("beta");
  });

  test("curateSkill creates an agents-layer symlink for a shared skill", async () => {
    const root = await createTempRoot();
    const homeDir = join(root, "home");
    const agentsDir = join(homeDir, ".agents");
    const sharedPath = join(root, "skills", "shared", "alpha");
    const curatedPath = join(agentsDir, "skills", "alpha");

    await mkdir(sharedPath, { recursive: true });
    await mkdir(dirname(curatedPath), { recursive: true });
    await writeFile(join(sharedPath, "SKILL.md"), "---\nname: alpha\ndescription: alpha\n---\n");

    const { curateSkill } = await import("../cli/core/skills");
    await curateSkill({ repoRoot: root, agentsDir }, "alpha");

    expect((await lstat(curatedPath)).isSymbolicLink()).toBe(true);
    expect(await realpath(curatedPath)).toBe(await realpath(sharedPath));
  });

  test("uncurateSkill removes an agents-layer symlink", async () => {
    const root = await createTempRoot();
    const homeDir = join(root, "home");
    const agentsDir = join(homeDir, ".agents");
    const sharedPath = join(root, "skills", "shared", "alpha");
    const curatedPath = join(agentsDir, "skills", "alpha");

    await mkdir(sharedPath, { recursive: true });
    await mkdir(dirname(curatedPath), { recursive: true });
    await writeFile(join(sharedPath, "SKILL.md"), "---\nname: alpha\ndescription: alpha\n---\n");
    await symlink(sharedPath, curatedPath, "dir");

    const { uncurateSkill } = await import("../cli/core/skills");
    await uncurateSkill({ agentsDir }, "alpha");

    await expect(lstat(curatedPath)).rejects.toThrow();
  });

  test("uncurateSkill throws for skill that is not curated", async () => {
    const root = await createTempRoot();
    const agentsDir = join(root, "home", ".agents");
    await mkdir(join(agentsDir, "skills"), { recursive: true });

    const { uncurateSkill } = await import("../cli/core/skills");
    await expect(uncurateSkill({ agentsDir }, "not-curated")).rejects.toThrow();
  });

  test("curateSkill creates an agents-layer symlink for a package-backed shared skill", async () => {
    const root = await createTempRoot();
    const homeDir = join(root, "home");
    const agentsDir = join(homeDir, ".agents");
    await mkdir(join(root, "skills", "shared"), { recursive: true });
    await mkdir(join(agentsDir, "skills"), { recursive: true });
    await createInstalledBundle(agentsDir, { skillName: "hello-skill" });

    const { curateSkill } = await import("../cli/core/skills");
    const curatedPath = await curateSkill({ repoRoot: root, agentsDir }, "hello-skill");

    expect((await lstat(curatedPath)).isSymbolicLink()).toBe(true);
    expect(await realpath(curatedPath)).toContain("/packages/skills/@acme/skills-sample/1.0.0/skills/shared/hello-skill");
  });

  test("buildSkillInventory includes package-backed skills with source metadata", async () => {
    const root = await createTempRoot();
    const homeDir = join(root, "home");
    const agentsDir = join(homeDir, ".agents");
    const sharedPath = join(root, "skills", "shared", "alpha");
    await mkdir(sharedPath, { recursive: true });
    await writeFile(join(sharedPath, "SKILL.md"), "---\nname: alpha\ndescription: alpha\n---\n");
    await createInstalledBundle(agentsDir, { skillName: "hello-skill" });

    const { buildSkillInventory } = await import("../cli/core/skills");
    const inventory = await buildSkillInventory(root, agentsDir, homeDir);
    const packageSkill = inventory.find((skill) => skill.name === "hello-skill");

    expect(packageSkill?.scope).toBe("shared");
    expect(packageSkill?.sourceType).toBe("npm");
    expect(packageSkill?.sourceId).toBe("@acme/skills-sample");
    expect(packageSkill?.sourceVersion).toBe("1.0.0");
  });

  test("syncSkills include adds a non-curated skill to downstream links", async () => {
    const root = await createTempRoot();
    const homeDir = join(root, "home");
    const agentsDir = join(homeDir, ".agents");
    const alphaPath = join(root, "skills", "shared", "alpha");
    const betaPath = join(root, "skills", "shared", "beta");
    const curatedAlpha = join(agentsDir, "skills", "alpha");

    await mkdir(alphaPath, { recursive: true });
    await mkdir(betaPath, { recursive: true });
    await mkdir(dirname(curatedAlpha), { recursive: true });
    await writeFile(join(alphaPath, "SKILL.md"), "---\nname: alpha\ndescription: alpha\n---\n");
    await writeFile(join(betaPath, "SKILL.md"), "---\nname: beta\ndescription: beta\n---\n");
    await symlink(alphaPath, curatedAlpha, "dir");

    const { syncSkills } = await import("../cli/core/skills");
    const result = await syncSkills(
      normalizeSyncPathOptions({ repoRoot: root, agentsDir, homeDir }, import.meta.path),
      { include: ["beta"] },
    );

    expect(result.warnings).toEqual([]);
    expect((await lstat(join(homeDir, ".claude", "skills", "beta"))).isSymbolicLink()).toBe(true);
    expect((await lstat(join(homeDir, ".codex", "skills", "beta"))).isSymbolicLink()).toBe(true);
  });

  test("syncSkills include adds a package-backed non-curated skill to downstream links", async () => {
    const root = await createTempRoot();
    const homeDir = join(root, "home");
    const agentsDir = join(homeDir, ".agents");
    await mkdir(join(root, "skills", "shared"), { recursive: true });
    await mkdir(join(agentsDir, "skills"), { recursive: true });
    await createInstalledSkillBundle(agentsDir, { skillName: "hello-skill" });

    const { syncSkills } = await import("../cli/core/skills");
    const result = await syncSkills(
      normalizeSyncPathOptions({ repoRoot: root, agentsDir, homeDir }, import.meta.path),
      { include: ["hello-skill"] },
    );

    expect(result.warnings).toEqual([]);
    expect((await lstat(join(homeDir, ".claude", "skills", "hello-skill"))).isSymbolicLink()).toBe(true);
    expect((await lstat(join(homeDir, ".codex", "skills", "hello-skill"))).isSymbolicLink()).toBe(true);
  });

  test("syncSkills exclude removes a curated skill from downstream links", async () => {
    const root = await createTempRoot();
    const homeDir = join(root, "home");
    const agentsDir = join(homeDir, ".agents");
    const alphaPath = join(root, "skills", "shared", "alpha");
    const curatedAlpha = join(agentsDir, "skills", "alpha");

    await mkdir(alphaPath, { recursive: true });
    await mkdir(dirname(curatedAlpha), { recursive: true });
    await writeFile(join(alphaPath, "SKILL.md"), "---\nname: alpha\ndescription: alpha\n---\n");
    await symlink(alphaPath, curatedAlpha, "dir");

    const { syncSkills } = await import("../cli/core/skills");
    const result = await syncSkills(
      normalizeSyncPathOptions({ repoRoot: root, agentsDir, homeDir }, import.meta.path),
      { exclude: ["alpha"] },
    );

    expect(result.changes.some((change) => change.includes("alpha"))).toBe(false);
  });

  test("syncSkills exclude wins over include", async () => {
    const root = await createTempRoot();
    const homeDir = join(root, "home");
    const agentsDir = join(homeDir, ".agents");
    const alphaPath = join(root, "skills", "shared", "alpha");

    await mkdir(alphaPath, { recursive: true });
    await writeFile(join(alphaPath, "SKILL.md"), "---\nname: alpha\ndescription: alpha\n---\n");

    const { syncSkills } = await import("../cli/core/skills");
    const result = await syncSkills(
      normalizeSyncPathOptions({ repoRoot: root, agentsDir, homeDir }, import.meta.path),
      { include: ["alpha"], exclude: ["alpha"] },
    );

    expect(result.changes.some((change) => change.includes("alpha"))).toBe(false);
  });

  test("syncSkills fails when include references a nonexistent skill", async () => {
    const root = await createTempRoot();
    const homeDir = join(root, "home");
    const agentsDir = join(homeDir, ".agents");
    await mkdir(join(root, "skills", "shared"), { recursive: true });
    await mkdir(join(agentsDir, "skills"), { recursive: true });

    const { syncSkills } = await import("../cli/core/skills");
    await expect(
      syncSkills(
        normalizeSyncPathOptions({ repoRoot: root, agentsDir, homeDir }, import.meta.path),
        { include: ["missing-skill"] },
      ),
    ).rejects.toThrow("missing-skill");
  });

  test("syncSkills installs downstream links from a curated package-backed source", async () => {
    const root = await createTempRoot();
    const homeDir = join(root, "home");
    const agentsDir = join(homeDir, ".agents");
    await mkdir(join(root, "skills", "shared"), { recursive: true });
    await mkdir(join(agentsDir, "skills"), { recursive: true });
    await createInstalledBundle(agentsDir, { skillName: "hello-skill" });

    const { curateSkill, syncSkills } = await import("../cli/core/skills");
    await curateSkill({ repoRoot: root, agentsDir }, "hello-skill");
    await syncSkills(normalizeSyncPathOptions({ repoRoot: root, agentsDir, homeDir }, import.meta.path));

    expect((await lstat(join(homeDir, ".claude", "skills", "hello-skill"))).isSymbolicLink()).toBe(true);
    expect((await lstat(join(homeDir, ".codex", "skills", "hello-skill"))).isSymbolicLink()).toBe(true);
  });
});

describe("skill name validation", () => {
  test("rejects names with path separators", async () => {
    const root = await createTempRoot();
    const agentsDir = join(root, "home", ".agents");
    await mkdir(join(agentsDir, "skills"), { recursive: true });

    const { curateSkill } = await import("../cli/core/skills");
    await expect(curateSkill({ repoRoot: root, agentsDir }, "../../../etc/passwd")).rejects.toThrow();
    await expect(curateSkill({ repoRoot: root, agentsDir }, "foo/bar")).rejects.toThrow();
    await expect(curateSkill({ repoRoot: root, agentsDir }, "foo\\bar")).rejects.toThrow();
  });

  test("rejects names that are '.' or '..'", async () => {
    const root = await createTempRoot();
    const agentsDir = join(root, "home", ".agents");
    await mkdir(join(agentsDir, "skills"), { recursive: true });

    const { curateSkill } = await import("../cli/core/skills");
    await expect(curateSkill({ repoRoot: root, agentsDir }, "..")).rejects.toThrow();
    await expect(curateSkill({ repoRoot: root, agentsDir }, ".")).rejects.toThrow();
  });
});
