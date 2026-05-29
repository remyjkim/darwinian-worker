// ABOUTME: Verifies drwn skills packages add/list/show command behavior for package-backed skill bundles.
// ABOUTME: Locks in the package-backed extension source UX without conflating it with curation or write.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { cleanupTempRoots, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

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
        displayName: "Sample Skills",
        skills: [{ name: skillName, scope: "shared", path: `skills/shared/${skillName}` }],
      },
      null,
      2,
    ),
  );
  await writeFile(join(bundleRoot, "README.md"), "# fixture\n");
  await writeFile(join(skillDir, "SKILL.md"), `---\nname: ${skillName}\ndescription: fixture\n---\n`);
  return { bundleRoot, packageName, version, skillName };
}

describe("drwn skills packages", () => {
  test("add installs a bundle into the managed cache", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const { bundleRoot } = await createBundleFixture(fixture.root);

    const result = await runAgentsCli(["skills", "packages", "add", bundleRoot], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).toBe(0);
    const manifest = JSON.parse(
      await readFile(
        join(fixture.agentsDir, "packages", "skills", "@acme", "skills-sample", "1.0.0", "bundle.json"),
        "utf8",
      ),
    ) as { bundleName: string };
    expect(manifest.bundleName).toBe("@acme/skills-sample");
  });

  test("list shows installed bundles", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const { bundleRoot } = await createBundleFixture(fixture.root);
    await runAgentsCli(["skills", "packages", "add", bundleRoot], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    const result = await runAgentsCli(["skills", "packages", "list", "--json"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    const parsed = JSON.parse(result.stdout) as Array<{ packageName: string; activeVersion: string }>;
    expect(parsed.some((bundle) => bundle.packageName === "@acme/skills-sample" && bundle.activeVersion === "1.0.0")).toBe(true);
  });

  test("show prints bundle metadata", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const { bundleRoot } = await createBundleFixture(fixture.root);
    await runAgentsCli(["skills", "packages", "add", bundleRoot], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    const result = await runAgentsCli(["skills", "packages", "show", "@acme/skills-sample", "--json"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    const parsed = JSON.parse(result.stdout) as { packageName: string; manifest: { displayName?: string } };
    expect(parsed.packageName).toBe("@acme/skills-sample");
    expect(parsed.manifest.displayName).toBe("Sample Skills");
  });

  test("add fails for a colliding skill name", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const { bundleRoot } = await createBundleFixture(fixture.root, { skillName: "alpha" });

    const result = await runAgentsCli(["skills", "packages", "add", bundleRoot], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    });

    expect(result.exitCode).not.toBe(0);
  });
});
