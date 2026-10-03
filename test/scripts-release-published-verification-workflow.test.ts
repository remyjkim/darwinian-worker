// ABOUTME: Guards the read-only, reviewed-main verifier for the already-published v1.4.2 candidate.
// ABOUTME: Keeps recovery authorization separate from npm publishing and the immutable release tag.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const workflowPath = join(import.meta.dir, "..", ".github", "workflows", "release-verify-published.yml");
const workflow = existsSync(workflowPath) ? readFileSync(workflowPath, "utf8") : "";
const releaseProcess = readFileSync(join(import.meta.dir, "..", "docs", "release-process.md"), "utf8");
const publishing = readFileSync(join(import.meta.dir, "..", "docs", "maintainers", "publishing.md"), "utf8");

describe("Worker published-candidate verification workflow", () => {
  test("has a dedicated workflow rather than mutating the frozen v1.4.2 recovery", () => {
    expect(existsSync(workflowPath)).toBe(true);
  });

  test("dispatches from reviewed main behind a distinct read-only approval environment", () => {
    expect(workflow).toContain('GITHUB_REF" != "refs/heads/main"');
    expect(workflow).toContain("name: darwinian-release-verification");
    expect(workflow).toContain("actions: read");
    expect(workflow).not.toContain("darwinian-npm-publish");
    for (const forbidden of [
      "id-token: write",
      "NODE_AUTH_TOKEN",
      "NPM_TOKEN",
      "npm publish",
      "npm dist-tag",
      "npm pack",
      "git tag ",
      "git push ",
      "gh release create",
      "contents: write",
    ]) {
      expect(workflow).not.toContain(forbidden);
    }
  });

  test("joins the failed run, immutable tag, and exact retained dry-run artifact", () => {
    expect(workflow).toContain("release-cli.ts parse-recovery-authorization");
    expect(workflow).toContain('git cat-file -t "refs/tags/v1.4.2"');
    expect(workflow).toContain("release-cli.ts parse-tag-authorization");
    expect(workflow).toContain('actions/runs/$FAILED_RUN_ID');
    expect(workflow).toContain('actions/runs/$RUN_ID/attempts/$RUN_ATTEMPT/jobs');
    expect(workflow).toContain('actions/artifacts/$ARTIFACT_ID/zip');
    expect(workflow).toContain('sha256sum "$RUNNER_TEMP/candidate.zip"');
    expect(workflow).toContain("release-cli.ts requalify-artifact");
    expect(workflow).toContain("release-cli.ts verify-recovery-provenance");
    expect(workflow).not.toContain("actions/runs/${{ inputs.failed_run_id }}");
  });

  test("waits for the actual registry tar and checks its bytes before installed smokes", () => {
    expect(workflow).toContain("i336-candidate");
    expect(workflow).toContain("https://registry.npmjs.org/darwinian/-/darwinian-1.4.2.tgz");
    expect(workflow).toContain("release-cli.ts verify-registry");
    expect(workflow).not.toContain("--require-git-head");
    expect(workflow).toContain("curl --fail --location --proto '=https'");
    expect(workflow).toContain('sha256sum "$RUNNER_TEMP/published/darwinian-1.4.2.tgz"');
    expect(workflow).toContain("release-cli.ts smoke-artifact");
    expect(workflow).toContain("runs-on: macos-latest");
    expect(workflow).not.toContain("npm pack");
  });

  test("passes only verified artifact outputs into the dependent macOS job", () => {
    expect(workflow).toContain("artifact_id: ${{ steps.provenance.outputs.artifact_id }}");
    expect(workflow).toContain("artifact_digest: ${{ steps.provenance.outputs.artifact_digest }}");
    expect(workflow).toContain("tar_sha256: ${{ steps.registry.outputs.tar_sha256 }}");
    expect(workflow).toContain("needs: [verify_ubuntu]");
    expect(workflow).toContain("ARTIFACT_ID=\"${{ needs.verify_ubuntu.outputs.artifact_id }}\"");
    expect(workflow).toContain("AUTH_DIGEST=\"${{ needs.verify_ubuntu.outputs.artifact_digest }}\"");
  });

  test("retains an evidence receipt only after both installed platform checks succeed", () => {
    expect(workflow).toContain("needs: [verify_ubuntu, verify_macos]");
    expect(workflow).toContain('test "$UBUNTU_SHA" = "$MACOS_SHA"');
    expect(workflow).toContain("darwinian-worker-i448-published-verification");
    expect(workflow).toContain("actions/upload-artifact@v4");
    expect(workflow).toContain("darwinian.worker.published-candidate-verification");
    expect(workflow).toContain("observedAt: $observedAt");
    expect(workflow).toContain("sourceCommit: $sourceCommit");
    expect(workflow).toContain("artifactDigest: $artifactDigest");
    expect(workflow).toContain("runUrl: $runUrl");
  });

  test("documents the new no-publish lane without treating a red run as a green release", () => {
    expect(releaseProcess).toContain("release-verify-published.yml");
    expect(releaseProcess).toContain("darwinian-release-verification");
    expect(publishing).toContain("release-verify-published.yml");
    expect(publishing).toContain("absent registry `gitHead`");
  });
});
