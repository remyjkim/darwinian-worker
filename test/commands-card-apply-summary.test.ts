// ABOUTME: Verifies card apply prints content summaries for trust review.
// ABOUTME: Guards skills, MCP servers, and hook consent reporting on apply.

import { afterEach, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { applyProjectCardSpecs } from "../cli/core/card-project";
import { buildApplyContentSummary } from "../cli/core/card-apply-summary";
import { cleanupTempRoots, envFor, publishCardWithSkills, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function createProjectDir(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
  return projectDir;
}

test("buildApplyContentSummary lists skills, MCP servers, and hook consent", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, {
    name: "@me/backend",
    skills: ["alpha"],
    servers: {
      context7: { enabled: true },
    },
  });
  const projectDir = await createProjectDir(fixture);
  const mutation = await applyProjectCardSpecs(projectDir, fixture.agentsDir, ["@me/backend@1.0.0"], {
    repoRoot: fixture.repoRoot,
    cwd: projectDir,
  });
  const summary = buildApplyContentSummary(mutation.locked[0]!, null);
  expect(summary).toContain("Skills:");
  expect(summary).toContain("alpha");
  expect(summary).toContain("MCP servers:");
  expect(summary).toContain("context7");
});

test("card apply prints a content summary on first apply", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/backend", skills: ["alpha"] });
  const projectDir = await createProjectDir(fixture);
  await writeFile(join(projectDir, ".agents", "drwn", "config.json"), JSON.stringify({ version: 1 }, null, 2) + "\n");
  const result = await runAgentsCli(["card", "apply", "@me/backend@1.0.0"], envFor(fixture), projectDir);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Content summary:");
  expect(result.stdout).toContain("alpha");
});

test("card apply update path mentions changed skills via diff", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/backend", version: "1.0.0", skills: ["alpha"] });
  const projectDir = await createProjectDir(fixture);
  await writeFile(join(projectDir, ".agents", "drwn", "config.json"), JSON.stringify({ version: 1 }, null, 2) + "\n");
  await runAgentsCli(["card", "apply", "@me/backend@1.0.0"], envFor(fixture), projectDir);
  await publishCardWithSkills(fixture, { name: "@me/backend", version: "1.1.0", skills: ["alpha", "beta"] });
  const update = await runAgentsCli(["card", "apply", "@me/backend@1.1.0"], envFor(fixture), projectDir);
  expect(update.exitCode).toBe(0);
  expect(update.stdout).toContain("Content summary:");
  expect(update.stdout).toContain("beta");
});
