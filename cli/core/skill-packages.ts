// ABOUTME: Loads, validates, discovers, and ingests package-backed skill bundles into ~/.agents state.
// ABOUTME: Uses npm pack plus tar extraction so extension bundles stay content-oriented and source-inspectable.

import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { mkdtemp, readdir, readlink, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import {
  resolveSkillPackageCurrentLink,
  resolveSkillPackageRoot,
  resolveSkillPackagesRoot,
  resolveSkillPackageVersionRoot,
} from "./paths";
import {
  resolveStoreMetadataPath,
  resolveStoreSkillPackageCurrentLink,
  resolveStoreSkillPackageRoot,
  resolveStoreSkillPackagesRoot,
  resolveStoreSkillPackageVersionRoot,
} from "./store-paths";
import type { BundleManifest, InstalledSkillBundle } from "./types";

export async function loadBundleManifest(bundleRoot: string): Promise<BundleManifest> {
  const manifestPath = join(bundleRoot, "bundle.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Missing bundle.json at ${bundleRoot}`);
  }
  return JSON.parse(readFileSync(manifestPath, "utf8")) as BundleManifest;
}

function useStoreSkillLayout(agentsDir: string) {
  return existsSync(resolveStoreMetadataPath(agentsDir));
}

function activeSkillPackagesRoot(agentsDir: string) {
  return useStoreSkillLayout(agentsDir)
    ? resolveStoreSkillPackagesRoot(agentsDir)
    : resolveSkillPackagesRoot(agentsDir);
}

function activeSkillPackageRoot(agentsDir: string, packageName: string) {
  return useStoreSkillLayout(agentsDir)
    ? resolveStoreSkillPackageRoot(agentsDir, packageName)
    : resolveSkillPackageRoot(agentsDir, packageName);
}

function activeSkillPackageVersionRoot(agentsDir: string, packageName: string, version: string) {
  return useStoreSkillLayout(agentsDir)
    ? resolveStoreSkillPackageVersionRoot(agentsDir, packageName, version)
    : resolveSkillPackageVersionRoot(agentsDir, packageName, version);
}

function activeSkillPackageCurrentLink(agentsDir: string, packageName: string) {
  return useStoreSkillLayout(agentsDir)
    ? resolveStoreSkillPackageCurrentLink(agentsDir, packageName)
    : resolveSkillPackageCurrentLink(agentsDir, packageName);
}

function isWithinRoot(root: string, candidatePath: string) {
  const rel = relative(root, candidatePath);
  return rel === "" || (!rel.startsWith("..") && rel !== "..");
}

export async function validateBundleManifest(
  bundleRoot: string,
  manifest: BundleManifest,
  existingSkillNames: Set<string>,
  packageName: string,
  version: string,
) {
  if (manifest.schemaVersion !== 1) {
    throw new Error(`Unsupported bundle schema version: ${manifest.schemaVersion}`);
  }
  if (manifest.bundleName !== packageName) {
    throw new Error(`Bundle name mismatch: expected ${packageName}, got ${manifest.bundleName}`);
  }
  if (manifest.version !== version) {
    throw new Error(`Bundle version mismatch: expected ${version}, got ${manifest.version}`);
  }

  for (const skill of manifest.skills) {
    if (!skill.name || !skill.scope || !skill.path) {
      throw new Error(`Invalid bundle skill entry in ${packageName}`);
    }
    if (skill.name.includes("/") || skill.name.includes("\\") || skill.name === "." || skill.name === "..") {
      throw new Error(`Invalid skill name: ${skill.name}`);
    }
    if (existingSkillNames.has(skill.name)) {
      throw new Error(`Skill name collision: ${skill.name}`);
    }

    const skillPath = resolve(bundleRoot, skill.path);
    if (!isWithinRoot(bundleRoot, skillPath)) {
      throw new Error(`Invalid skill path outside bundle root: ${skill.path}`);
    }
    if (!existsSync(skillPath)) {
      throw new Error(`Missing skill path: ${skill.path}`);
    }
    if (!existsSync(join(skillPath, "SKILL.md"))) {
      throw new Error(`Missing SKILL.md for skill ${skill.name}`);
    }
  }
}

export async function listInstalledSkillBundles(agentsDir: string): Promise<InstalledSkillBundle[]> {
  const packagesRoot = activeSkillPackagesRoot(agentsDir);
  if (!existsSync(packagesRoot)) {
    return [];
  }

  const bundles: InstalledSkillBundle[] = [];

  async function walk(dirPath: string): Promise<void> {
    const currentPath = join(dirPath, "current");
    if (existsSync(currentPath)) {
      const activeVersion = basename(await readlink(currentPath));
      const versionRoot = join(dirPath, activeVersion);
      const manifest = await loadBundleManifest(versionRoot);
      bundles.push({
        packageName: relative(packagesRoot, dirPath).replaceAll("\\", "/"),
        activeVersion,
        packageRoot: dirPath,
        versionRoot,
        manifest,
      });
      return;
    }

    for (const entry of await readdir(dirPath, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        await walk(join(dirPath, entry.name));
      }
    }
  }

  await walk(packagesRoot);
  return bundles.sort((a, b) => a.packageName.localeCompare(b.packageName));
}

export async function getInstalledSkillBundle(agentsDir: string, packageName: string) {
  const packageRoot = activeSkillPackageRoot(agentsDir, packageName);
  const currentPath = activeSkillPackageCurrentLink(agentsDir, packageName);
  if (!existsSync(packageRoot) || !existsSync(currentPath)) {
    return null;
  }

  const activeVersion = basename(await readlink(currentPath));
  const versionRoot = activeSkillPackageVersionRoot(agentsDir, packageName, activeVersion);
  const manifest = await loadBundleManifest(versionRoot);
  return {
    packageName,
    activeVersion,
    packageRoot,
    versionRoot,
    manifest,
  } satisfies InstalledSkillBundle;
}

export async function ingestSkillPackage(options: {
  agentsDir: string;
  packageSpec: string;
  existingSkillNames: Set<string>;
}) {
  const packDir = await mkdtemp(join(tmpdir(), "agents-skill-pack-"));
  const extractDir = await mkdtemp(join(tmpdir(), "agents-skill-extract-"));

  try {
    const packProc = Bun.spawn(
      ["npm", "pack", options.packageSpec, "--ignore-scripts", "--json", "--pack-destination", packDir],
      { stdout: "pipe", stderr: "pipe", env: process.env },
    );
    const packStdout = await new Response(packProc.stdout).text();
    const packStderr = await new Response(packProc.stderr).text();
    if ((await packProc.exited) !== 0) {
      throw new Error(`${packStdout}${packStderr}`.trim() || `npm pack failed for ${options.packageSpec}`);
    }

    const packed = JSON.parse(packStdout) as Array<{ name: string; version: string; filename: string }>;
    const metadata = packed[0];
    if (!metadata) {
      throw new Error(`npm pack produced no metadata for ${options.packageSpec}`);
    }

    const tarballPath = join(packDir, metadata.filename);
    const tarProc = Bun.spawn(["tar", "-xf", tarballPath, "-C", extractDir], {
      stdout: "pipe",
      stderr: "pipe",
      env: process.env,
    });
    const tarStdout = await new Response(tarProc.stdout).text();
    const tarStderr = await new Response(tarProc.stderr).text();
    if ((await tarProc.exited) !== 0) {
      throw new Error(`${tarStdout}${tarStderr}`.trim() || `tar extraction failed for ${tarballPath}`);
    }

    const normalizedRoot = join(extractDir, "package");
    const manifest = await loadBundleManifest(normalizedRoot);
    await validateBundleManifest(normalizedRoot, manifest, options.existingSkillNames, metadata.name, metadata.version);

    const packageRoot = activeSkillPackageRoot(options.agentsDir, metadata.name);
    const versionRoot = activeSkillPackageVersionRoot(options.agentsDir, metadata.name, metadata.version);
    const currentPath = activeSkillPackageCurrentLink(options.agentsDir, metadata.name);

    mkdirSync(dirname(packageRoot), { recursive: true });
    mkdirSync(packageRoot, { recursive: true });
    rmSync(versionRoot, { recursive: true, force: true });
    await rename(normalizedRoot, versionRoot);
    rmSync(currentPath, { force: true });
    symlinkSync(metadata.version, currentPath, "dir");

    return {
      packageName: metadata.name,
      activeVersion: metadata.version,
      packageRoot,
      versionRoot,
      manifest,
    } satisfies InstalledSkillBundle;
  } finally {
    rmSync(packDir, { recursive: true, force: true });
    rmSync(extractDir, { recursive: true, force: true });
  }
}
