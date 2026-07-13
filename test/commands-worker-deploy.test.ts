// ABOUTME: Verifies project-aware worker deploy preflight through the CLI boundary.
// ABOUTME: Invalid project entrypoints fail locally with stable codes before any Deploy API request.

import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import {
  cleanupTempRoots,
  envFor,
  installProjectWorkers,
  publishCardWithSkills,
  runAgentsCli,
  scaffoldCliFixture,
} from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => cleanupTempRoots(tempRoots));

test("worker deploy rejects an inactive project root before contacting the API", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/active", skills: ["alpha"] });
  await publishCardWithSkills(fixture, { name: "@me/inactive", skills: ["beta"] });
  const projectRoot = join(fixture.root, "project");
  await installProjectWorkers(
    projectRoot,
    fixture.agentsDir,
    ["@me/active@1.0.0", "@me/inactive@1.0.0"],
    "@me/active",
  );

  const result = await runAgentsCli(
    ["worker", "deploy", "@me/inactive@1.0.0", "--name", "inactive"],
    {
      ...envFor(fixture),
      DRWN_TOKEN: "test-token",
      DRWN_STUDIO_API_URL: "http://127.0.0.1:1",
    },
    projectRoot,
  );

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("WORKER_DEPLOY_ROOT_NOT_ACTIVE");
  expect(result.stderr).not.toContain("Cannot reach Deploy API");
});
