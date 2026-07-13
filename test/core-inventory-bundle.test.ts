// ABOUTME: Threat-models deterministic portable inventory bundle creation and validation.
// ABOUTME: Rejects unsafe archive structure, unlisted payloads, limits, corruption, and sensitive content.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import * as tar from "tar";
import {
  createPortableInventoryBundle,
  inspectPortableBundleHeaders,
  readPortableInventoryArtifact,
  validatePortableArchiveHeaders,
  validatePortableInventoryBundle,
  type PortableArchiveHeader,
} from "../cli/core/inventory-bundle";
import { canonicalJsonBytes, comparePortableStrings } from "../cli/core/inventory-portable";
import { exportPortableInventoryManifest } from "../cli/core/inventory-transfer";
import { cleanupTempRoots, createInstalledSkillBundle, createTempRoot, scaffoldCliFixture } from "./helpers";
import { seedMcpInventory } from "./mcp-inventory-fixture";

const roots: string[] = [];

afterEach(async () => {
  delete process.env.DRWN_TASK82_TEST_SECRET;
  await cleanupTempRoots(roots);
});

async function portableFixture() {
  const fixture = await scaffoldCliFixture();
  roots.push(fixture.root);
  const installed = await createInstalledSkillBundle(fixture.agentsDir, {
    packageName: "@acme/portable",
    version: "1.2.3",
    skillName: "portable-skill",
  });
  await mkdir(join(installed.packageRoot, "empty-dir"), { recursive: true });
  await writeFile(join(installed.packageRoot, "run.sh"), "#!/bin/sh\nexit 0\n");
  await chmod(join(installed.packageRoot, "run.sh"), 0o711);
  await seedMcpInventory(fixture.agentsDir, {
    version: 1,
    servers: {
      portable: {
        description: "Portable",
        transport: "stdio",
        command: "portable-server",
        env: { API_TOKEN: "${PORTABLE_API_TOKEN}" },
        optional: false,
      },
    },
  });
  return { ...fixture, installed };
}

describe("deterministic portable inventory bundles", () => {
  test("produces byte-identical gzip bundles with the exported canonical manifest", async () => {
    const fixture = await portableFixture();
    const firstPath = join(fixture.root, "out", "first.tar.gz");
    const secondPath = join(fixture.root, "out", "second.tar.gz");
    const manifestPath = join(fixture.root, "out", "manifest.json");

    const first = await createPortableInventoryBundle({ agentsDir: fixture.agentsDir, outputPath: firstPath });
    const second = await createPortableInventoryBundle({ agentsDir: fixture.agentsDir, outputPath: secondPath });
    await exportPortableInventoryManifest({ agentsDir: fixture.agentsDir, outputPath: manifestPath });

    expect(await readFile(firstPath)).toEqual(await readFile(secondPath));
    expect(first.manifestSha256).toBe(second.manifestSha256);
    expect(first.archiveSha256).toBe(second.archiveSha256);
    const staged = await validatePortableInventoryBundle(firstPath);
    try {
      expect(staged.manifestBytes).toEqual(await readFile(manifestPath));
      expect(canonicalJsonBytes(staged.manifest)).toEqual(staged.manifestBytes);
      expect(staged.manifestSha256).toBe(first.manifestSha256);
      expect(staged.archiveSha256).toBe(first.archiveSha256);
    } finally {
      await staged.cleanup();
    }
  });

  test("normalizes member ordering, modes, ownership metadata, timestamps, and preserves empty directories", async () => {
    const fixture = await portableFixture();
    const outputPath = join(fixture.root, "portable.tar.gz");
    await createPortableInventoryBundle({ agentsDir: fixture.agentsDir, outputPath });

    const headers = await inspectPortableBundleHeaders(outputPath);
    const paths = headers.map((header) => header.path);
    const executable = headers.find((header) => header.path.endsWith("/run.sh"))!;
    const ordinary = headers.find((header) => header.path.endsWith("/bundle.json"))!;
    const empty = headers.find((header) => header.path.endsWith("/empty-dir/"))!;

    expect(paths).toEqual([...paths].sort(comparePortableStrings));
    expect(executable.mode).toBe(0o755);
    expect(ordinary.mode).toBe(0o644);
    expect(empty.type).toBe("Directory");
    expect(empty.mode).toBe(0o755);
    for (const header of headers) {
      expect(header.uid).toBe(0);
      expect(header.gid).toBe(0);
      expect(header.mtime).toBeUndefined();
    }
    expect((await readFile(outputPath)).subarray(4, 8)).toEqual(Buffer.alloc(4));
    expect((await readFile(outputPath))[9]).toBe(255);
  });

  test("rejects gzip containers with a nonzero timestamp", async () => {
    const fixture = await portableFixture();
    const validPath = join(fixture.root, "valid.tar.gz");
    const datedPath = join(fixture.root, "dated.tar.gz");
    await createPortableInventoryBundle({ agentsDir: fixture.agentsDir, outputPath: validPath });
    const bytes = await readFile(validPath);
    bytes[4] = 1;
    await writeFile(datedPath, bytes);

    await expect(validatePortableInventoryBundle(datedPath)).rejects.toMatchObject({
      code: "INVENTORY_TRANSFER_ARTIFACT_INVALID",
    });
  });

  test("rejects the compressed-size limit before parsing tar content", async () => {
    const root = await createTempRoot("portable-oversize-first-");
    roots.push(root);
    const path = join(root, "invalid-but-oversize.tar.gz");
    await writeFile(path, Buffer.from([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 2, 255, 0]));

    await expect(inspectPortableBundleHeaders(path, { maxCompressedBundleBytes: 10 })).rejects.toMatchObject({
      code: "INVENTORY_TRANSFER_ARTIFACT_TOO_LARGE",
    });
  });

  test("rejects hidden PAX metadata headers", async () => {
    const fixture = await portableFixture();
    const validPath = join(fixture.root, "valid-pax-source.tar.gz");
    const paxPath = join(fixture.root, "pax.tar.gz");
    await createPortableInventoryBundle({ agentsDir: fixture.agentsDir, outputPath: validPath });
    const pax = new tar.Pax({ comment: "hidden metadata" }, true).encode();
    const bytes = gzipSync(Buffer.concat([pax, gunzipSync(await readFile(validPath))]), { level: 9 });
    bytes[9] = 255;
    await writeFile(paxPath, bytes);

    await expect(validatePortableInventoryBundle(paxPath)).rejects.toMatchObject({
      code: "INVENTORY_TRANSFER_UNSAFE_ENTRY",
    });
  });

  test("includes no excluded Store member or decompressed sentinel", async () => {
    const fixture = await portableFixture();
    const sentinels = [
      join(fixture.agentsDir, "drwn", "credentials.json"),
      join(fixture.agentsDir, "drwn", "machine.json"),
      join(fixture.agentsDir, "drwn", "projects.json"),
      join(fixture.agentsDir, "drwn", "cards", "secret.txt"),
      join(fixture.agentsDir, "drwn", "sources", "secret.txt"),
      join(fixture.agentsDir, "drwn", "generated", "secret.txt"),
      join(fixture.agentsDir, "drwn", ".inventory-tombstones", "secret.txt"),
      join(dirname(fixture.installed.packageRoot), "9.9.9", "secret.txt"),
    ];
    for (const [index, path] of sentinels.entries()) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `EXCLUDED_TASK82_${index}\n`);
    }
    await chmod(sentinels[0]!, 0o000);
    const outputPath = join(fixture.root, "portable.tar.gz");

    await createPortableInventoryBundle({ agentsDir: fixture.agentsDir, outputPath });
    const staged = await validatePortableInventoryBundle(outputPath);
    try {
      const members = staged.headers.map((header) => header.path).join("\n");
      const payloadBytes = await Promise.all(staged.manifest.entries.map(async (entry) => {
        const path = join(staged.rootDir, "drwn-inventory", ...entry.payloadPath.split("/"));
        if (entry.kind === "mcp") return readFile(path);
        const files = staged.headers.filter((header) => header.type === "File" && header.path.startsWith(`drwn-inventory/${entry.payloadPath}/`));
        return Buffer.concat(await Promise.all(files.map((header) => readFile(join(staged.rootDir, ...header.path.split("/"))))));
      }));
      expect(members).not.toMatch(/credentials|machine\.json|projects\.json|cards|sources|generated|tombstone|9\.9\.9/);
      for (const bytes of payloadBytes) expect(bytes.toString()).not.toContain("EXCLUDED_TASK82_");
    } finally {
      await staged.cleanup();
      await chmod(sentinels[0]!, 0o600);
    }
  });

  test("rejects high-risk filenames, private keys, and known sensitive environment values without leaking values", async () => {
    const cases = [
      { name: ".env", content: "SAFE_LOOKING=value\n" },
      { name: "private.txt", content: "-----BEGIN PRIVATE KEY-----\nnot-a-real-key\n" },
      { name: "token.txt", content: "task82-sensitive-value-123456789\n", env: "task82-sensitive-value-123456789" },
    ];
    for (const [index, item] of cases.entries()) {
      const fixture = await portableFixture();
      const path = join(fixture.installed.packageRoot, item.name);
      await writeFile(path, item.content);
      if (item.env) process.env.DRWN_TASK82_TEST_SECRET = item.env;
      const outputPath = join(fixture.root, `unsafe-${index}.tar.gz`);

      try {
        await createPortableInventoryBundle({ agentsDir: fixture.agentsDir, outputPath });
        throw new Error("expected sensitive bundle creation to fail");
      } catch (error) {
        expect(error).toMatchObject({ code: "INVENTORY_TRANSFER_SECRET_DETECTED" });
        expect((error as Error).message).toContain(item.name);
        if (item.env) expect((error as Error).message).not.toContain(item.env);
      }
      expect(existsSync(outputPath)).toBe(false);
      delete process.env.DRWN_TASK82_TEST_SECRET;
    }
  });

  test("recognizes strict canonical JSON and gzip content instead of trusting extensions", async () => {
    const fixture = await portableFixture();
    const bundlePath = join(fixture.root, "bundle.data");
    const manifestPath = join(fixture.root, "manifest.data");
    await createPortableInventoryBundle({ agentsDir: fixture.agentsDir, outputPath: bundlePath });
    await exportPortableInventoryManifest({ agentsDir: fixture.agentsDir, outputPath: manifestPath });

    const manifest = await readPortableInventoryArtifact(manifestPath);
    const bundle = await readPortableInventoryArtifact(bundlePath);
    try {
      expect(manifest.kind).toBe("manifest");
      expect(bundle.kind).toBe("bundle");
    } finally {
      await manifest.cleanup();
      await bundle.cleanup();
    }

    const plainTar = join(fixture.root, "plain.tar.gz");
    await tar.c({ cwd: fixture.root, file: plainTar }, ["manifest.data"]);
    await expect(readPortableInventoryArtifact(plainTar)).rejects.toMatchObject({
      code: "INVENTORY_TRANSFER_ARTIFACT_INVALID",
    });
    await expect(readPortableInventoryArtifact(join(fixture.root, "missing.json"))).rejects.toMatchObject({
      code: "INVENTORY_TRANSFER_ARTIFACT_INVALID",
    });
  });
});

describe("portable bundle archive header policy", () => {
  const file = (path: string, size = 1): PortableArchiveHeader => ({ path, type: "File", size, mode: 0o644, uid: 0, gid: 0 });
  const directory = (path: string): PortableArchiveHeader => ({ path, type: "Directory", size: 0, mode: 0o755, uid: 0, gid: 0 });

  test("accepts only concrete root-contained POSIX paths", () => {
    const safe = [
      directory("drwn-inventory/"),
      file("drwn-inventory/manifest.json"),
      directory("drwn-inventory/payload/"),
      file("drwn-inventory/payload/000000/file.txt"),
    ];
    expect(validatePortableArchiveHeaders(safe, 100)).toHaveLength(4);

    const unsafe = [
      "/drwn-inventory/manifest.json",
      "C:/drwn-inventory/manifest.json",
      "//server/share/drwn-inventory/manifest.json",
      "drwn-inventory\\manifest.json",
      "drwn-inventory/./manifest.json",
      "drwn-inventory/../escape",
      "other-root/manifest.json",
      "drwn-inventory//manifest.json",
      "drwn-inventory/manifest.json\0hidden",
      `drwn-inventory/${Array.from({ length: 64 }, () => "deep").join("/")}/file`,
    ];
    for (const path of unsafe) {
      expect(() => validatePortableArchiveHeaders([file(path)], 100)).toThrow(
        expect.objectContaining({ code: "INVENTORY_TRANSFER_UNSAFE_ENTRY" }),
      );
    }
  });

  test("rejects links, special files, duplicate paths, and case or NFC collisions", () => {
    for (const type of ["OldFile", "SymbolicLink", "Link", "CharacterDevice", "BlockDevice", "FIFO", "Socket", "GNUDumpDir"] as const) {
      expect(() => validatePortableArchiveHeaders([{ ...file("drwn-inventory/payload/000000/x"), type }], 100)).toThrow(
        expect.objectContaining({ code: "INVENTORY_TRANSFER_UNSAFE_ENTRY" }),
      );
    }
    expect(() => validatePortableArchiveHeaders([
      file("drwn-inventory/manifest.json"),
      file("drwn-inventory/manifest.json"),
    ], 100)).toThrow(expect.objectContaining({ code: "INVENTORY_TRANSFER_UNSAFE_ENTRY" }));
    expect(() => validatePortableArchiveHeaders([
      file("drwn-inventory/payload/000000/Readme"),
      file("drwn-inventory/payload/000000/README"),
    ], 100)).toThrow(expect.objectContaining({ code: "INVENTORY_TRANSFER_UNSAFE_ENTRY" }));
    expect(() => validatePortableArchiveHeaders([
      file("drwn-inventory/payload/000000/café"),
      file("drwn-inventory/payload/000000/cafe\u0301"),
    ], 100)).toThrow(expect.objectContaining({ code: "INVENTORY_TRANSFER_UNSAFE_ENTRY" }));
    expect(() => validatePortableArchiveHeaders([
      file("drwn-inventory/payload/000000/file"),
      file("drwn-inventory/manifest.json"),
    ], 100)).toThrow(expect.objectContaining({ code: "INVENTORY_TRANSFER_ARTIFACT_INVALID" }));
  });

  test("enforces every declared and ratio limit at its boundary", () => {
    const base = [file("drwn-inventory/manifest.json", 4), file("drwn-inventory/payload/000000/file", 6)];
    const limits = {
      maxCompressedBundleBytes: 10,
      maxPayloadBytes: 10,
      maxRegularFileBytes: 6,
      maxManifestBytes: 4,
      maxArchiveMembers: 2,
      maxPathDepth: 64,
      maxDecompressionRatio: 2,
    };
    expect(validatePortableArchiveHeaders(base, 5, limits)).toHaveLength(2);
    const failures: Array<[PortableArchiveHeader[], number, Partial<typeof limits>]> = [
      [base, 11, {}],
      [[...base, file("drwn-inventory/payload/000000/extra", 0)], 5, {}],
      [[file("drwn-inventory/manifest.json", 5)], 5, {}],
      [[file("drwn-inventory/payload/000000/file", 7)], 5, {}],
      [[file("drwn-inventory/manifest.json", 4), file("drwn-inventory/payload/000000/file", 7)], 6, {}],
      [[file("drwn-inventory/manifest.json", 4), file("drwn-inventory/payload/000000/file", 6)], 4, {}],
    ];
    for (const [headers, compressedSize, override] of failures) {
      expect(() => validatePortableArchiveHeaders(headers, compressedSize, { ...limits, ...override })).toThrow(
        expect.objectContaining({ code: "INVENTORY_TRANSFER_ARTIFACT_TOO_LARGE" }),
      );
    }
  });
});
