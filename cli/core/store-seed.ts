// ABOUTME: Populates an empty drwn store from a tarball or directory snapshot.
// ABOUTME: Enables CI and airgapped use without runtime network egress.

import { existsSync } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  readdir,
  readFile,
  readlink,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
  link,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { DrwnError } from "./errors";
import {
  assertStoreWritableForSeed,
  resolveStoreMetadataPath,
  resolveStoreRoot,
} from "./store-paths";

export type SeedSource =
  | { kind: "tar"; path: string }
  | { kind: "dir"; path: string };

export interface SeedOptions {
  agentsDir: string;
  source: SeedSource;
  force?: boolean;
  allowReadonlySeed?: boolean;
}

const REQUIRED_LAYOUT = ["store.json", "cards"];
const NON_EMPTY_DIRS = [
  "cards",
  "catalogs",
  "sources",
  "skills",
  "mcp-servers",
  "generated",
  "extracted",
];

export async function seedStore(options: SeedOptions): Promise<{ seededAt: string }> {
  assertStoreWritableForSeed({ allowReadonlySeed: options.allowReadonlySeed });
  const storeRoot = resolveStoreRoot(options.agentsDir);
  if (!options.force && !(await isStoreMissingOrEmpty(storeRoot))) {
    throw new DrwnError(
      "STORE_NOT_EMPTY",
      `STORE_NOT_EMPTY: store at ${storeRoot} is not empty; pass --force to overwrite or seed into a fresh location`,
    );
  }

  const stagingRoot = `${storeRoot}.seed.${Date.now()}`;
  await rm(stagingRoot, { recursive: true, force: true });
  await mkdir(stagingRoot, { recursive: true });
  try {
    if (options.source.kind === "tar") {
      await extractTar(options.source.path, stagingRoot);
    } else {
      await copySeedDirectory(options.source.path, stagingRoot);
    }

    const innerRoot = join(stagingRoot, "drwn");
    await assertSeedLayout(innerRoot);
    await assertSymlinksStayWithin(innerRoot);

    const seededAt = new Date().toISOString();
    const metadataPath = resolveStoreMetadataPath(stagingRoot);
    const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as Record<string, unknown>;
    metadata.seededAt = seededAt;
    await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

    await mkdir(dirname(storeRoot), { recursive: true });
    await rm(storeRoot, { recursive: true, force: true });
    await rename(innerRoot, storeRoot);
    await rm(stagingRoot, { recursive: true, force: true });
    return { seededAt };
  } catch (error) {
    await rm(stagingRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function isStoreMissingOrEmpty(storeRoot: string): Promise<boolean> {
  if (!existsSync(storeRoot)) {
    return true;
  }
  const entries = await readdir(storeRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "store.json" || entry.name === "machine.json") {
      continue;
    }
    if (NON_EMPTY_DIRS.includes(entry.name)) {
      const childPath = join(storeRoot, entry.name);
      const childEntries = entry.isDirectory() ? await readdir(childPath) : [];
      if (childEntries.length > 0) {
        return false;
      }
      continue;
    }
    return false;
  }
  return true;
}

async function extractTar(tarPath: string, destDir: string): Promise<void> {
  await assertTarEntriesSafe(tarPath);
  const proc = Bun.spawn(["tar", "-xf", tarPath, "-C", destDir], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new DrwnError("SEED_EXTRACT_FAILED", `SEED_EXTRACT_FAILED: ${stderr.trim() || `failed to extract ${tarPath}`}`);
  }
}

async function assertTarEntriesSafe(tarPath: string): Promise<void> {
  const proc = Bun.spawn(["tar", "-tf", tarPath], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) {
    throw new DrwnError("SEED_TAR_LIST_FAILED", `SEED_TAR_LIST_FAILED: ${stderr.trim() || `failed to list ${tarPath}`}`);
  }
  for (const raw of stdout.split("\n")) {
    const entry = raw.trim();
    if (!entry) {
      continue;
    }
    if (
      isAbsolute(entry) ||
      entry.includes("..") ||
      entry.includes("\\") ||
      (entry !== "drwn" && !entry.startsWith("drwn/"))
    ) {
      throw new DrwnError("SEED_UNSAFE_TAR_ENTRY", `SEED_UNSAFE_TAR_ENTRY: unsafe tar entry: ${entry}`);
    }
  }
}

async function copySeedDirectory(sourcePath: string, stagingRoot: string): Promise<void> {
  const source = resolve(sourcePath);
  const sourceRoot = basename(source) === "drwn" ? source : join(source, "drwn");
  if (!existsSync(sourceRoot)) {
    throw new DrwnError("SEED_INVALID_LAYOUT", `SEED_INVALID_LAYOUT: seed source does not contain a 'drwn/' root`);
  }
  await copyDirHardlink(sourceRoot, join(stagingRoot, "drwn"));
}

async function copyDirHardlink(source: string, target: string): Promise<void> {
  const stats = await lstat(source);
  if (stats.isDirectory()) {
    await mkdir(target, { recursive: true });
    for (const entry of await readdir(source)) {
      await copyDirHardlink(join(source, entry), join(target, entry));
    }
    return;
  }
  if (stats.isSymbolicLink()) {
    await symlink(await readlink(source), target);
    return;
  }
  if (stats.isFile()) {
    await mkdir(dirname(target), { recursive: true });
    try {
      await link(source, target);
    } catch {
      await copyFile(source, target);
    }
  }
}

async function assertSeedLayout(innerRoot: string): Promise<void> {
  if (!existsSync(innerRoot)) {
    throw new DrwnError("SEED_INVALID_LAYOUT", `SEED_INVALID_LAYOUT: seed source does not contain a 'drwn/' root`);
  }
  for (const required of REQUIRED_LAYOUT) {
    if (!existsSync(join(innerRoot, required))) {
      throw new DrwnError("SEED_INVALID_LAYOUT", `SEED_INVALID_LAYOUT: seed source is missing 'drwn/${required}'`);
    }
  }
}

async function assertSymlinksStayWithin(root: string): Promise<void> {
  const rootReal = await realpath(root);
  async function walk(current: string) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = join(current, entry.name);
      const stats = await lstat(entryPath);
      if (stats.isSymbolicLink()) {
        const target = await realpath(entryPath);
        if (target !== rootReal && !target.startsWith(`${rootReal}/`)) {
          throw new DrwnError("SEED_UNSAFE_SYMLINK", `SEED_UNSAFE_SYMLINK: symlink escapes seed root: ${entryPath}`);
        }
        continue;
      }
      if (stats.isDirectory()) {
        await walk(entryPath);
      }
    }
  }
  await walk(root);
}
