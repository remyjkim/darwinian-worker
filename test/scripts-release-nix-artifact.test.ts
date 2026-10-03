// ABOUTME: Guards the additive Nix-built source-tar experiment against publication authority.
// ABOUTME: Requires the existing qualifier and installed smoke to judge the one produced tar.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

describe("Nix Worker artifact experiment", () => {
  test("has a separate source package definition", () => {
    expect(existsSync(join(root, "nix", "worker-artifact.nix"))).toBe(true);
  });

  test("selects only packaged source and binds a clean commit to an offline npm tar", () => {
    const nix = readFileSync(join(root, "nix", "worker-artifact.nix"), "utf8");
    const flake = readFileSync(join(root, "flake.nix"), "utf8");
    expect(nix).toContain("lib.fileset.toSource");
    for (const member of [
      'repoRoot + "/cli"',
      'repoRoot + "/registry"',
      'repoRoot + "/skills"',
      'repoRoot + "/package.json"',
      'repoRoot + "/docs/assets/darwinian-worker-logo.png"',
    ]) {
      expect(nix).toContain(member);
    }
    expect(nix).toContain('NPM_CONFIG_OFFLINE = "true"');
    expect(nix).toContain("darwinian.worker.build-identity");
    expect(nix).toContain("sourceCommit");
    expect(nix).toContain("npm pack --ignore-scripts --json");
    expect(nix).toContain('> "$out/npm-pack.json"');
    expect(nix).not.toContain("npm publish");
    expect(nix).not.toContain("npm dist-tag");
    expect(flake).toContain("workerArtifact = import ./nix/worker-artifact.nix");
    expect(flake).toContain("self.rev");
  });

  test("qualifies and smokes the one Nix output without publishing", () => {
    const path = join(root, "scripts", "verify-nix-artifact.sh");
    expect(existsSync(path)).toBe(true);
    const script = existsSync(path) ? readFileSync(path, "utf8") : "";
    expect(script).toContain("release-cli.ts qualify-artifact");
    expect(script).toContain("release-cli.ts smoke-artifact");
    expect(script).toContain("artifact-sha256");
    expect(script).toContain('cp "$DRWN_NIX_ARTIFACT_DIR/npm-pack.json"');
    expect(script).not.toContain("npm publish");
    expect(script).not.toContain("npm dist-tag");
  });

  test("adds unprivileged Ubuntu build and macOS downloaded-tar checks to CI", () => {
    const ci = readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8");
    expect(ci).toContain("nix-artifact-experiment:");
    expect(ci).toContain("nix-artifact-macos:");
    const experiment = ci.split("  nix-artifact-experiment:")[1] ?? "";
    expect(experiment).toContain("permissions:\n      contents: read");
    expect(experiment).toContain("ref: ${{ github.event.pull_request.head.sha || github.sha }}");
    expect(experiment).toContain("build --no-link");
    expect(experiment).toContain("--no-update-lock-file --print-out-paths .#workerArtifact");
    expect(experiment).toContain("scripts/verify-nix-artifact.sh");
    expect(experiment).toContain("actions/upload-artifact@v4");
    expect(experiment).toContain("actions/download-artifact@v4");
    expect(experiment).toContain("release-cli.ts qualify-artifact");
    expect(experiment).toContain("release-cli.ts smoke-artifact");
    for (const forbidden of ["id-token: write", "NPM_TOKEN", "secrets.", "npm publish", "npm dist-tag"]) {
      expect(experiment).not.toContain(forbidden);
    }
  });

  test("documents the clean-commit, no-publish experiment boundary", () => {
    const guide = readFileSync(join(root, "docs", "nix-toolchain.md"), "utf8");
    expect(guide).toContain(".#workerArtifact");
    expect(guide).toContain("clean Git commit");
    expect(guide).toContain("NPM_CONFIG_OFFLINE");
    expect(guide).toContain("nix-worker-artifact-experiment");
    expect(guide).toContain("not the published 1.4.2 tar");
  });
});
