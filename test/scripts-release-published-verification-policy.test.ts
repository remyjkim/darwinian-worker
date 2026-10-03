// ABOUTME: Runs the actual jq predicates used before approving published-candidate verification.
// ABOUTME: Rejects an unprotected environment, wrong failed run, and mismatched release jobs.

import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const root = join(import.meta.dir, "..", "scripts", "release");
const sourceCommit = "430d04b04015d6f0ee1bc57d5374b80381697fc6";

function accepts(file: string, input: unknown, variables: string[] = []): boolean {
  const result = spawnSync("jq", ["-e", ...variables, "-f", join(root, file)], {
    input: JSON.stringify(input),
    encoding: "utf8",
  });
  return result.status === 0;
}

const environment = {
  name: "darwinian-release-verification",
  can_admins_bypass: false,
  deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
  protection_rules: [
    {
      type: "required_reviewers",
      prevent_self_review: true,
      reviewers: [{ type: "User", reviewer: { login: "mind001-cl" } }],
    },
    { type: "branch_policy" },
  ],
};

const branches = {
  total_count: 1,
  branch_policies: [{ name: "main", type: "branch" }],
};

const failedRun = {
  id: 37105684003,
  run_attempt: 1,
  path: ".github/workflows/release.yml",
  event: "push",
  head_branch: "v1.4.2",
  head_sha: sourceCommit,
  conclusion: "failure",
};
const runArgs = ["--arg", "commit", sourceCommit, "--arg", "runId", "37105684003"];

describe("published-candidate external policy predicates", () => {
  test("accepts only the exact protected verification environment", () => {
    expect(accepts("published-verification-environment.jq", environment)).toBe(true);
    expect(accepts("published-verification-environment.jq", { ...environment, can_admins_bypass: true })).toBe(false);
    expect(accepts("published-verification-environment.jq", {
      ...environment,
      protection_rules: [{ ...environment.protection_rules[0], prevent_self_review: false }],
    })).toBe(false);
    expect(accepts("published-verification-environment.jq", {
      ...environment,
      protection_rules: [{ ...environment.protection_rules[0], reviewers: [{ reviewer: { login: "remyjkim" } }] }],
    })).toBe(false);
  });

  test("accepts one main branch policy and rejects broader deployment", () => {
    expect(accepts("published-verification-branches.jq", branches)).toBe(true);
    expect(accepts("published-verification-branches.jq", { ...branches, total_count: 0, branch_policies: [] })).toBe(false);
    expect(accepts("published-verification-branches.jq", {
      total_count: 2,
      branch_policies: [...branches.branch_policies, { name: "*", type: "branch" }],
    })).toBe(false);
  });

  test("pins the failed canonical run and first attempt", () => {
    expect(accepts("published-verification-failed-run.jq", failedRun, runArgs)).toBe(true);
    expect(accepts("published-verification-failed-run.jq", { ...failedRun, id: 37105684004 }, runArgs)).toBe(false);
    expect(accepts("published-verification-failed-run.jq", { ...failedRun, run_attempt: 2 }, runArgs)).toBe(false);
    expect(accepts("published-verification-failed-run.jq", { ...failedRun, head_sha: "a".repeat(40) }, runArgs)).toBe(false);
  });

  test("requires one successful tag validation and one failed publish-verification job", () => {
    const jobs = { jobs: [
      { name: "Validate authorized tag", conclusion: "success" },
      { name: "Publish I336 candidate to npm", conclusion: "failure" },
    ] };
    expect(accepts("published-verification-failed-jobs.jq", jobs)).toBe(true);
    expect(accepts("published-verification-failed-jobs.jq", {
      jobs: [{ name: "Validate authorized tag", conclusion: "success" }],
    })).toBe(false);
    expect(accepts("published-verification-failed-jobs.jq", {
      jobs: [...jobs.jobs, jobs.jobs[1]],
    })).toBe(false);
  });

  test("requires a recorded approval by the exact reviewer for this environment", () => {
    const approval = {
      state: "approved",
      user: { login: "mind001-cl" },
      environments: [{ name: "darwinian-release-verification" }],
    };
    expect(accepts("published-verification-approval.jq", [approval])).toBe(true);
    expect(accepts("published-verification-approval.jq", [])).toBe(false);
    expect(accepts("published-verification-approval.jq", [
      { ...approval, user: { login: "remyjkim" } },
    ])).toBe(false);
    expect(accepts("published-verification-approval.jq", [
      { ...approval, environments: [{ name: "darwinian-npm-publish" }] },
    ])).toBe(false);
    expect(accepts("published-verification-approval.jq", [approval, approval])).toBe(false);
  });
});
