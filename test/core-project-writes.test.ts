// ABOUTME: Verifies generic project config mutation helpers used by project-first commands.
// ABOUTME: Protects config preservation semantics across add, extension, skill, and MCP flows.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createTempRoot() {
  const root = await mkdtemp(join(tmpdir(), "agents-project-writes-"));
  tempRoots.push(root);
  return root;
}

async function readProjectConfig(projectDir: string) {
  return JSON.parse(await readFile(join(projectDir, ".agents", "drwn", "config.json"), "utf8")) as Record<string, unknown>;
}

describe("core project writes", () => {
  test("reads absent project config as a versioned empty config", async () => {
    const projectDir = await createTempRoot();

    const { readProjectConfigForWrite } = await import("../cli/core/project-writes");
    expect(readProjectConfigForWrite(projectDir)).toEqual({ version: 1 });
  });

  test("writes project config and creates parent directories", async () => {
    const projectDir = await createTempRoot();

    const { writeProjectConfigForWrite } = await import("../cli/core/project-writes");
    const configPath = writeProjectConfigForWrite(projectDir, { version: 1, skills: { include: ["alpha"] } });

    expect(configPath).toBe(join(projectDir, ".agents", "drwn", "config.json"));
    expect(await readProjectConfig(projectDir)).toEqual({ version: 1, skills: { include: ["alpha"] } });
  });

  test("includes project skills without duplicating or removing unrelated config", async () => {
    const projectDir = await createTempRoot();
    const configPath = join(projectDir, ".agents", "drwn", "config.json");
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(
      configPath,
      JSON.stringify({ version: 1, skills: { include: ["alpha"] }, extensions: { parallel: { enabled: true } } }, null, 2),
    );

    const { includeProjectSkill } = await import("../cli/core/project-writes");
    includeProjectSkill(projectDir, "alpha");
    includeProjectSkill(projectDir, "beta");

    expect(await readProjectConfig(projectDir)).toEqual({
      version: 1,
      skills: { include: ["alpha", "beta"] },
      extensions: { parallel: { enabled: true } },
    });
  });

  test("sets project server overrides without removing unrelated config", async () => {
    const projectDir = await createTempRoot();

    const { includeProjectSkill, setProjectServerOverride } = await import("../cli/core/project-writes");
    includeProjectSkill(projectDir, "alpha");
    setProjectServerOverride(projectDir, "context7", { enabled: true });

    expect(await readProjectConfig(projectDir)).toEqual({
      version: 1,
      skills: { include: ["alpha"] },
      servers: { context7: { enabled: true } },
    });
  });

  test("merges extension config without removing existing extension fields", async () => {
    const projectDir = await createTempRoot();

    const { setProjectExtensionConfig } = await import("../cli/core/project-writes");
    setProjectExtensionConfig(projectDir, "parallel", { enabled: true, skills: true });
    setProjectExtensionConfig(projectDir, "parallel", { mcp: true });

    expect(await readProjectConfig(projectDir)).toEqual({
      version: 1,
      extensions: { parallel: { enabled: true, skills: true, mcp: true } },
    });
  });
});
