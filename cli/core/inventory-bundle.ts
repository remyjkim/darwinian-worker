// ABOUTME: Creates and validates deterministic allowlisted portable inventory bundles.
// ABOUTME: Rejects links, hostile paths, archive bombs, corruption, and sensitive skill content.

import { createReadStream, existsSync } from "node:fs";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { createGunzip } from "node:zlib";
import * as tar from "tar";
import { DrwnError } from "./errors";
import { hashSkillPackageDirectory } from "./skill-packages";
import { withInventoryLock } from "./inventory-lock";
import {
  INVENTORY_TRANSFER_LIMITS,
  canonicalJsonBytes,
  canonicalMcpDefinitionBytes,
  comparePortableStrings,
  parsePortableInventoryManifestBytes,
  sha256Integrity,
  type PortableInventoryManifestV1,
} from "./inventory-portable";
import {
  assertPortableOutputPath,
  publishPortableOutput,
  snapshotPortableInventory,
  type PortableInventorySnapshot,
} from "./inventory-transfer";
import { resolveStoreRoot } from "./store-paths";

export interface PortableArchiveHeader {
  path: string;
  type: string;
  size: number;
  mode?: number;
  uid?: number;
  gid?: number;
  uname?: string;
  gname?: string;
  mtime?: Date;
}

export interface PortableBundleLimits {
  maxCompressedBundleBytes: number;
  maxPayloadBytes: number;
  maxRegularFileBytes: number;
  maxManifestBytes: number;
  maxArchiveMembers: number;
  maxPathDepth: number;
  maxDecompressionRatio: number;
}

export interface StagedPortableBundle {
  kind: "bundle";
  sourcePath: string;
  rootDir: string;
  manifest: PortableInventoryManifestV1;
  manifestBytes: Uint8Array;
  manifestSha256: `sha256-${string}`;
  archiveSha256: `sha256-${string}`;
  headers: PortableArchiveHeader[];
  cleanup(): Promise<void>;
}

export interface PortableManifestArtifact {
  kind: "manifest";
  sourcePath: string;
  manifest: PortableInventoryManifestV1;
  manifestBytes: Uint8Array;
  manifestSha256: `sha256-${string}`;
  cleanup(): Promise<void>;
}

export type PortableInventoryArtifact = StagedPortableBundle | PortableManifestArtifact;

function transferError(code: string, message: string, cause?: unknown): DrwnError {
  return new DrwnError(code, message, undefined, cause);
}

function artifactInvalid(message: string, cause?: unknown): DrwnError {
  return transferError("INVENTORY_TRANSFER_ARTIFACT_INVALID", message, cause);
}

function unsafeEntry(message: string, cause?: unknown): DrwnError {
  return transferError("INVENTORY_TRANSFER_UNSAFE_ENTRY", message, cause);
}

function tooLarge(message: string, cause?: unknown): DrwnError {
  return transferError("INVENTORY_TRANSFER_ARTIFACT_TOO_LARGE", message, cause);
}

function integrityMismatch(message: string, cause?: unknown): DrwnError {
  return transferError("INVENTORY_TRANSFER_INTEGRITY_MISMATCH", message, cause);
}

function normalizedMemberPath(raw: string, maxDepth: number): { path: string; directory: boolean; collisionKey: string } {
  if (!raw || raw.includes("\0") || raw.includes("\\") || raw.startsWith("/") || raw.startsWith("//") || /^[A-Za-z]:/.test(raw)) {
    throw unsafeEntry(`Unsafe portable bundle member path: ${JSON.stringify(raw)}`);
  }
  const directory = raw.endsWith("/");
  const path = directory ? raw.slice(0, -1) : raw;
  const segments = path.split("/");
  if (segments.length > maxDepth || segments.some((part) => part === "" || part === "." || part === "..")) {
    throw unsafeEntry(`Unsafe portable bundle member path: ${JSON.stringify(raw)}`);
  }
  if (segments[0] !== "drwn-inventory") {
    throw unsafeEntry(`Portable bundle member is outside drwn-inventory/: ${JSON.stringify(raw)}`);
  }
  const collisionKey = segments.map((part) => part.normalize("NFC").toLowerCase()).join("/");
  return { path, directory, collisionKey };
}

export function validatePortableArchiveHeaders(
  headers: PortableArchiveHeader[],
  compressedSize: number,
  limitOverrides: Partial<PortableBundleLimits> = {},
): PortableArchiveHeader[] {
  const limits = { ...INVENTORY_TRANSFER_LIMITS, ...limitOverrides };
  if (!Number.isSafeInteger(compressedSize) || compressedSize <= 0 || compressedSize > limits.maxCompressedBundleBytes) {
    throw tooLarge(`Portable bundle compressed size is outside the V1 limit: ${compressedSize}`);
  }
  if (headers.length > limits.maxArchiveMembers) {
    throw tooLarge(`Portable bundle has too many members: ${headers.length}`);
  }
  const exactPaths = new Set<string>();
  const collisionPaths = new Set<string>();
  let previousPath = "";
  let declaredRegularBytes = 0;
  let declaredPayloadBytes = 0;
  for (const header of headers) {
    const normalized = normalizedMemberPath(header.path, limits.maxPathDepth);
    if (exactPaths.has(normalized.path) || collisionPaths.has(normalized.collisionKey)) {
      throw unsafeEntry(`Portable bundle contains a duplicate or colliding path: ${JSON.stringify(header.path)}`);
    }
    if (previousPath && comparePortableStrings(previousPath, header.path) >= 0) {
      throw artifactInvalid(`Portable bundle members are not in canonical lexical order: ${header.path}`);
    }
    previousPath = header.path;
    exactPaths.add(normalized.path);
    collisionPaths.add(normalized.collisionKey);

    const regular = header.type === "File";
    const directory = header.type === "Directory";
    if (!regular && !directory) throw unsafeEntry(`Portable bundle member type is not allowed: ${header.type}`);
    if (directory !== normalized.directory) throw unsafeEntry(`Portable bundle member path/type mismatch: ${header.path}`);
    if (!Number.isSafeInteger(header.size) || header.size < 0) throw unsafeEntry(`Invalid portable bundle member size: ${header.path}`);
    if (directory && header.size !== 0) throw unsafeEntry(`Portable bundle directory has data: ${header.path}`);
    if (regular && header.size > limits.maxRegularFileBytes) throw tooLarge(`Portable bundle file exceeds 256 MiB: ${header.path}`);
    if (normalized.path === "drwn-inventory/manifest.json" && header.size > limits.maxManifestBytes) {
      throw tooLarge("Portable inventory manifest exceeds 4 MiB");
    }
    if ((header.uid ?? 0) !== 0 || (header.gid ?? 0) !== 0 || (header.uname ?? "") !== "" || (header.gname ?? "") !== "" || header.mtime !== undefined) {
      throw unsafeEntry(`Portable bundle member has non-portable ownership or time metadata: ${header.path}`);
    }
    const mode = (header.mode ?? 0) & 0o7777;
    if (directory ? mode !== 0o755 : mode !== 0o644 && mode !== 0o755) {
      throw unsafeEntry(`Portable bundle member has unsupported mode: ${header.path}`);
    }
    if (regular) {
      declaredRegularBytes += header.size;
      if (normalized.path.startsWith("drwn-inventory/payload/")) declaredPayloadBytes += header.size;
      if (!Number.isSafeInteger(declaredRegularBytes) || !Number.isSafeInteger(declaredPayloadBytes)) {
        throw tooLarge("Portable bundle declared size exceeds safe integer range");
      }
    }
  }
  if (declaredPayloadBytes > limits.maxPayloadBytes) throw tooLarge("Portable bundle payload exceeds 2 GiB");
  if (declaredRegularBytes / compressedSize > limits.maxDecompressionRatio) {
    throw tooLarge("Portable bundle exceeds the V1 decompression ratio");
  }
  return headers;
}

async function readGzipHeader(path: string): Promise<Uint8Array> {
  const handle = Bun.file(path);
  return new Uint8Array(await handle.slice(0, 10).arrayBuffer());
}

function hasGzipMagic(header: Uint8Array): boolean {
  return header[0] === 0x1f && header[1] === 0x8b;
}

function assertCanonicalGzipHeader(header: Uint8Array): void {
  if (header.byteLength < 10 || !hasGzipMagic(header)) {
    throw artifactInvalid("Portable inventory bundle must be gzip-compressed tar content");
  }
  if (header[2] !== 8 || header[3] !== 0 || header[4] !== 0 || header[5] !== 0
    || header[6] !== 0 || header[7] !== 0 || header[8] !== 2 || header[9] !== 255) {
    throw artifactInvalid("Portable inventory bundle has a non-canonical gzip header");
  }
}

function parseTarOctal(field: Buffer): number {
  if ((field[0] ?? 0) >= 0x80) throw unsafeEntry("Portable bundle uses a non-canonical binary tar number");
  const value = field.toString("ascii").replace(/\0.*$/s, "").trim();
  if (value === "") return 0;
  if (!/^[0-7]+$/.test(value)) throw unsafeEntry("Portable bundle contains an invalid tar size field");
  const parsed = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(parsed)) throw tooLarge("Portable bundle tar size exceeds the safe integer range");
  return parsed;
}

async function validatePhysicalTarStructure(
  bundlePath: string,
  compressedSize: number,
  logicalMemberCount: number,
  limits: PortableBundleLimits,
): Promise<void> {
  let pending = Buffer.alloc(0);
  let dataAndPaddingRemaining = 0;
  let physicalMemberCount = 0;
  let decompressedBytes = 0;
  let zeroBlocks = 0;
  let reachedEnd = false;
  const maxPhysicalBytes = limits.maxPayloadBytes
    + limits.maxManifestBytes
    + limits.maxArchiveMembers * 1024
    + 10_240;
  const stream = createReadStream(bundlePath).pipe(createGunzip());
  try {
    for await (const chunk of stream) {
      const bytes = Buffer.from(chunk);
      decompressedBytes += bytes.byteLength;
      if (decompressedBytes > maxPhysicalBytes || decompressedBytes / compressedSize > limits.maxDecompressionRatio) {
        throw tooLarge("Portable bundle physical tar stream exceeds the V1 limits");
      }
      pending = pending.byteLength === 0 ? bytes : Buffer.concat([pending, bytes]);
      while (pending.byteLength > 0) {
        if (dataAndPaddingRemaining > 0) {
          const consumed = Math.min(dataAndPaddingRemaining, pending.byteLength);
          pending = pending.subarray(consumed);
          dataAndPaddingRemaining -= consumed;
          continue;
        }
        if (pending.byteLength < 512) break;
        const block = pending.subarray(0, 512);
        pending = pending.subarray(512);
        const zero = block.every((byte) => byte === 0);
        if (reachedEnd) {
          if (!zero) throw unsafeEntry("Portable bundle contains data after the tar end marker");
          zeroBlocks += 1;
          continue;
        }
        if (zero) {
          reachedEnd = true;
          zeroBlocks = 1;
          continue;
        }
        physicalMemberCount += 1;
        if (physicalMemberCount > limits.maxArchiveMembers) {
          throw tooLarge(`Portable bundle has too many physical members: ${physicalMemberCount}`);
        }
        const typeFlag = block[156];
        if (typeFlag !== 0x30 && typeFlag !== 0x35) {
          throw unsafeEntry(`Portable bundle contains a non-canonical physical tar header: ${String.fromCharCode(typeFlag ?? 0)}`);
        }
        const size = parseTarOctal(block.subarray(124, 136));
        if (typeFlag === 0x35 && size !== 0) throw unsafeEntry("Portable bundle directory header declares data");
        dataAndPaddingRemaining = Math.ceil(size / 512) * 512;
      }
    }
  } catch (error) {
    if (error instanceof DrwnError) throw error;
    throw artifactInvalid("Portable bundle physical tar stream is invalid", error);
  }
  if (pending.byteLength !== 0 || dataAndPaddingRemaining !== 0 || !reachedEnd || zeroBlocks < 2) {
    throw artifactInvalid("Portable bundle has an incomplete physical tar stream");
  }
  if (physicalMemberCount !== logicalMemberCount) {
    throw unsafeEntry("Portable bundle physical and logical member counts differ");
  }
}

export async function inspectPortableBundleHeaders(
  bundlePath: string,
  limitOverrides: Partial<PortableBundleLimits> = {},
): Promise<PortableArchiveHeader[]> {
  let stats;
  try {
    stats = await stat(bundlePath);
  } catch (error) {
    throw artifactInvalid(`Unable to read portable bundle: ${resolve(bundlePath)}`, error);
  }
  if (!stats.isFile()) throw artifactInvalid(`Portable bundle is not a regular file: ${bundlePath}`);
  const maxCompressed = limitOverrides.maxCompressedBundleBytes ?? INVENTORY_TRANSFER_LIMITS.maxCompressedBundleBytes;
  if (stats.size <= 0 || stats.size > maxCompressed) {
    throw tooLarge(`Portable bundle compressed size is outside the V1 limit: ${stats.size}`);
  }
  assertCanonicalGzipHeader(await readGzipHeader(bundlePath));
  const headers: PortableArchiveHeader[] = [];
  const limits = { ...INVENTORY_TRANSFER_LIMITS, ...limitOverrides };
  try {
    await tar.t({
      file: bundlePath,
      strict: true,
      preservePaths: true,
      maxDecompressionRatio: limitOverrides.maxDecompressionRatio ?? INVENTORY_TRANSFER_LIMITS.maxDecompressionRatio,
      onentry: (entry) => {
        headers.push({
          path: entry.path,
          type: entry.type,
          size: entry.size,
          mode: entry.mode,
          uid: entry.uid ?? 0,
          gid: entry.gid ?? 0,
          uname: entry.uname,
          gname: entry.gname,
          mtime: entry.mtime,
        });
      },
    });
    await validatePhysicalTarStructure(bundlePath, stats.size, headers.length, limits);
  } catch (error) {
    if (error instanceof DrwnError) throw error;
    throw artifactInvalid("Portable bundle tar headers are invalid", error);
  }
  return validatePortableArchiveHeaders(headers, stats.size, limitOverrides);
}

const SENSITIVE_ENV_NAME = /(auth|credential|key|password|secret|token)/i;
const PRIVATE_KEY_MARKERS = [
  "-----BEGIN PRIVATE KEY-----",
  "-----BEGIN RSA PRIVATE KEY-----",
  "-----BEGIN EC PRIVATE KEY-----",
  "-----BEGIN OPENSSH PRIVATE KEY-----",
  "-----BEGIN PGP PRIVATE KEY BLOCK-----",
];

function highRiskBasename(path: string): boolean {
  const name = basename(path).toLowerCase();
  if (name === ".env.example") return false;
  return name === ".env"
    || name.startsWith(".env.")
    || name === "credentials.json"
    || name === "secrets.json"
    || name === "id_rsa"
    || name === "id_ed25519";
}

function knownSensitiveValues(): Buffer[] {
  return Object.entries(process.env)
    .filter(([name, value]) => SENSITIVE_ENV_NAME.test(name) && value !== undefined && Buffer.byteLength(value) >= 8)
    .map(([, value]) => Buffer.from(value!));
}

function inspectSensitiveBytes(identity: string, relativePath: string, bytes: Uint8Array): void {
  if (highRiskBasename(relativePath)) {
    throw transferError(
      "INVENTORY_TRANSFER_SECRET_DETECTED",
      `Sensitive portable inventory path rejected for ${identity}: ${relativePath}`,
    );
  }
  const buffer = Buffer.from(bytes);
  if (PRIVATE_KEY_MARKERS.some((marker) => buffer.includes(Buffer.from(marker)))) {
    throw transferError(
      "INVENTORY_TRANSFER_SECRET_DETECTED",
      `Private-key marker rejected for ${identity}: ${relativePath}`,
    );
  }
  if (knownSensitiveValues().some((secret) => buffer.includes(secret))) {
    throw transferError(
      "INVENTORY_TRANSFER_SECRET_DETECTED",
      `Known sensitive environment value rejected for ${identity}: ${relativePath}`,
    );
  }
}

async function copyConcreteTreeNormalized(sourceRoot: string, targetRoot: string, identity: string): Promise<void> {
  const rootStats = await lstat(sourceRoot);
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) throw unsafeEntry(`Portable package is not concrete: ${identity}`);
  await mkdir(targetRoot, { recursive: true, mode: 0o755 });
  await chmod(targetRoot, 0o755);
  async function walk(source: string, target: string): Promise<void> {
    const entries = await readdir(source, { withFileTypes: true }).then((values) => values.sort((a, b) => comparePortableStrings(a.name, b.name)));
    for (const entry of entries) {
      const sourcePath = join(source, entry.name);
      const targetPath = join(target, entry.name);
      const rel = relative(sourceRoot, sourcePath).split(sep).join("/");
      if (entry.isSymbolicLink()) throw unsafeEntry(`Portable package contains a symbolic link for ${identity}: ${rel}`);
      if (entry.isDirectory()) {
        await mkdir(targetPath, { mode: 0o755 });
        await chmod(targetPath, 0o755);
        await walk(sourcePath, targetPath);
      } else if (entry.isFile()) {
        const stats = await lstat(sourcePath);
        if (!stats.isFile() || stats.isSymbolicLink()) throw unsafeEntry(`Portable package file changed for ${identity}: ${rel}`);
        const bytes = await readFile(sourcePath);
        inspectSensitiveBytes(identity, rel, bytes);
        await copyFile(sourcePath, targetPath);
        await chmod(targetPath, (stats.mode & 0o111) !== 0 ? 0o755 : 0o644);
      } else {
        throw unsafeEntry(`Portable package contains an unsupported entry for ${identity}: ${rel}`);
      }
    }
  }
  await walk(sourceRoot, targetRoot);
}

async function stageSnapshot(snapshot: PortableInventorySnapshot, contentRoot: string): Promise<Uint8Array> {
  const root = join(contentRoot, "drwn-inventory");
  await mkdir(join(root, "payload"), { recursive: true, mode: 0o755 });
  await chmod(root, 0o755);
  await chmod(join(root, "payload"), 0o755);
  const manifestBytes = canonicalJsonBytes(snapshot.manifest);
  await writeFile(join(root, "manifest.json"), manifestBytes, { mode: 0o644 });
  await chmod(join(root, "manifest.json"), 0o644);
  for (const payload of snapshot.payloads) {
    const destination = join(root, ...payload.payloadPath.split("/"));
    if (payload.kind === "skill-package") {
      await copyConcreteTreeNormalized(payload.sourcePath, destination, `skill-package ${payload.id}`);
    } else {
      await mkdir(dirname(destination), { recursive: true, mode: 0o755 });
      await chmod(dirname(destination), 0o755);
      inspectSensitiveBytes(`mcp ${payload.id}`, "record.json", payload.bytes);
      await writeFile(destination, payload.bytes, { mode: 0o644 });
      await chmod(destination, 0o644);
    }
  }
  return manifestBytes;
}

async function lexicalArchiveEntries(contentRoot: string): Promise<string[]> {
  const entries: string[] = [];
  async function walk(path: string, relativePath: string): Promise<void> {
    entries.push(relativePath);
    const stats = await lstat(path);
    if (!stats.isDirectory()) return;
    for (const entry of await readdir(path, { withFileTypes: true }).then((values) => values.sort((a, b) => comparePortableStrings(a.name, b.name)))) {
      await walk(join(path, entry.name), `${relativePath}/${entry.name}`);
    }
  }
  await walk(join(contentRoot, "drwn-inventory"), "drwn-inventory");
  return entries.sort(comparePortableStrings);
}

async function createDeterministicTar(contentRoot: string, outputPath: string): Promise<void> {
  const entries = await lexicalArchiveEntries(contentRoot);
  await tar.c({
    cwd: contentRoot,
    file: outputPath,
    gzip: { level: 9 },
    portable: true,
    noMtime: true,
    noDirRecurse: true,
    strict: true,
  }, entries);
  const handle = await open(outputPath, "r+");
  try {
    await handle.write(Buffer.from([0, 0, 0, 0]), 0, 4, 4);
    await handle.write(Buffer.from([255]), 0, 1, 9);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function pathWithin(root: string, candidate: string): Promise<boolean> {
  const [canonicalRoot, canonicalCandidate] = await Promise.all([realpath(root), realpath(candidate)]);
  const rel = relative(canonicalRoot, canonicalCandidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

async function validateExtractedFileHeaders(rootDir: string, headers: PortableArchiveHeader[]): Promise<void> {
  for (const header of headers) {
    const normalized = header.path.endsWith("/") ? header.path.slice(0, -1) : header.path;
    const path = join(rootDir, ...normalized.split("/"));
    const stats = await lstat(path);
    if (!(await pathWithin(rootDir, path))) throw unsafeEntry(`Extracted portable bundle path escapes staging: ${header.path}`);
    if (stats.isSymbolicLink()) throw unsafeEntry(`Extracted portable bundle contains a symbolic link: ${header.path}`);
    if (header.type === "Directory" ? !stats.isDirectory() : !stats.isFile()) {
      throw artifactInvalid(`Extracted portable bundle type mismatch: ${header.path}`);
    }
    if (header.type === "File" && stats.size !== header.size) {
      throw integrityMismatch(`Extracted portable bundle size mismatch: ${header.path}`);
    }
  }
}

async function measurePayloadTree(root: string): Promise<{ fileCount: number; directoryCount: number; sizeBytes: number }> {
  const result = { fileCount: 0, directoryCount: 0, sizeBytes: 0 };
  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        result.directoryCount += 1;
        await walk(path);
      } else if (entry.isFile()) {
        result.fileCount += 1;
        result.sizeBytes += (await lstat(path)).size;
      } else {
        throw unsafeEntry(`Extracted payload contains unsupported entry: ${relative(root, path)}`);
      }
    }
  }
  await walk(root);
  return result;
}

async function validateExtractedClosure(
  rootDir: string,
  headers: PortableArchiveHeader[],
  manifest: PortableInventoryManifestV1,
): Promise<void> {
  const normalizedPaths = new Set(headers.map((header) => header.path.endsWith("/") ? header.path.slice(0, -1) : header.path));
  for (const required of ["drwn-inventory", "drwn-inventory/manifest.json", "drwn-inventory/payload"]) {
    if (!normalizedPaths.has(required)) throw artifactInvalid(`Portable bundle is missing required member: ${required}`);
  }
  const entryByPayloadRoot = new Map(manifest.entries.map((entry) => {
    const root = entry.kind === "mcp" ? dirname(entry.payloadPath) : entry.payloadPath;
    return [`drwn-inventory/${root}`, entry] as const;
  }));
  for (const path of normalizedPaths) {
    if (path === "drwn-inventory" || path === "drwn-inventory/manifest.json" || path === "drwn-inventory/payload") continue;
    const owner = [...entryByPayloadRoot.entries()].find(([payloadRoot]) => path === payloadRoot || path.startsWith(`${payloadRoot}/`));
    if (!owner) throw artifactInvalid(`Portable bundle contains an unlisted member: ${path}`);
    const [payloadRoot, entry] = owner;
    if (entry.kind === "mcp" && path !== payloadRoot && path !== `drwn-inventory/${entry.payloadPath}`) {
      throw artifactInvalid(`Portable MCP payload contains an unexpected member: ${path}`);
    }
  }

  for (const entry of manifest.entries) {
    const payload = join(rootDir, "drwn-inventory", ...entry.payloadPath.split("/"));
    if (entry.kind === "skill-package") {
      if (!normalizedPaths.has(`drwn-inventory/${entry.payloadPath}`)) {
        throw artifactInvalid(`Portable bundle is missing skill package payload: ${entry.packageName}`);
      }
      const metrics = await measurePayloadTree(payload);
      if (metrics.fileCount !== entry.fileCount || metrics.directoryCount !== entry.directoryCount || metrics.sizeBytes !== entry.sizeBytes) {
        throw integrityMismatch(`Portable skill package metrics do not match: ${entry.packageName}`);
      }
      if (await hashSkillPackageDirectory(payload) !== entry.integrity) {
        throw integrityMismatch(`Portable skill package integrity does not match: ${entry.packageName}`);
      }
      for (const header of headers.filter((candidate) => candidate.type === "File" && candidate.path.startsWith(`drwn-inventory/${entry.payloadPath}/`))) {
        const rel = header.path.slice(`drwn-inventory/${entry.payloadPath}/`.length);
        inspectSensitiveBytes(`skill-package ${entry.packageName}`, rel, await readFile(join(rootDir, ...header.path.split("/"))));
      }
    } else {
      if (!normalizedPaths.has(`drwn-inventory/${entry.payloadPath}`)) {
        throw artifactInvalid(`Portable bundle is missing MCP payload: ${entry.id}`);
      }
      const bytes = await readFile(payload);
      const expected = canonicalMcpDefinitionBytes(entry.definition);
      if (!Buffer.from(bytes).equals(Buffer.from(expected)) || bytes.byteLength !== entry.sizeBytes || sha256Integrity(bytes) !== entry.integrity) {
        throw integrityMismatch(`Portable MCP payload integrity does not match: ${entry.id}`);
      }
    }
  }
}

export async function validatePortableInventoryBundle(
  bundlePath: string,
  limitOverrides: Partial<PortableBundleLimits> = {},
): Promise<StagedPortableBundle> {
  const sourcePath = resolve(bundlePath);
  const headers = await inspectPortableBundleHeaders(sourcePath, limitOverrides);
  const rootDir = await mkdtemp(join(tmpdir(), "drwn-inventory-validate-"));
  let keep = false;
  try {
    await tar.x({
      file: sourcePath,
      cwd: rootDir,
      strict: true,
      preservePaths: false,
      preserveOwner: false,
      unlink: true,
      noMtime: true,
      maxDepth: limitOverrides.maxPathDepth ?? INVENTORY_TRANSFER_LIMITS.maxPathDepth,
      maxDecompressionRatio: limitOverrides.maxDecompressionRatio ?? INVENTORY_TRANSFER_LIMITS.maxDecompressionRatio,
    });
    await validateExtractedFileHeaders(rootDir, headers);
    const manifestPath = join(rootDir, "drwn-inventory", "manifest.json");
    const manifestBytes = await readFile(manifestPath);
    const manifest = parsePortableInventoryManifestBytes(manifestBytes);
    await validateExtractedClosure(rootDir, headers, manifest);
    const archiveBytes = await readFile(sourcePath);
    let cleaned = false;
    keep = true;
    return {
      kind: "bundle",
      sourcePath,
      rootDir,
      manifest,
      manifestBytes,
      manifestSha256: sha256Integrity(manifestBytes),
      archiveSha256: sha256Integrity(archiveBytes),
      headers,
      cleanup: async () => {
        if (cleaned) return;
        cleaned = true;
        await rm(rootDir, { recursive: true, force: true });
      },
    };
  } catch (error) {
    if (error instanceof DrwnError) throw error;
    throw artifactInvalid("Portable bundle extraction or validation failed", error);
  } finally {
    if (!keep) await rm(rootDir, { recursive: true, force: true });
  }
}

export async function createPortableInventoryBundle(options: { agentsDir: string; outputPath: string }) {
  await assertPortableOutputPath(options.agentsDir, options.outputPath);
  const workRoot = await mkdtemp(join(tmpdir(), "drwn-inventory-create-"));
  const contentRoot = join(workRoot, "content");
  const archivePath = join(workRoot, "bundle.tar.gz");
  try {
    await mkdir(contentRoot, { recursive: true });
    const storeRoot = resolveStoreRoot(options.agentsDir);
    let snapshot: PortableInventorySnapshot;
    let manifestBytes: Uint8Array;
    const stage = async () => {
      snapshot = await snapshotPortableInventory({ agentsDir: options.agentsDir, lock: false });
      manifestBytes = await stageSnapshot(snapshot, contentRoot);
    };
    if (existsSync(storeRoot)) await withInventoryLock(options.agentsDir, stage);
    else await stage();
    await createDeterministicTar(contentRoot, archivePath);
    const validated = await validatePortableInventoryBundle(archivePath);
    try {
      if (!Buffer.from(validated.manifestBytes).equals(Buffer.from(manifestBytes!))) {
        throw integrityMismatch("Created bundle manifest changed during archive validation");
      }
    } finally {
      await validated.cleanup();
    }
    const bytes = await readFile(archivePath);
    const action = await publishPortableOutput(options.outputPath, bytes);
    return {
      action,
      outputPath: resolve(options.outputPath),
      manifest: snapshot!.manifest,
      manifestSha256: sha256Integrity(manifestBytes!),
      archiveSha256: sha256Integrity(bytes),
      sizeBytes: bytes.byteLength,
    };
  } finally {
    await rm(workRoot, { recursive: true, force: true });
  }
}

export async function readPortableInventoryArtifact(sourcePath: string): Promise<PortableInventoryArtifact> {
  const path = resolve(sourcePath);
  let stats;
  try {
    stats = await stat(path);
  } catch (error) {
    throw artifactInvalid(`Unable to read portable inventory artifact: ${path}`, error);
  }
  if (!stats.isFile()) throw artifactInvalid(`Portable inventory artifact is not a regular file: ${path}`);
  if (hasGzipMagic(await readGzipHeader(path))) return validatePortableInventoryBundle(path);
  if (stats.size > INVENTORY_TRANSFER_LIMITS.maxManifestBytes) throw tooLarge("Portable inventory manifest exceeds 4 MiB");
  const bytes = await readFile(path);
  const first = Buffer.from(bytes).toString("utf8").trimStart()[0];
  if (first !== "{") throw artifactInvalid("Portable inventory artifact must be canonical JSON or gzip bundle content");
  const manifest = parsePortableInventoryManifestBytes(bytes);
  return {
    kind: "manifest",
    sourcePath: path,
    manifest,
    manifestBytes: bytes,
    manifestSha256: sha256Integrity(bytes),
    cleanup: async () => {},
  };
}
