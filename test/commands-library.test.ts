// ABOUTME: Verifies the user-facing `drwn library` command group.
// ABOUTME: Protects the local reusable inventory mental model over lower-level package commands.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveStoreSkillPackageCurrentLink } from "../cli/core/store-paths";
import {
  cleanupTempRoots,
  createInstalledSkillBundle,
  createSkillBundleFixture,
  runAgentsCli,
  scaffoldCliFixture,
} from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

function envFor(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  return {
    AGENTS_REPO_ROOT: fixture.repoRoot,
    AGENTS_HOME_DIR: fixture.homeDir,
    AGENTS_DIR: fixture.agentsDir,
  };
}

async function createLooseSkill(root: string, name: string, options?: { withName?: boolean }) {
  const skillDir = join(root, name);
  await import("node:fs/promises").then(({ mkdir }) => mkdir(skillDir, { recursive: true }));
  const frontmatter = options?.withName === false
    ? "---\ndescription: loose command fixture\n---\n"
    : `---\nname: ${name}\ndescription: loose command fixture\n---\n`;
  await writeFile(join(skillDir, "SKILL.md"), `${frontmatter}\n# ${name}\n`);
  await writeFile(join(skillDir, "extra.txt"), "extra\n");
  return { skillDir, skillMd: join(skillDir, "SKILL.md") };
}

describe("drwn library", () => {
  test("lists local skills and MCP servers", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["library", "list"], envFor(fixture));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("alpha");
    expect(result.stdout).toContain("context7");
  });

  test("lists skills as json", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await createInstalledSkillBundle(fixture.agentsDir, { skillName: "hello-skill" });

    const result = await runAgentsCli(["library", "list", "skills", "--json"], envFor(fixture));

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Array<{ id: string; kind: string; source: string }>;
    expect(parsed.some((item) => item.id === "hello-skill" && item.kind === "skill" && item.source === "npm")).toBe(true);
  });

  test("lists MCP servers as json", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["library", "list", "mcp", "--json"], envFor(fixture));

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Array<{ id: string; kind: string }>;
    expect(parsed.some((item) => item.id === "context7" && item.kind === "mcp")).toBe(true);
  });

  test("shows a skill or MCP server by id", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const skill = await runAgentsCli(["library", "show", "alpha", "--json"], envFor(fixture));
    const mcp = await runAgentsCli(["library", "show", "context7", "--json"], envFor(fixture));

    expect(skill.exitCode).toBe(0);
    expect((JSON.parse(skill.stdout) as { kind: string; id: string }).kind).toBe("skill");
    expect(mcp.exitCode).toBe(0);
    expect((JSON.parse(mcp.stdout) as { kind: string; id: string }).kind).toBe("mcp");
  });

  test("adds a skill bundle to the local library without project activation", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const { bundleRoot } = await createSkillBundleFixture(fixture.root);

    const result = await runAgentsCli(["library", "add", "skill", bundleRoot], envFor(fixture), fixture.root);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("@acme/skills-sample@1.0.0");
    expect(existsSync(resolveStoreSkillPackageCurrentLink(fixture.agentsDir, "@acme/skills-sample"))).toBe(true);
    expect(existsSync(join(fixture.root, ".agents", "drwn", "config.json"))).toBe(false);
  });

  test("adds loose SKILL.md and skill directories to the local library without project activation", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const direct = await createLooseSkill(fixture.root, "loose-direct");
    const directory = await createLooseSkill(fixture.root, "loose-directory");

    const directResult = await runAgentsCli(["library", "add", "skill", direct.skillMd, "--json"], envFor(fixture), fixture.root);
    const directoryResult = await runAgentsCli(["library", "add", "skill", directory.skillDir, "--json"], envFor(fixture), fixture.root);

    expect(directResult.exitCode).toBe(0);
    expect(directoryResult.exitCode).toBe(0);
    const directParsed = JSON.parse(directResult.stdout) as { packageName: string; activeVersion: string; skillName: string };
    expect(directParsed.packageName).toBe("@local/loose-direct");
    expect(directParsed.activeVersion).toBe("0.1.0");
    expect(directParsed.skillName).toBe("loose-direct");
    expect(existsSync(resolveStoreSkillPackageCurrentLink(fixture.agentsDir, "@local/loose-direct"))).toBe(true);
    expect(existsSync(resolveStoreSkillPackageCurrentLink(fixture.agentsDir, "@local/loose-directory"))).toBe(true);
    expect(existsSync(join(fixture.root, ".agents", "drwn", "config.json"))).toBe(false);

    const listed = await runAgentsCli(["library", "list", "skills", "--json"], envFor(fixture));
    const shown = await runAgentsCli(["library", "show", "loose-direct", "--json"], envFor(fixture));
    const listedParsed = JSON.parse(listed.stdout) as Array<{ id: string; source: string; sourceId?: string }>;
    const shownParsed = JSON.parse(shown.stdout) as { id: string; sourceId?: string };
    expect(listedParsed.some((item) => item.id === "loose-direct" && item.source === "npm" && item.sourceId === "@local/loose-direct")).toBe(true);
    expect(shownParsed.sourceId).toBe("@local/loose-direct");
  });

  test("loose skill import rejects duplicates unless --replace targets the same package", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const loose = await createLooseSkill(fixture.root, "replace-loose");
    expect((await runAgentsCli(["library", "add", "skill", loose.skillMd], envFor(fixture), fixture.root)).exitCode).toBe(0);
    await writeFile(loose.skillMd, "---\nname: replace-loose\ndescription: updated\n---\n");

    const duplicate = await runAgentsCli(["library", "add", "skill", loose.skillMd], envFor(fixture), fixture.root);
    const replaced = await runAgentsCli(["library", "add", "skill", loose.skillMd, "--replace", "--json"], envFor(fixture), fixture.root);
    const repoCollision = await createLooseSkill(fixture.root, "alpha");
    const blockedRepoReplace = await runAgentsCli(["library", "add", "skill", repoCollision.skillMd, "--replace"], envFor(fixture), fixture.root);

    expect(duplicate.exitCode).not.toBe(0);
    expect(`${duplicate.stdout}\n${duplicate.stderr}`).toContain("collision");
    expect(replaced.exitCode).toBe(0);
    expect(JSON.parse(replaced.stdout).packageName).toBe("@local/replace-loose");
    expect(blockedRepoReplace.exitCode).not.toBe(0);
  });

  test("adds an MCP server file to the local library without activation", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const serverFile = join(fixture.root, "github-mcp.json");
    await writeFile(
      serverFile,
      JSON.stringify({
        description: "GitHub",
        transport: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: { GITHUB_TOKEN: "${GITHUB_TOKEN}" },
        optional: true,
      }),
    );

    const result = await runAgentsCli(["library", "add", "mcp", serverFile, "--as", "github"], envFor(fixture), fixture.root);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Added github");
    const library = JSON.parse(await readFile(join(fixture.agentsDir, "library", "mcp-servers.json"), "utf8")) as {
      servers?: Record<string, { command?: string }>;
    };
    expect(library.servers?.github?.command).toBe("npx");
    expect(existsSync(join(fixture.root, ".agents", "drwn", "config.json"))).toBe(false);
  });

  test("lists user MCP library entries", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const { saveMcpLibrary } = await import("../cli/core/mcp-library");
    await saveMcpLibrary(fixture.agentsDir, {
      version: 1,
      servers: {
        github: {
          description: "GitHub",
          transport: "stdio",
          command: "npx",
          optional: true,
        },
      },
    });

    const result = await runAgentsCli(["library", "list", "mcp", "--json"], envFor(fixture));

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Array<{ id: string; source: string }>;
    expect(parsed.some((item) => item.id === "github" && item.source === "library")).toBe(true);
  });
});
