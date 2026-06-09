// ABOUTME: Covers safe store seeding from directory and tar snapshots.
// ABOUTME: Protects CI/airgapped store bootstrap behavior and malicious snapshot refusal.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { lstat, mkdir, mkdtemp, realpath, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seedStore } from "../cli/core/store-seed";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

describe("seedStore", () => {
  test("rejects a missing tarball", async () => {
    const agentsDir = await createTempRoot("drwn-seed-missing-");
    tempRoots.push(agentsDir);

    await expect(seedStore({ agentsDir, source: { kind: "tar", path: "/tmp/nope.tar" } })).rejects.toThrow(
      /SEED_TAR_LIST_FAILED|No such file/,
    );
  });

  test("seeds from a directory using hardlinks when possible", async () => {
    const sourceRoot = await createSeedSource();
    const agentsDir = await createTempRoot("drwn-seed-dir-");
    tempRoots.push(sourceRoot, agentsDir);
    const sentinel = join(sourceRoot, "drwn", "cards", "sentinel.txt");

    const result = await seedStore({
      agentsDir,
      source: { kind: "dir", path: sourceRoot },
    });

    expect(result.seededAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const seededSentinel = join(agentsDir, "drwn", "cards", "sentinel.txt");
    expect(await Bun.file(seededSentinel).text()).toBe("seed\n");
    expect(JSON.parse(await Bun.file(join(agentsDir, "drwn", "store.json")).text()).seededAt).toBe(result.seededAt);

    const [sourceStat, targetStat] = await Promise.all([stat(sentinel), stat(seededSentinel)]);
    expect(targetStat.ino).toBe(sourceStat.ino);
  });

  test("seeds from a tarball produced by store export layout", async () => {
    const sourceRoot = await createSeedSource();
    const agentsDir = await createTempRoot("drwn-seed-tar-");
    const tarDir = await mkdtemp(join(tmpdir(), "drwn-seed-tar-out-"));
    tempRoots.push(sourceRoot, agentsDir, tarDir);
    const tarPath = join(tarDir, "drwn-store.tar");
    await runTar(["-cf", tarPath, "-C", sourceRoot, "drwn"]);

    const result = await seedStore({
      agentsDir,
      source: { kind: "tar", path: tarPath },
    });

    expect(existsSync(join(agentsDir, "drwn", "cards", "sentinel.txt"))).toBe(true);
    expect(JSON.parse(await Bun.file(join(agentsDir, "drwn", "store.json")).text()).seededAt).toBe(result.seededAt);
  });

  test("refuses to overwrite a non-empty store without force", async () => {
    const sourceRoot = await createSeedSource();
    const agentsDir = await createTempRoot("drwn-seed-nonempty-");
    tempRoots.push(sourceRoot, agentsDir);
    await mkdir(join(agentsDir, "drwn", "cards"), { recursive: true });
    await writeFile(join(agentsDir, "drwn", "cards", "existing.txt"), "existing\n");

    await expect(
      seedStore({
        agentsDir,
        source: { kind: "dir", path: sourceRoot },
      }),
    ).rejects.toThrow("STORE_NOT_EMPTY");
  });

  test("rejects invalid seed layout", async () => {
    const sourceRoot = await createTempRoot("drwn-seed-invalid-");
    const agentsDir = await createTempRoot("drwn-seed-target-");
    tempRoots.push(sourceRoot, agentsDir);
    await mkdir(join(sourceRoot, "drwn"), { recursive: true });
    await writeFile(join(sourceRoot, "drwn", "store.json"), JSON.stringify({ schemaVersion: 1 }));

    await expect(
      seedStore({
        agentsDir,
        source: { kind: "dir", path: sourceRoot },
      }),
    ).rejects.toThrow("SEED_INVALID_LAYOUT");
  });

  test("rejects symlinks escaping the seed root", async () => {
    const sourceRoot = await createSeedSource();
    const agentsDir = await createTempRoot("drwn-seed-symlink-");
    tempRoots.push(sourceRoot, agentsDir);
    await symlink("/tmp", join(sourceRoot, "drwn", "cards", "escape"));

    await expect(
      seedStore({
        agentsDir,
        source: { kind: "dir", path: sourceRoot },
      }),
    ).rejects.toThrow("SEED_UNSAFE_SYMLINK");
  });
});

async function createSeedSource() {
  const sourceRoot = await createTempRoot("drwn-seed-source-");
  await mkdir(join(sourceRoot, "drwn", "cards"), { recursive: true });
  await writeFile(
    join(sourceRoot, "drwn", "store.json"),
    `${JSON.stringify({ schemaVersion: 1, initAt: "2026-06-04T00:00:00.000Z" }, null, 2)}\n`,
  );
  await writeFile(join(sourceRoot, "drwn", "cards", "sentinel.txt"), "seed\n");
  expect((await lstat(join(sourceRoot, "drwn", "cards"))).isDirectory()).toBe(true);
  expect(await realpath(join(sourceRoot, "drwn"))).toBe(await realpath(join(sourceRoot, "drwn")));
  return sourceRoot;
}

async function runTar(args: string[]) {
  const proc = Bun.spawn(["tar", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`tar ${args.join(" ")} failed: ${stderr || stdout}`);
  }
}
