// ABOUTME: Exercises the public portable inventory export, bundle, verify, and sync commands.
// ABOUTME: Pins required options, deterministic reports, exit semantics, and fresh-home isolation.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createPortableInventoryBundle } from "../cli/core/inventory-bundle";
import { cleanupTempRoots, createInstalledSkillBundle, envFor, runAgentsCli, scaffoldCliFixture } from "./helpers";
import { seedMcpInventory } from "./mcp-inventory-fixture";

const roots: string[] = [];

afterEach(async () => cleanupTempRoots(roots));

async function sourceFixture() {
  const source = await scaffoldCliFixture();
  roots.push(source.root);
  await createInstalledSkillBundle(source.agentsDir, {
    packageName: "command-portable",
    skillName: "command-portable-skill",
  });
  await seedMcpInventory(source.agentsDir, {
    version: 1,
    servers: {
      "command-portable-mcp": {
        description: "Command portable",
        transport: "stdio",
        command: "command-portable-mcp",
        env: { API_TOKEN: "${COMMAND_PORTABLE_TOKEN}" },
        optional: false,
      },
    },
  });
  return source;
}

describe("machine inventory transfer commands", () => {
  test("requires explicit output and source options", async () => {
    const fixture = await scaffoldCliFixture();
    roots.push(fixture.root);
    for (const args of [
      ["machine", "inventory", "export"],
      ["machine", "inventory", "bundle"],
      ["machine", "inventory", "verify"],
      ["machine", "inventory", "sync"],
    ]) {
      const result = await runAgentsCli(args, envFor(fixture));
      expect(result.exitCode).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toMatch(/required|--output|--from/i);
    }
  });

  test("exports canonical metadata and deterministic bundles with JSON and human reports", async () => {
    const source = await sourceFixture();
    const manifestPath = join(source.root, "out", "manifest.data");
    const bundlePath = join(source.root, "out", "bundle.data");

    const exported = await runAgentsCli([
      "machine", "inventory", "export", "--output", manifestPath, "--json",
    ], envFor(source));
    const bundled = await runAgentsCli([
      "machine", "inventory", "bundle", "--output", bundlePath, "--json",
    ], envFor(source));

    expect(exported.exitCode).toBe(0);
    expect(bundled.exitCode).toBe(0);
    expect(JSON.parse(exported.stdout)).toMatchObject({
      action: "written",
      manifestSha256: expect.stringMatching(/^sha256-[a-f0-9]{64}$/),
      manifest: { schema: "drwn.portable-inventory", schemaVersion: 1 },
    });
    expect(JSON.parse(bundled.stdout)).toMatchObject({
      action: "written",
      manifestSha256: JSON.parse(exported.stdout).manifestSha256,
      archiveSha256: expect.stringMatching(/^sha256-[a-f0-9]{64}$/),
    });
    expect(existsSync(manifestPath)).toBe(true);
    expect(existsSync(bundlePath)).toBe(true);

    const unchanged = await runAgentsCli([
      "machine", "inventory", "export", "--output", manifestPath,
    ], envFor(source));
    expect(unchanged.exitCode).toBe(0);
    expect(unchanged.stdout).toMatch(/unchanged/i);
  });

  test("verify exits zero only for exact inventory and emits drift as JSON with exit one", async () => {
    const source = await sourceFixture();
    const target = await scaffoldCliFixture();
    roots.push(target.root);
    const manifestPath = join(source.root, "manifest.json");
    const bundlePath = join(source.root, "bundle.tar.gz");
    await runAgentsCli(["machine", "inventory", "export", "--output", manifestPath], envFor(source));
    await runAgentsCli(["machine", "inventory", "bundle", "--output", bundlePath], envFor(source));

    const exact = await runAgentsCli([
      "machine", "inventory", "verify", "--from", manifestPath, "--json",
    ], envFor(source));
    const drift = await runAgentsCli([
      "machine", "inventory", "verify", "--from", bundlePath, "--json",
    ], envFor(target));

    expect(exact.exitCode).toBe(0);
    expect(JSON.parse(exact.stdout)).toMatchObject({ exact: true, summary: { missing: 0, conflicting: 0, extra: 0 } });
    expect(drift.exitCode).toBe(1);
    expect(JSON.parse(drift.stdout)).toMatchObject({ exact: false, summary: { missing: 2, conflicting: 0, extra: 0 } });
  });

  test("sync dry-run is pure and real sync creates only inactive inventory", async () => {
    const source = await sourceFixture();
    const target = await scaffoldCliFixture();
    roots.push(target.root);
    const bundlePath = join(source.root, "bundle.tar.gz");
    await createPortableInventoryBundle({ agentsDir: source.agentsDir, outputPath: bundlePath });
    const storeRoot = join(target.agentsDir, "drwn");

    const dryRun = await runAgentsCli([
      "machine", "inventory", "sync", "--from", bundlePath, "--dry-run", "--json",
    ], envFor(target));
    expect(dryRun.exitCode).toBe(0);
    expect(JSON.parse(dryRun.stdout)).toMatchObject({ dryRun: true, summary: { wouldInstall: 2 } });
    expect(existsSync(storeRoot)).toBe(false);

    const synced = await runAgentsCli([
      "machine", "inventory", "sync", "--from", bundlePath, "--json",
    ], envFor(target));
    expect(synced.exitCode).toBe(0);
    expect(JSON.parse(synced.stdout)).toMatchObject({ dryRun: false, summary: { installed: 2 } });
    expect(existsSync(join(storeRoot, "machine.json"))).toBe(false);
    expect(existsSync(join(storeRoot, "skills", "command-portable", "current"))).toBe(true);
    expect(existsSync(join(storeRoot, "mcp-servers", "command-portable-mcp.json"))).toBe(true);
  });

  test("invalid artifacts, output overwrite, and sync conflicts fail without partial mutation", async () => {
    const source = await sourceFixture();
    const target = await scaffoldCliFixture();
    roots.push(target.root);
    const invalid = join(source.root, "invalid.data");
    await writeFile(invalid, "not portable\n");
    const invalidResult = await runAgentsCli([
      "machine", "inventory", "verify", "--from", invalid,
    ], envFor(target));
    expect(invalidResult.exitCode).not.toBe(0);
    expect(`${invalidResult.stdout}\n${invalidResult.stderr}`).toContain("Portable inventory artifact");

    const output = join(source.root, "existing.json");
    await writeFile(output, "foreign\n");
    const overwrite = await runAgentsCli([
      "machine", "inventory", "export", "--output", output,
    ], envFor(source));
    expect(overwrite.exitCode).not.toBe(0);
    expect(`${overwrite.stdout}\n${overwrite.stderr}`).toMatch(/already exists/i);
    expect(await readFile(output, "utf8")).toBe("foreign\n");

    await createInstalledSkillBundle(target.agentsDir, {
      packageName: "command-portable",
      version: "9.0.0",
      skillName: "command-portable-skill",
    });
    const bundlePath = join(source.root, "conflict.tar.gz");
    await createPortableInventoryBundle({ agentsDir: source.agentsDir, outputPath: bundlePath });
    const conflict = await runAgentsCli([
      "machine", "inventory", "sync", "--from", bundlePath, "--json",
    ], envFor(target));
    expect(conflict.exitCode).not.toBe(0);
    expect(`${conflict.stdout}\n${conflict.stderr}`).toMatch(/blocking conflict/i);
    expect(existsSync(join(target.agentsDir, "drwn", "mcp-servers", "command-portable-mcp.json"))).toBe(false);
  });

  test("command artifact staging is removed on success and failure", async () => {
    const source = await sourceFixture();
    const target = await scaffoldCliFixture();
    roots.push(target.root);
    const bundlePath = join(source.root, "bundle.tar.gz");
    await createPortableInventoryBundle({ agentsDir: source.agentsDir, outputPath: bundlePath });
    const staging = async () => new Set((await readdir(tmpdir())).filter((name) => name.startsWith("drwn-inventory-validate-")));
    const before = await staging();

    await runAgentsCli(["machine", "inventory", "verify", "--from", bundlePath], envFor(target));
    await runAgentsCli(["machine", "inventory", "sync", "--from", bundlePath, "--dry-run"], envFor(target));
    const after = await staging();

    expect(after).toEqual(before);
  });
});
