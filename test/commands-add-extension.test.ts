// ABOUTME: Verifies project-first extension activation through `bgng extensions add`.
// ABOUTME: Protects the higher-level UX over the lower-level extensions setup commands.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, runAgentsCli, scaffoldCliFixture } from "./helpers";

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

describe("bgng extensions add", () => {
  test("adds Parallel extension config to the current project", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    await mkdir(projectDir, { recursive: true });

    const result = await runAgentsCli(["extensions", "add", "parallel", "--mcp"], envFor(fixture), projectDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Added Parallel extension");
    const config = JSON.parse(await readFile(join(projectDir, ".agents", "bgng", "config.json"), "utf8")) as {
      extensions?: { parallel?: unknown };
    };
    expect(config.extensions?.parallel).toEqual({ enabled: true, skills: true, mcp: true });
  });

  test("supports dry-run json without writing config", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    await mkdir(projectDir, { recursive: true });

    const result = await runAgentsCli(["extensions", "add", "parallel", "--dry-run", "--json", "--skip-skills"], envFor(fixture), projectDir);

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { kind: string; id: string; projectChanges: Array<{ action: string }> };
    expect(parsed.kind).toBe("extension");
    expect(parsed.id).toBe("parallel");
    expect(parsed.projectChanges[0]?.action).toBe("enabled");
    expect(existsSync(join(projectDir, ".agents", "bgng", "config.json"))).toBe(false);
  });

  test("adds Beads semantic config without running external setup", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    await mkdir(projectDir, { recursive: true });

    const result = await runAgentsCli(["extensions", "add", "beads", "--target=codex", "--include-skill"], envFor(fixture), projectDir);

    expect(result.exitCode).toBe(0);
    const config = JSON.parse(await readFile(join(projectDir, ".agents", "bgng", "config.json"), "utf8")) as {
      extensions?: { beads?: unknown };
    };
    expect(config.extensions?.beads).toEqual({ enabled: true, targets: ["codex"], includeSkill: true });
  });

  test("adds MarkItDown semantic config without installing external tools", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    await mkdir(projectDir, { recursive: true });

    const result = await runAgentsCli(["extensions", "add", "markitdown"], envFor(fixture), projectDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Added MarkItDown extension");
    const config = JSON.parse(await readFile(join(projectDir, ".agents", "bgng", "config.json"), "utf8")) as {
      extensions?: { markitdown?: unknown };
    };
    expect(config.extensions?.markitdown).toEqual({ enabled: true, skills: true });
  });

  test("adds MarkItDown extension with skills disabled", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    await mkdir(projectDir, { recursive: true });

    const result = await runAgentsCli(["extensions", "add", "markitdown", "--skip-skills"], envFor(fixture), projectDir);

    expect(result.exitCode).toBe(0);
    const config = JSON.parse(await readFile(join(projectDir, ".agents", "bgng", "config.json"), "utf8")) as {
      extensions?: { markitdown?: unknown };
    };
    expect(config.extensions?.markitdown).toEqual({ enabled: true, skills: false });
  });

  test("fails for unknown extensions", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["extensions", "add", "missing"], envFor(fixture), fixture.root);

    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("Unknown extension");
  });

  test("old add extension path is not registered", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const result = await runAgentsCli(["add", "extension", "parallel"], envFor(fixture), fixture.root);

    expect(result.exitCode).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/Unknown Syntax Error|Command not found|Unsupported option/i);
  });
});
