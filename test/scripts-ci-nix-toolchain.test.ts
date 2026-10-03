// ABOUTME: Requires a locked, additive Nix tooling pilot without changing release permissions.
// ABOUTME: Keeps Bun and Node choices explicit while the existing CI remains canonical.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

describe("Nix CI toolchain pilot", () => {
  test("declares a root flake and a committed dependency lock", () => {
    expect(existsSync(join(root, "flake.nix"))).toBe(true);
    expect(existsSync(join(root, "flake.lock"))).toBe(true);
  });

  test("pins one Nixpkgs input and exact Bun sources on supported systems", () => {
    const flake = readFileSync(join(root, "flake.nix"), "utf8");
    const lock = JSON.parse(readFileSync(join(root, "flake.lock"), "utf8"));
    expect(Object.keys(lock.nodes).sort()).toEqual(["nixpkgs", "root"]);
    expect(lock.nodes.nixpkgs.locked.rev).toBe("774debe7a0d1b496e35677ad955a1011c6ff74f3");
    for (const system of ["x86_64-linux", "aarch64-darwin", "x86_64-darwin"]) {
      expect(flake).toContain(system);
    }
    expect(flake).toContain('version = "1.2.21"');
    expect(flake).toContain("pkgs.nodejs_24");
    expect(flake).toContain("sha256-WU9FTVHOVxmdQyDIXL1JW+nAVO8XquvKXmyQir/aYXk=");
    expect(flake).toContain("sha256-/YhmMLoVxIQjatXz8islXSh8Pu+NO8JvyAmFEDXATOw=");
    expect(flake).toContain("sha256-Qm1N3h5Rg0aNMf+G7RPAjW8p7wlcia5QtfX1IP3u2RY=");
  });

  test("runs fresh checks under the exact tooling without changing either lock", () => {
    const path = join(root, "scripts", "ci-nix-toolchain.sh");
    expect(existsSync(path)).toBe(true);
    const script = existsSync(path) ? readFileSync(path, "utf8") : "";
    expect(script).toContain('test "$(bun --version)" = "1.2.21"');
    expect(script).toContain('test "$(node --version)" = "v24.21.0"');
    expect(script).toContain('test "$(npm --version)" = "11.19.0"');
    expect(script).toContain("bun install --frozen-lockfile");
    expect(script).toContain('DRWN_BUN_BIN_DIR="$(mktemp -d');
    expect(script).toContain('export BUN_INSTALL_BIN="$DRWN_BUN_BIN_DIR/bin"');
    expect(script).toContain('export BUN_INSTALL_GLOBAL_DIR="$DRWN_BUN_BIN_DIR/global"');
    expect(script).toContain('export PATH="$BUN_INSTALL_BIN:$PATH"');
    expect(script).not.toContain("bun pm bin -g");
    expect(script).toContain("bun link");
    expect(script).toContain('test -L "$BUN_INSTALL_BIN/drwn"');
    expect(script).toContain('test -L "$BUN_INSTALL_GLOBAL_DIR/node_modules/darwinian"');
    expect(script).toContain("bun run typecheck");
    expect(script).toContain("bun run test:gate");
    expect(script).toContain("git diff --exit-code -- bun.lock flake.lock");
    expect(script).not.toContain("npm publish");
  });

  test("adds an unprivileged, additive Nix matrix to existing CI", () => {
    const ci = readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8");
    expect(ci).toContain("nix-toolchain:");
    expect(ci).toContain("cachix/install-nix-action@13d8dd58da0234aa297dedd986986ccb8e7f3e24");
    expect(ci).toContain("nix --extra-experimental-features 'nix-command flakes' develop --no-update-lock-file");
    expect(ci).toContain("scripts/ci-nix-toolchain.sh");
    expect(ci).toContain("management-artifact:");
    const nixJob = ci.split("  nix-toolchain:")[1] ?? "";
    expect(nixJob).toContain("ref: ${{ github.event.pull_request.head.sha || github.sha }}");
    expect(nixJob).toContain("permissions:\n      contents: read");
    expect(nixJob).toContain("os: [ubuntu-latest, macos-latest]");
    for (const forbidden of [
      "id-token: write",
      "contents: write",
      "secrets.",
      "NPM_TOKEN",
      "npm publish",
      "npm dist-tag",
      "CACHIX_AUTH_TOKEN",
      "CACHIX_SIGNING_KEY",
      "cachix/cachix-action",
    ]) {
      expect(nixJob).not.toContain(forbidden);
    }
  });

  test("documents the two locks and keeps release publication separate", () => {
    const path = join(root, "docs", "nix-toolchain.md");
    expect(existsSync(path)).toBe(true);
    const guide = existsSync(path) ? readFileSync(path, "utf8") : "";
    expect(guide).toContain("flake.lock");
    expect(guide).toContain("bun.lock");
    expect(guide).toContain("--no-update-lock-file");
    expect(guide).toContain("darwinian-npm-publish");
    expect(guide).toContain("NIX_SSL_CERT_FILE");
  });
});
