// ABOUTME: Exercises skill surface materialization driven by target skill-surface readers.
// ABOUTME: Cursor selections and cursor-only projects must receive claude and codex skill dirs.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ProjectConfig } from "../cli/core/types";
import {
  cleanupTempRoots,
  envFor,
  installProjectWorkers,
  publishCardWithSkills,
  runAgentsCli,
  scaffoldCliFixture,
} from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function skillProject(targets?: ProjectConfig["targets"]) {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, {
    name: "@me/skilled",
    skills: ["alpha"],
  });
  const projectRoot = join(fixture.root, "project");
  await installProjectWorkers(projectRoot, fixture.agentsDir, ["@me/skilled@1.0.0"], "@me/skilled", {
    ...(targets ? { targets } : {}),
  });
  return { fixture, projectRoot };
}

describe("skill surface readers", () => {
  test("--target=cursor materializes claude and codex skill surfaces", async () => {
    const { fixture, projectRoot } = await skillProject();
    const result = await runAgentsCli(["write", "--target=cursor", "--json"], envFor(fixture), projectRoot);
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(projectRoot, ".claude", "skills", "alpha", "SKILL.md"))).toBe(true);
    expect(existsSync(join(projectRoot, ".codex", "skills", "alpha", "SKILL.md"))).toBe(true);
  });

  test("skills for a surface with no enabled reader are not materialized", async () => {
    const { fixture, projectRoot } = await skillProject({
      claude: { enabled: false },
      cursor: { enabled: false },
    });
    const result = await runAgentsCli(["write", "--json"], envFor(fixture), projectRoot);
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(projectRoot, ".claude", "skills", "alpha"))).toBe(false);
    expect(existsSync(join(projectRoot, ".codex", "skills", "alpha", "SKILL.md"))).toBe(true);
  });

  test("cursor-only project still receives claude-surface skills", async () => {
    const { fixture, projectRoot } = await skillProject({
      claude: { enabled: false },
      codex: { enabled: false },
    });
    const result = await runAgentsCli(["write", "--json"], envFor(fixture), projectRoot);
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(projectRoot, ".claude", "skills", "alpha", "SKILL.md"))).toBe(true);
    expect(existsSync(join(projectRoot, ".codex", "skills", "alpha", "SKILL.md"))).toBe(true);
  });
});
