// ABOUTME: Proves the public portable inventory workflow across isolated source and target homes.
// ABOUTME: Covers reproducibility, additive sync, exact verification, extras, conflicts, and state isolation.

import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { readPortableInventoryArtifact } from "../cli/core/inventory-bundle";
import { canonicalJsonBytes } from "../cli/core/inventory-portable";
import { snapshotPortableInventory } from "../cli/core/inventory-transfer";
import { installLooseSkill } from "../cli/core/skill-packages";
import { cleanupTempRoots, createInstalledSkillBundle, envFor, runAgentsCli, scaffoldCliFixture } from "./helpers";
import { seedMcpInventory } from "./mcp-inventory-fixture";

const roots: string[] = [];

afterEach(async () => {
  delete process.env.DRWN_TASK82_E2E_SECRET;
  await cleanupTempRoots(roots);
});

async function buildSourceHome() {
  const source = await scaffoldCliFixture();
  roots.push(source.root);
  const packageRecord = await createInstalledSkillBundle(source.agentsDir, {
    packageName: "@e2e/toolkit",
    version: "2.0.0",
    skillName: "e2e-toolkit",
  });
  const looseRoot = join(source.root, "loose", "e2e-loose");
  await mkdir(looseRoot, { recursive: true });
  await writeFile(join(looseRoot, "SKILL.md"), "---\nname: e2e-loose\ndescription: portable loose skill\n---\n");
  await installLooseSkill({
    agentsDir: source.agentsDir,
    sourcePath: looseRoot,
    existingSkillNames: new Set(["e2e-toolkit"]),
  });
  await seedMcpInventory(source.agentsDir, {
    version: 1,
    servers: {
      "e2e-http": {
        description: "E2E HTTP",
        transport: "http",
        url: "https://e2e.example.test/mcp",
        headers: { Authorization: "${E2E_HTTP_TOKEN}" },
        optional: false,
      },
      "e2e-stdio": {
        description: "E2E stdio",
        transport: "stdio",
        command: "e2e-stdio",
        env: { API_KEY: "${E2E_STDIO_KEY}" },
        optional: true,
      },
    },
  });

  const inactive = join(dirname(packageRecord.packageRoot), "1.0.0");
  await cp(packageRecord.packageRoot, inactive, { recursive: true });
  const inactiveManifest = JSON.parse(await readFile(join(inactive, "bundle.json"), "utf8"));
  inactiveManifest.version = "1.0.0";
  await writeFile(join(inactive, "bundle.json"), `${JSON.stringify(inactiveManifest, null, 2)}\n`);
  await writeFile(join(inactive, "INACTIVE_SENTINEL"), "TASK82_INACTIVE_VERSION\n");

  const storeRoot = join(source.agentsDir, "drwn");
  const sentinels = {
    credentials: join(storeRoot, "credentials.json"),
    projects: join(storeRoot, "projects.json"),
    card: join(storeRoot, "cards", "sentinel.txt"),
    source: join(storeRoot, "sources", "sentinel.txt"),
    generated: join(storeRoot, "generated", "sentinel.txt"),
    cache: join(storeRoot, "extracted", "sentinel.txt"),
  };
  for (const [name, path] of Object.entries(sentinels)) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `TASK82_EXCLUDED_${name}\n`);
  }
  await writeFile(join(storeRoot, "machine.json"), `${JSON.stringify({
    schema: "drwn.machine",
    schemaVersion: 1,
    policy: {},
    capabilities: { profile: null, skills: ["e2e-toolkit"], mcpServers: ["e2e-http"] },
  }, null, 2)}\n`);
  return source;
}

async function newTarget() {
  const target = await scaffoldCliFixture();
  roots.push(target.root);
  return target;
}

test("portable inventory transfers deterministically across isolated homes without state leakage", async () => {
  process.env.DRWN_TASK82_E2E_SECRET = "task82-e2e-known-sensitive-value";
  const source = await buildSourceHome();
  const artifactDir = join(source.root, "artifacts");
  const manifestOne = join(artifactDir, "manifest-one.json");
  const manifestTwo = join(artifactDir, "manifest-two.json");
  const bundleOne = join(artifactDir, "bundle-one.tar.gz");
  const bundleTwo = join(artifactDir, "bundle-two.tar.gz");

  for (const path of [manifestOne, manifestTwo]) {
    const result = await runAgentsCli(["machine", "inventory", "export", "--output", path, "--json"], envFor(source));
    expect(result.exitCode).toBe(0);
  }
  for (const path of [bundleOne, bundleTwo]) {
    const result = await runAgentsCli(["machine", "inventory", "bundle", "--output", path, "--json"], envFor(source));
    expect(result.exitCode).toBe(0);
  }
  expect(await readFile(manifestOne)).toEqual(await readFile(manifestTwo));
  expect(await readFile(bundleOne)).toEqual(await readFile(bundleTwo));

  const staged = await readPortableInventoryArtifact(bundleOne);
  expect(staged.kind).toBe("bundle");
  if (staged.kind !== "bundle") throw new Error("expected bundle");
  try {
    expect(staged.manifestBytes).toEqual(await readFile(manifestOne));
    expect(staged.manifest.entries).toHaveLength(4);
    const archiveText = Buffer.concat(await Promise.all(staged.headers
      .filter((header) => header.type === "File")
      .map((header) => readFile(join(staged.rootDir, ...header.path.split("/")))))).toString();
    expect(archiveText).not.toContain("TASK82_EXCLUDED_");
    expect(archiveText).not.toContain("TASK82_INACTIVE_VERSION");
    expect(archiveText).not.toContain(process.env.DRWN_TASK82_E2E_SECRET);
  } finally {
    await staged.cleanup();
  }

  const fresh = await newTarget();
  const freshSync = await runAgentsCli([
    "machine", "inventory", "sync", "--from", bundleOne, "--json",
  ], envFor(fresh));
  expect(freshSync.exitCode).toBe(0);
  expect(JSON.parse(freshSync.stdout).summary).toEqual({ installed: 4, wouldInstall: 0, identical: 0, extra: 0 });
  expect(existsSync(join(fresh.agentsDir, "drwn", "machine.json"))).toBe(false);
  const sourceSnapshot = await snapshotPortableInventory({ agentsDir: source.agentsDir });
  const freshSnapshot = await snapshotPortableInventory({ agentsDir: fresh.agentsDir });
  expect(canonicalJsonBytes(freshSnapshot.manifest)).toEqual(canonicalJsonBytes(sourceSnapshot.manifest));
  const freshVerify = await runAgentsCli([
    "machine", "inventory", "verify", "--from", bundleOne, "--json",
  ], envFor(fresh));
  expect(freshVerify.exitCode).toBe(0);
  expect(JSON.parse(freshVerify.stdout).exact).toBe(true);
  const retry = await runAgentsCli([
    "machine", "inventory", "sync", "--from", bundleOne, "--json",
  ], envFor(fresh));
  expect(JSON.parse(retry.stdout).summary).toEqual({ installed: 0, wouldInstall: 0, identical: 4, extra: 0 });

  const identical = await newTarget();
  await runAgentsCli(["machine", "inventory", "sync", "--from", bundleOne], envFor(identical));
  const differentMachine = join(identical.agentsDir, "drwn", "machine.json");
  await writeFile(differentMachine, `${JSON.stringify({
    schema: "drwn.machine",
    schemaVersion: 1,
    policy: {},
    capabilities: { profile: null, skills: [], mcpServers: ["e2e-stdio"] },
  }, null, 2)}\n`);
  const machineBefore = await readFile(differentMachine);
  await runAgentsCli(["machine", "inventory", "sync", "--from", bundleOne], envFor(identical));
  expect(await readFile(differentMachine)).toEqual(machineBefore);

  const extra = await newTarget();
  await createInstalledSkillBundle(extra.agentsDir, { packageName: "extra-e2e", skillName: "extra-e2e-skill" });
  const extraSync = await runAgentsCli([
    "machine", "inventory", "sync", "--from", bundleOne, "--json",
  ], envFor(extra));
  expect(extraSync.exitCode).toBe(0);
  expect(JSON.parse(extraSync.stdout).summary.extra).toBe(1);
  expect(existsSync(join(extra.agentsDir, "drwn", "skills", "extra-e2e", "current"))).toBe(true);

  const packageConflict = await newTarget();
  await createInstalledSkillBundle(packageConflict.agentsDir, {
    packageName: "@e2e/toolkit",
    version: "9.0.0",
    skillName: "e2e-toolkit",
  });
  const packageBefore = canonicalJsonBytes((await snapshotPortableInventory({ agentsDir: packageConflict.agentsDir })).manifest);
  const packageFailure = await runAgentsCli([
    "machine", "inventory", "sync", "--from", bundleOne,
  ], envFor(packageConflict));
  expect(packageFailure.exitCode).not.toBe(0);
  expect(canonicalJsonBytes((await snapshotPortableInventory({ agentsDir: packageConflict.agentsDir })).manifest)).toEqual(packageBefore);

  const mcpConflict = await newTarget();
  await seedMcpInventory(mcpConflict.agentsDir, {
    version: 1,
    servers: {
      "e2e-http": {
        description: "Conflicting E2E HTTP",
        transport: "http",
        url: "https://conflicting.example.test/mcp",
        optional: false,
      },
    },
  });
  const mcpBefore = canonicalJsonBytes((await snapshotPortableInventory({ agentsDir: mcpConflict.agentsDir })).manifest);
  const mcpFailure = await runAgentsCli(["machine", "inventory", "sync", "--from", bundleOne], envFor(mcpConflict));
  expect(mcpFailure.exitCode).not.toBe(0);
  expect(canonicalJsonBytes((await snapshotPortableInventory({ agentsDir: mcpConflict.agentsDir })).manifest)).toEqual(mcpBefore);

  const immutableCollision = await newTarget();
  const repoSkill = join(immutableCollision.repoRoot, "skills", "shared", "e2e-toolkit");
  await mkdir(repoSkill, { recursive: true });
  await writeFile(join(repoSkill, "SKILL.md"), "---\nname: e2e-toolkit\ndescription: collision\n---\n");
  const registryPath = join(immutableCollision.repoRoot, "registry", "mcp-servers.json");
  const registry = JSON.parse(await readFile(registryPath, "utf8"));
  registry.servers["e2e-http"] = {
    description: "Registry collision",
    transport: "http",
    url: "https://registry.example.test/mcp",
    optional: false,
  };
  await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
  const collisionFailure = await runAgentsCli([
    "machine", "inventory", "sync", "--from", bundleOne,
  ], envFor(immutableCollision));
  expect(collisionFailure.exitCode).not.toBe(0);
  expect(existsSync(join(immutableCollision.agentsDir, "drwn"))).toBe(false);
});
