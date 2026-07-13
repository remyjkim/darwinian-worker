// ABOUTME: Freezes the strict deterministic schema for portable standalone inventory.
// ABOUTME: Rejects ambiguous identity, paths, definitions, and non-canonical manifest bytes.

import { describe, expect, test } from "bun:test";
import {
  INVENTORY_TRANSFER_LIMITS,
  buildPortableInventoryManifest,
  canonicalJsonBytes,
  canonicalMcpDefinitionBytes,
  parsePortableInventoryManifest,
  parsePortableInventoryManifestBytes,
  portablePayloadPath,
  sha256Integrity,
  type PortableInventoryEntryInput,
} from "../cli/core/inventory-portable";

const skillInput = {
  kind: "skill-package",
  packageName: "@acme/toolkit",
  activeVersion: "1.2.3",
  exportedSkillIds: ["zeta", "alpha"],
  fileCount: 3,
  directoryCount: 2,
  sizeBytes: 120,
  integrity: `sha256-${"a".repeat(64)}`,
} satisfies PortableInventoryEntryInput;

const mcpInput = {
  kind: "mcp",
  id: "context-api",
  definition: {
    optional: false,
    transport: "http",
    description: "Context API",
    url: "https://example.test/mcp",
    headers: { Authorization: "${CONTEXT_TOKEN}" },
  },
} satisfies PortableInventoryEntryInput;

describe("portable inventory manifest V1", () => {
  test("sorts identities, exported skills, and assigns opaque positional payload paths", () => {
    const mcpBytes = canonicalMcpDefinitionBytes(mcpInput.definition);
    const portableMcp = {
      ...mcpInput,
      sizeBytes: mcpBytes.byteLength,
      integrity: sha256Integrity(mcpBytes),
    };
    const manifest = buildPortableInventoryManifest([
      { ...mcpInput, id: "z-server" },
      { ...skillInput, packageName: "z-package", exportedSkillIds: ["zeta", "z-alpha"] },
      { ...mcpInput, id: "a-server" },
      { ...skillInput, packageName: "a-package", exportedSkillIds: ["beta", "a-alpha"] },
    ]);

    expect(manifest).toEqual({
      schema: "drwn.portable-inventory",
      schemaVersion: 1,
      entries: [
        { ...skillInput, packageName: "a-package", exportedSkillIds: ["a-alpha", "beta"], payloadPath: "payload/000000" },
        { ...skillInput, packageName: "z-package", exportedSkillIds: ["z-alpha", "zeta"], payloadPath: "payload/000001" },
        { ...portableMcp, id: "a-server", payloadPath: "payload/000002/record.json" },
        { ...portableMcp, id: "z-server", payloadPath: "payload/000003/record.json" },
      ],
    });
    expect(portablePayloadPath(12, "skill-package")).toBe("payload/000012");
    expect(portablePayloadPath(12, "mcp")).toBe("payload/000012/record.json");
  });

  test("emits recursively key-sorted UTF-8 JSON with one LF and no host metadata", () => {
    const manifest = buildPortableInventoryManifest([mcpInput, skillInput]);
    const first = canonicalJsonBytes(manifest);
    const second = canonicalJsonBytes(structuredClone(manifest));
    const text = new TextDecoder().decode(first);

    expect(first).toEqual(second);
    expect(text.endsWith("\n")).toBe(true);
    expect(text.endsWith("\n\n")).toBe(false);
    expect(text.indexOf('"entries"')).toBeLessThan(text.indexOf('"schema"'));
    expect(text).not.toContain("createdAt");
    expect(text).not.toContain("cliVersion");
    expect(text).not.toContain(process.env.HOME ?? "__missing_home__");
    expect(sha256Integrity(first)).toMatch(/^sha256-[a-f0-9]{64}$/);
  });

  test("uses locale-independent lexical order for canonical identities and object keys", () => {
    const manifest = buildPortableInventoryManifest([
      { ...skillInput, packageName: "a-package", exportedSkillIds: ["a-skill"] },
      { ...skillInput, packageName: "Z-package", exportedSkillIds: ["Z-skill"] },
    ]);

    expect(manifest.entries.map((entry) => entry.kind === "skill-package" ? entry.packageName : entry.id))
      .toEqual(["Z-package", "a-package"]);
    expect(new TextDecoder().decode(canonicalJsonBytes({ a: 1, Z: 2 })).indexOf('"Z"'))
      .toBeLessThan(new TextDecoder().decode(canonicalJsonBytes({ a: 1, Z: 2 })).indexOf('"a"'));
  });

  test("canonicalizes MCP definitions independently of source key order", () => {
    const left = canonicalMcpDefinitionBytes({
      description: "GitHub",
      transport: "stdio",
      command: "npx",
      args: ["-y", "server"],
      env: { TOKEN: "${GITHUB_TOKEN}" },
      optional: true,
    });
    const right = canonicalMcpDefinitionBytes({
      optional: true,
      env: { TOKEN: "${GITHUB_TOKEN}" },
      args: ["-y", "server"],
      command: "npx",
      transport: "stdio",
      description: "GitHub",
    });

    expect(left).toEqual(right);
  });

  test("parses only strict schema V1 and rejects unknown keys at every level", () => {
    const valid = buildPortableInventoryManifest([skillInput, mcpInput]);
    const validMcp = valid.entries.find((entry) => entry.kind === "mcp")!;
    expect(parsePortableInventoryManifest(valid)).toEqual(valid);

    expect(() => parsePortableInventoryManifest({ ...valid, createdAt: "2026-01-01T00:00:00Z" })).toThrow(
      expect.objectContaining({ code: "INVENTORY_TRANSFER_SCHEMA_INVALID" }),
    );
    expect(() => parsePortableInventoryManifest({
      ...valid,
      entries: [{ ...valid.entries[0], sourcePath: "/tmp/private" }, valid.entries[1]],
    })).toThrow(expect.objectContaining({ code: "INVENTORY_TRANSFER_SCHEMA_INVALID" }));
    expect(() => parsePortableInventoryManifest({
      ...valid,
      entries: [valid.entries[0], {
        ...validMcp,
        definition: { ...validMcp.definition, token: "literal" },
      }],
    })).toThrow(expect.objectContaining({ code: "INVENTORY_TRANSFER_SCHEMA_INVALID" }));
  });

  test("distinguishes unsupported schema identity or version from malformed schema", () => {
    const valid = buildPortableInventoryManifest([]);
    expect(() => parsePortableInventoryManifest({ ...valid, schema: "drwn.other" })).toThrow(
      expect.objectContaining({ code: "INVENTORY_TRANSFER_SCHEMA_UNSUPPORTED" }),
    );
    expect(() => parsePortableInventoryManifest({ ...valid, schemaVersion: 2 })).toThrow(
      expect.objectContaining({ code: "INVENTORY_TRANSFER_SCHEMA_UNSUPPORTED" }),
    );
    expect(() => parsePortableInventoryManifest({ schema: valid.schema, schemaVersion: 1 })).toThrow(
      expect.objectContaining({ code: "INVENTORY_TRANSFER_SCHEMA_INVALID" }),
    );
  });

  test("rejects duplicate identities, duplicate exported skill IDs, and cross-package skill ownership", () => {
    expect(() => buildPortableInventoryManifest([skillInput, skillInput])).toThrow(
      expect.objectContaining({ code: "INVENTORY_TRANSFER_SCHEMA_INVALID" }),
    );
    expect(() => buildPortableInventoryManifest([
      { ...skillInput, exportedSkillIds: ["alpha", "alpha"] },
    ])).toThrow(expect.objectContaining({ code: "INVENTORY_TRANSFER_SCHEMA_INVALID" }));
    expect(() => buildPortableInventoryManifest([
      { ...skillInput, packageName: "one", exportedSkillIds: ["shared-id"] },
      { ...skillInput, packageName: "two", exportedSkillIds: ["shared-id"] },
    ])).toThrow(expect.objectContaining({ code: "INVENTORY_TRANSFER_SCHEMA_INVALID" }));
    expect(() => buildPortableInventoryManifest([mcpInput, mcpInput])).toThrow(
      expect.objectContaining({ code: "INVENTORY_TRANSFER_SCHEMA_INVALID" }),
    );
  });

  test("rejects unsafe identities, semantic versions, hashes, counts, and payload positions", () => {
    const manifest = buildPortableInventoryManifest([skillInput]);
    const entry = manifest.entries[0]!;
    const invalidValues = [
      { ...entry, packageName: "../escape" },
      { ...entry, activeVersion: "latest" },
      { ...entry, integrity: "sha256-nope" },
      { ...entry, fileCount: -1 },
      { ...entry, directoryCount: 1.5 },
      { ...entry, sizeBytes: Number.NaN },
      { ...entry, payloadPath: "payload/@acme/toolkit" },
      { ...entry, payloadPath: "payload/000001" },
    ];

    for (const invalid of invalidValues) {
      expect(() => parsePortableInventoryManifest({ ...manifest, entries: [invalid] })).toThrow(
        expect.objectContaining({ code: "INVENTORY_TRANSFER_SCHEMA_INVALID" }),
      );
    }
  });

  test("rejects incomplete or unsupported MCP transports and resolved secret literals", () => {
    const invalidDefinitions = [
      { description: "stdio", transport: "stdio", optional: true },
      { description: "http", transport: "http", optional: true },
      { description: "bad", transport: "websocket", url: "wss://example.test", optional: true },
      {
        description: "secret",
        transport: "http",
        url: "https://example.test",
        headers: { Authorization: "Bearer hard-coded-secret" },
        optional: true,
      },
    ];

    for (const definition of invalidDefinitions) {
      expect(() => buildPortableInventoryManifest([{ ...mcpInput, definition } as PortableInventoryEntryInput])).toThrow(
        expect.objectContaining({ code: "INVENTORY_TRANSFER_SCHEMA_INVALID" }),
      );
    }
  });

  test("requires canonical bytes when parsing a persisted manifest", () => {
    const manifest = buildPortableInventoryManifest([skillInput]);
    const canonical = canonicalJsonBytes(manifest);
    expect(parsePortableInventoryManifestBytes(canonical)).toEqual(manifest);

    const nonCanonical = new TextEncoder().encode(JSON.stringify(manifest));
    expect(() => parsePortableInventoryManifestBytes(nonCanonical)).toThrow(
      expect.objectContaining({ code: "INVENTORY_TRANSFER_ARTIFACT_INVALID" }),
    );
    expect(() => parsePortableInventoryManifestBytes(new TextEncoder().encode("not-json\n"))).toThrow(
      expect.objectContaining({ code: "INVENTORY_TRANSFER_SCHEMA_INVALID" }),
    );
  });

  test("pins the approved V1 transfer limits", () => {
    expect(INVENTORY_TRANSFER_LIMITS).toEqual({
      maxCompressedBundleBytes: 512 * 1024 * 1024,
      maxPayloadBytes: 2 * 1024 * 1024 * 1024,
      maxRegularFileBytes: 256 * 1024 * 1024,
      maxManifestBytes: 4 * 1024 * 1024,
      maxArchiveMembers: 100_000,
      maxPathDepth: 64,
      maxDecompressionRatio: 200,
    });
  });
});
