// ABOUTME: Verifies normalization-tolerant content manifests for vendored card integrity.
// ABOUTME: Protects the F2 CRLF round-trip and LF back-compat guarantees from analysis 97.

import { afterEach, expect, test } from "bun:test";
import { chmod } from "node:fs/promises";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { computeCardIntegrity } from "../cli/core/card-store";
import {
  computeContentManifest,
  manifestIntegrityDigest,
  verifyManifest,
} from "../cli/core/content-manifest";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function scaffoldTextTree(root: string, relPath: string, content: string) {
  const abs = join(root, relPath);
  await mkdir(join(abs, ".."), { recursive: true });
  await writeFile(abs, content);
}

test("computeContentManifest normalizes CRLF text to the same hash as LF", async () => {
  const lfRoot = await createTempRoot("manifest-lf-");
  const crlfRoot = await createTempRoot("manifest-crlf-");
  tempRoots.push(lfRoot, crlfRoot);

  await scaffoldTextTree(lfRoot, "skills/x/SKILL.md", "---\nname: x\n---\nbody\n");
  await scaffoldTextTree(crlfRoot, "skills/x/SKILL.md", "---\r\nname: x\r\n---\r\nbody\r\n");

  const lfManifest = await computeContentManifest(lfRoot);
  const crlfManifest = await computeContentManifest(crlfRoot);

  expect(lfManifest.files).toHaveLength(1);
  expect(crlfManifest.files).toHaveLength(1);
  expect(lfManifest.files[0]!.hash).toBe(crlfManifest.files[0]!.hash);
  expect(lfManifest.files[0]!.path).toBe("skills/x/SKILL.md");
});

test("computeContentManifest uses raw bytes for binary files", async () => {
  const root = await createTempRoot("manifest-bin-");
  tempRoots.push(root);

  await scaffoldTextTree(root, "assets/logo.png", "\x89PNG\r\n\x1a\n");
  const manifest = await computeContentManifest(root);
  const flipped = await computeContentManifest(root);

  expect(manifest.files[0]!.hash).toBe(flipped.files[0]!.hash);

  await writeFile(join(root, "assets/logo.png"), "\x89PNG\r\n\x1a\x00");
  const afterFlip = await computeContentManifest(root);
  expect(afterFlip.files[0]!.hash).not.toBe(manifest.files[0]!.hash);
});

test("computeContentManifest detects exec-bit changes", async () => {
  const root = await createTempRoot("manifest-exec-");
  tempRoots.push(root);

  await scaffoldTextTree(root, "bin/run.sh", "#!/bin/sh\n");
  const notExec = await computeContentManifest(root);
  expect(notExec.files[0]!.exec).toBe(false);

  await chmod(join(root, "bin/run.sh"), 0o755);
  const execManifest = await computeContentManifest(root);
  expect(execManifest.files[0]!.exec).toBe(true);
  expect(manifestIntegrityDigest(execManifest)).not.toBe(manifestIntegrityDigest(notExec));
});

test("verifyManifest reports mismatches", async () => {
  const root = await createTempRoot("manifest-verify-");
  tempRoots.push(root);

  await scaffoldTextTree(root, "a.txt", "hello\n");
  const manifest = await computeContentManifest(root);
  expect((await verifyManifest(root, manifest)).ok).toBe(true);

  await writeFile(join(root, "a.txt"), "hello!\n");
  const result = await verifyManifest(root, manifest);
  expect(result.ok).toBe(false);
  expect(result.mismatches.length).toBeGreaterThan(0);
});

test("manifestIntegrityDigest matches computeCardIntegrity for LF fixtures", async () => {
  const root = await createTempRoot("manifest-digest-");
  tempRoots.push(root);

  await scaffoldTextTree(root, "skills/polish/SKILL.md", "---\nname: polish\n---\nbody\n");
  await scaffoldTextTree(root, "skills/polish/ref.md", "reference\n");

  const manifest = await computeContentManifest(root);
  const fromManifest = manifestIntegrityDigest(manifest);
  const fromLegacy = await computeCardIntegrity(root);

  expect(fromManifest).toBe(fromLegacy);
});
