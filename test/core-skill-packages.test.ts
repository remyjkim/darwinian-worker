// ABOUTME: Verifies package-backed skill bundle validation, discovery, and ingestion behavior.
// ABOUTME: Protects the npm-pack-based extension source model before command-layer wiring is added.

import { afterEach, describe, expect, test } from "bun:test";
import { access, mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (root) => {
      await rm(root, { recursive: true, force: true });
    }),
  );
});

async function createTempRoot() {
  const root = await mkdtemp(join(tmpdir(), "agents-core-skill-packages-"));
  tempRoots.push(root);
  return root;
}

async function createBundleFixture(root: string, options?: { packageName?: string; version?: string; skillName?: string }) {
  const packageName = options?.packageName ?? "@acme/skills-sample";
  const version = options?.version ?? "1.0.0";
  const skillName = options?.skillName ?? "hello-skill";
  const bundleRoot = join(root, "bundle");
  const skillDir = join(bundleRoot, "skills", "shared", skillName);

  await mkdir(skillDir, { recursive: true });
  await writeFile(
    join(bundleRoot, "package.json"),
    JSON.stringify(
      {
        name: packageName,
        version,
        description: "fixture",
        license: "MIT",
        files: ["skills", "bundle.json", "README.md"],
        scripts: {
          prepack: "echo PREPACK_RAN > prepack-ran.txt",
        },
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(bundleRoot, "bundle.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        bundleName: packageName,
        version,
        skills: [
          {
            name: skillName,
            scope: "shared",
            path: `skills/shared/${skillName}`,
          },
        ],
      },
      null,
      2,
    ),
  );
  await writeFile(join(bundleRoot, "README.md"), "# fixture\n");
  await writeFile(join(skillDir, "SKILL.md"), `---\nname: ${skillName}\ndescription: fixture\n---\n`);

  return { bundleRoot, packageName, version, skillName };
}

async function createLooseSkillFixture(root: string, options?: { skillName?: string; body?: string; withName?: boolean }) {
  const skillName = options?.skillName ?? "loose-skill";
  const skillRoot = join(root, skillName);
  await mkdir(skillRoot, { recursive: true });
  const frontmatter = options?.withName === false
    ? "---\ndescription: loose fixture\n---\n"
    : `---\nname: ${skillName}\ndescription: loose fixture\n---\n`;
  await writeFile(join(skillRoot, "SKILL.md"), `${frontmatter}\n${options?.body ?? "# Loose skill\n"}`);
  await writeFile(join(skillRoot, "notes.md"), "auxiliary file\n");
  return { skillRoot, skillName, skillMd: join(skillRoot, "SKILL.md") };
}

describe("core skill packages", () => {
  test("loadBundleManifest parses a valid bundle manifest", async () => {
    const root = await createTempRoot();
    const { bundleRoot, packageName, version } = await createBundleFixture(root);

    const { loadBundleManifest } = await import("../cli/core/skill-packages");
    const manifest = await loadBundleManifest(bundleRoot);

    expect(manifest.bundleName).toBe(packageName);
    expect(manifest.version).toBe(version);
    expect(manifest.skills).toHaveLength(1);
  });

  test("loadBundleManifest rejects a missing manifest", async () => {
    const root = await createTempRoot();
    const bundleRoot = join(root, "bundle");
    await mkdir(bundleRoot, { recursive: true });

    const { loadBundleManifest } = await import("../cli/core/skill-packages");
    await expect(loadBundleManifest(bundleRoot)).rejects.toThrow(/bundle\.json/i);
  });

  test("validateBundleManifest rejects invalid skill paths", async () => {
    const root = await createTempRoot();
    const { bundleRoot, packageName, version } = await createBundleFixture(root);
    await writeFile(
      join(bundleRoot, "bundle.json"),
      JSON.stringify(
        {
          schemaVersion: 1,
          bundleName: packageName,
          version,
          skills: [{ name: "hello-skill", scope: "shared", path: "../escape" }],
        },
        null,
        2,
      ),
    );

    const { loadBundleManifest, validateBundleManifest } = await import("../cli/core/skill-packages");
    const manifest = await loadBundleManifest(bundleRoot);
    await expect(validateBundleManifest(bundleRoot, manifest, new Set(), packageName, version)).rejects.toThrow(/path/i);
  });

  test("validateBundleManifest rejects a missing SKILL.md", async () => {
    const root = await createTempRoot();
    const { bundleRoot, packageName, version, skillName } = await createBundleFixture(root);
    await rm(join(bundleRoot, "skills", "shared", skillName, "SKILL.md"), { force: true });

    const { loadBundleManifest, validateBundleManifest } = await import("../cli/core/skill-packages");
    const manifest = await loadBundleManifest(bundleRoot);
    await expect(validateBundleManifest(bundleRoot, manifest, new Set(), packageName, version)).rejects.toThrow(/SKILL\.md/i);
  });

  test("validateBundleManifest rejects colliding skill names", async () => {
    const root = await createTempRoot();
    const { bundleRoot, packageName, version } = await createBundleFixture(root, { skillName: "alpha" });

    const { loadBundleManifest, validateBundleManifest } = await import("../cli/core/skill-packages");
    const manifest = await loadBundleManifest(bundleRoot);
    await expect(validateBundleManifest(bundleRoot, manifest, new Set(["alpha"]), packageName, version)).rejects.toThrow(/collision/i);
  });

  test("classifySkillAddInput preserves package specs with slashes for npm pack", async () => {
    const root = await createTempRoot();
    const loose = await createLooseSkillFixture(root, { skillName: "classified-loose" });

    const { classifySkillAddInput } = await import("../cli/core/skill-packages");

    expect(classifySkillAddInput(loose.skillMd)).toBe("loose-skill");
    expect(classifySkillAddInput(loose.skillRoot)).toBe("loose-skill");
    expect(classifySkillAddInput("github:owner/repo")).toBe("package-spec");
    expect(classifySkillAddInput("git+https://github.com/owner/repo.git")).toBe("package-spec");
    expect(() => classifySkillAddInput("./missing/SKILL.md")).toThrow(/does not exist/i);
  });

  test("listInstalledSkillBundles discovers installed bundles from the filesystem layout", async () => {
    const root = await createTempRoot();
    const agentsDir = join(root, "home", ".agents");
    const versionRoot = join(agentsDir, "packages", "skills", "@acme", "skills-sample", "1.0.0");
    await mkdir(versionRoot, { recursive: true });
    await writeFile(
      join(versionRoot, "bundle.json"),
      JSON.stringify({
        schemaVersion: 1,
        bundleName: "@acme/skills-sample",
        version: "1.0.0",
        skills: [],
      }),
    );
    await writeFile(join(agentsDir, "packages", "skills", "@acme", "skills-sample", "current"), "1.0.0\n");

    const { listInstalledSkillBundles } = await import("../cli/core/skill-packages");
    const bundles = await listInstalledSkillBundles(agentsDir);

    expect(bundles).toHaveLength(1);
    expect(bundles[0]?.packageName).toBe("@acme/skills-sample");
    expect(bundles[0]?.activeVersion).toBe("1.0.0");
  });

  test("listInstalledSkillBundles tolerates a legacy symlink current pointer", async () => {
    const root = await createTempRoot();
    const agentsDir = join(root, "home", ".agents");
    const packageRoot = join(agentsDir, "packages", "skills", "@acme", "skills-sample");
    const versionRoot = join(packageRoot, "1.0.0");
    await mkdir(versionRoot, { recursive: true });
    await writeFile(
      join(versionRoot, "bundle.json"),
      JSON.stringify({ schemaVersion: 1, bundleName: "@acme/skills-sample", version: "1.0.0", skills: [] }),
    );
    // Legacy convention: current is a symlink to the version directory, not a pointer file.
    await symlink("1.0.0", join(packageRoot, "current"));

    const { listInstalledSkillBundles } = await import("../cli/core/skill-packages");
    const bundles = await listInstalledSkillBundles(agentsDir);

    expect(bundles).toHaveLength(1);
    expect(bundles[0]?.activeVersion).toBe("1.0.0");
  });

  test("listInstalledSkillBundles skips a malformed bundle instead of crashing", async () => {
    const root = await createTempRoot();
    const agentsDir = join(root, "home", ".agents");
    const packageRoot = join(agentsDir, "packages", "skills", "@acme", "broken");
    await mkdir(packageRoot, { recursive: true });
    // current points to a version whose directory / bundle.json does not exist.
    await writeFile(join(packageRoot, "current"), "9.9.9\n");

    const goodRoot = join(agentsDir, "packages", "skills", "@acme", "good", "1.0.0");
    await mkdir(goodRoot, { recursive: true });
    await writeFile(
      join(goodRoot, "bundle.json"),
      JSON.stringify({ schemaVersion: 1, bundleName: "@acme/good", version: "1.0.0", skills: [] }),
    );
    await writeFile(join(agentsDir, "packages", "skills", "@acme", "good", "current"), "1.0.0\n");

    const { listInstalledSkillBundles } = await import("../cli/core/skill-packages");
    const bundles = await listInstalledSkillBundles(agentsDir);

    expect(bundles.map((b) => b.packageName)).toEqual(["@acme/good"]);
  });

  test("ingestSkillPackage packs, extracts, validates, and marks the current version", async () => {
    const root = await createTempRoot();
    const agentsDir = join(root, "home", ".agents");
    const { bundleRoot, packageName, version, skillName } = await createBundleFixture(root);

    const { ingestSkillPackage } = await import("../cli/core/skill-packages");
    const installed = await ingestSkillPackage({
      agentsDir,
      packageSpec: bundleRoot,
      existingSkillNames: new Set(),
    });

    expect(installed.packageName).toBe(packageName);
    expect(installed.activeVersion).toBe(version);
    expect((await readFile(join(agentsDir, "packages", "skills", "@acme", "skills-sample", "current"), "utf8")).trim()).toBe(version);
    await access(join(agentsDir, "packages", "skills", "@acme", "skills-sample", version));
    expect(
      await realpath(join(agentsDir, "packages", "skills", "@acme", "skills-sample", version, "skills", "shared", skillName, "SKILL.md")),
    ).toContain(`/@acme/skills-sample/${version}/skills/shared/${skillName}/SKILL.md`);
  });

  test("ingestSkillPackage suppresses local prepack scripts", async () => {
    const root = await createTempRoot();
    const agentsDir = join(root, "home", ".agents");
    const { bundleRoot } = await createBundleFixture(root);

    const { ingestSkillPackage } = await import("../cli/core/skill-packages");
    await ingestSkillPackage({
      agentsDir,
      packageSpec: bundleRoot,
      existingSkillNames: new Set(),
    });

    await expect(access(join(bundleRoot, "prepack-ran.txt"))).rejects.toThrow();
  });

  test("installSkillBundleRoot installs a prepared bundle root", async () => {
    const root = await createTempRoot();
    const agentsDir = join(root, "home", ".agents");
    const { bundleRoot, packageName, version, skillName } = await createBundleFixture(root);

    const { installSkillBundleRoot } = await import("../cli/core/skill-packages");
    const installed = await installSkillBundleRoot({
      agentsDir,
      bundleRoot,
      packageName,
      version,
      existingSkillNames: new Set(),
    });

    expect(installed.packageName).toBe(packageName);
    expect((await readFile(join(agentsDir, "packages", "skills", "@acme", "skills-sample", "current"), "utf8")).trim()).toBe(version);
    expect(await readFile(join(installed.versionRoot, "skills", "shared", skillName, "SKILL.md"), "utf8")).toContain(`name: ${skillName}`);
  });

  test("installSkillBundleRoot --replace allows same package and rejects other collisions", async () => {
    const root = await createTempRoot();
    const agentsDir = join(root, "home", ".agents");
    const first = await createBundleFixture(join(root, "first"), { skillName: "replace-me" });
    const second = await createBundleFixture(join(root, "second"), { skillName: "replace-me" });
    await writeFile(join(second.bundleRoot, "skills", "shared", "replace-me", "SKILL.md"), "---\nname: replace-me\ndescription: replaced\n---\n");

    const { installSkillBundleRoot } = await import("../cli/core/skill-packages");
    const initial = await installSkillBundleRoot({
      agentsDir,
      bundleRoot: first.bundleRoot,
      packageName: first.packageName,
      version: first.version,
      existingSkillNames: new Set(),
    });
    expect(await readFile(join(initial.versionRoot, "skills", "shared", "replace-me", "SKILL.md"), "utf8")).toContain("fixture");

    const replaced = await installSkillBundleRoot({
      agentsDir,
      bundleRoot: second.bundleRoot,
      packageName: second.packageName,
      version: second.version,
      existingSkillNames: new Set(["replace-me"]),
      existingSkills: [{ name: "replace-me", sourceType: "npm", sourceId: second.packageName }],
      replace: true,
    });
    expect(await readFile(join(replaced.versionRoot, "skills", "shared", "replace-me", "SKILL.md"), "utf8")).toContain("replaced");

    const repoCollision = await createBundleFixture(join(root, "repo-collision"), { skillName: "alpha" });
    await expect(installSkillBundleRoot({
      agentsDir,
      bundleRoot: repoCollision.bundleRoot,
      packageName: repoCollision.packageName,
      version: repoCollision.version,
      existingSkillNames: new Set(["alpha"]),
      existingSkills: [{ name: "alpha", sourceType: "repo" }],
      replace: true,
    })).rejects.toThrow(/collision|replace/i);

    const packageCollision = await createBundleFixture(join(root, "package-collision"), { packageName: "@acme/other", skillName: "hello-skill" });
    await expect(installSkillBundleRoot({
      agentsDir,
      bundleRoot: packageCollision.bundleRoot,
      packageName: packageCollision.packageName,
      version: packageCollision.version,
      existingSkillNames: new Set(["hello-skill"]),
      existingSkills: [{ name: "hello-skill", sourceType: "npm", sourceId: "@acme/skills-sample" }],
      replace: true,
    })).rejects.toThrow(/collision|replace/i);
  });

  test("ingestLooseSkill imports direct files and directories as synthetic bundles", async () => {
    const root = await createTempRoot();
    const agentsDir = join(root, "home", ".agents");
    const dirSkill = await createLooseSkillFixture(root, { skillName: "loose-dir" });
    const fileSkill = await createLooseSkillFixture(root, { skillName: "loose-file" });

    const { ingestLooseSkill } = await import("../cli/core/skill-packages");
    const installedDir = await ingestLooseSkill({
      agentsDir,
      sourcePath: dirSkill.skillRoot,
      existingSkillNames: new Set(),
    });
    const installedFile = await ingestLooseSkill({
      agentsDir,
      sourcePath: fileSkill.skillMd,
      existingSkillNames: new Set(["loose-dir"]),
      existingSkills: [{ name: "loose-dir", sourceType: "npm", sourceId: "@local/loose-dir" }],
    });

    expect(installedDir.packageName).toBe("@local/loose-dir");
    expect(installedDir.activeVersion).toBe("0.1.0");
    expect(installedDir.skillName).toBe("loose-dir");
    expect(installedDir.frontmatterRewritten).toBe(false);
    expect(await readFile(join(installedDir.versionRoot, "skills", "shared", "loose-dir", "notes.md"), "utf8")).toContain("auxiliary");
    expect(installedFile.packageName).toBe("@local/loose-file");
    expect(await readFile(join(installedFile.versionRoot, "skills", "shared", "loose-file", "SKILL.md"), "utf8")).toContain("name: loose-file");
  });

  test("ingestLooseSkill rewrites copied frontmatter for --as without changing the source", async () => {
    const root = await createTempRoot();
    const agentsDir = join(root, "home", ".agents");
    const loose = await createLooseSkillFixture(root, { skillName: "source-name", withName: false });

    const { ingestLooseSkill } = await import("../cli/core/skill-packages");
    const installed = await ingestLooseSkill({
      agentsDir,
      sourcePath: loose.skillMd,
      existingSkillNames: new Set(),
      as: "target-name",
    });

    expect(installed.skillName).toBe("target-name");
    expect(installed.frontmatterRewritten).toBe(true);
    expect(await readFile(loose.skillMd, "utf8")).not.toContain("name: target-name");
    expect(await readFile(join(installed.versionRoot, "skills", "shared", "target-name", "SKILL.md"), "utf8")).toContain("name: target-name");
  });

  test("ingestLooseSkill validates missing names, scopes, symlinks, package names, and store read-only", async () => {
    const root = await createTempRoot();
    const agentsDir = join(root, "home", ".agents");
    const missingName = await createLooseSkillFixture(root, { skillName: "missing-name", withName: false });
    const withSymlink = await createLooseSkillFixture(root, { skillName: "with-symlink" });
    await symlink(join(withSymlink.skillRoot, "notes.md"), join(withSymlink.skillRoot, "linked.md"));

    const { ingestLooseSkill } = await import("../cli/core/skill-packages");
    await expect(ingestLooseSkill({
      agentsDir,
      sourcePath: missingName.skillRoot,
      existingSkillNames: new Set(),
    })).rejects.toThrow(/name|--as/i);
    await expect(ingestLooseSkill({
      agentsDir,
      sourcePath: withSymlink.skillRoot,
      existingSkillNames: new Set(),
    })).rejects.toThrow(/symlink/i);
    await expect(ingestLooseSkill({
      agentsDir,
      sourcePath: missingName.skillRoot,
      existingSkillNames: new Set(),
      as: "bad-package",
      packageName: "../bad",
    })).rejects.toThrow(/package/i);
    await expect(ingestLooseSkill({
      agentsDir,
      sourcePath: missingName.skillRoot,
      existingSkillNames: new Set(),
      as: "bad-scope",
      scope: "bad" as never,
    })).rejects.toThrow(/scope/i);

    const storeAgentsDir = join(root, "store-home", ".agents");
    await mkdir(join(storeAgentsDir, "drwn"), { recursive: true });
    await writeFile(join(storeAgentsDir, "drwn", "store.json"), JSON.stringify({ schemaVersion: 1, initAt: "2026-06-24T00:00:00.000Z" }));
    const prior = process.env.DRWN_STORE_READONLY;
    process.env.DRWN_STORE_READONLY = "1";
    try {
      await expect(ingestLooseSkill({
        agentsDir: storeAgentsDir,
        sourcePath: missingName.skillRoot,
        existingSkillNames: new Set(),
        as: "readonly-skill",
      })).rejects.toThrow(/read-only/i);
    } finally {
      if (prior === undefined) {
        delete process.env.DRWN_STORE_READONLY;
      } else {
        process.env.DRWN_STORE_READONLY = prior;
      }
    }
  });
});
