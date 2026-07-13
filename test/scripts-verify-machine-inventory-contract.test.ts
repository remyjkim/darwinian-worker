// ABOUTME: Mutation-tests the release gate for the first supported machine inventory contract.
// ABOUTME: Prevents dormant prototype namespaces and unsafe lifecycle persistence from shipping.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  verifyMachineInventoryContract,
  verifyPortableInventoryTransferContract,
} from "../scripts/verify-release-readiness";

const root = join(import.meta.dir, "..");
const source = (path: string) => readFileSync(join(root, path), "utf8");

function expectRejected(overrides: Record<string, string>, detail: RegExp | string) {
  const result = verifyMachineInventoryContract(root, overrides);
  expect(result.ok).toBe(false);
  expect(result.details ?? "").toMatch(detail instanceof RegExp ? detail : new RegExp(detail));
}

describe("machine inventory release contract", () => {
  test("accepts the implemented standalone inventory lifecycle", () => {
    expect(verifyMachineInventoryContract(root)).toEqual({
      name: "machine inventory contract",
      ok: true,
      details: undefined,
    });
  });

  test("rejects obsolete command registration and dormant command files", () => {
    expectRejected({ "cli/index.ts": `${source("cli/index.ts")}\ncli.register(LibraryListCommand);\n` }, /obsolete.*library/i);
    expectRejected({ "cli/commands/store/export.ts": "export class StoreExportCommand {}\n" }, /obsolete.*store/i);
    expectRejected({ "cli/commands/skills/list.ts": "export class SkillsListCommand {}\n" }, /top-level skills/i);
  });

  test("rejects retired inventory terminology in the scan command", () => {
    expectRejected({
      "cli/commands/scan.ts": source("cli/commands/scan.ts")
        .replace("machine inventory, explicit machine selection, and project config", "library, defaults, and project config"),
    }, /scan command.*retired/i);
  });

  test("rejects prototype inventory adapters and whole-record MCP writers", () => {
    expectRejected({ "cli/core/migration.ts": "export function migrateStore() {}\n" }, /prototype inventory/i);
    expectRejected({ "cli/core/mcp-library.ts": `${source("cli/core/mcp-library.ts")}\nexport function writeMcpLibrary() {}\n` }, /whole-MCP/i);
  });

  test("rejects mutable package versions, weak digest checks, and unsafe pointers", () => {
    expectRejected({
      "cli/core/skill-packages.ts": source("cli/core/skill-packages.ts").replace(
        "if (existingIntegrity !== stagedIntegrity)",
        "if (false)",
      ),
    }, /immutable version digest/i);
    expectRejected({
      "cli/core/skill-packages.ts": source("cli/core/skill-packages.ts").replace(
        "await writeAtomically(currentPath, `${options.version}\\n`);",
        "await symlink(options.version, currentPath);",
      ),
    }, /regular atomic current pointer/i);
  });

  test("rejects per-record locking and unlocked reference writers", () => {
    expectRejected({ "cli/core/mcp-library.ts": `${source("cli/core/mcp-library.ts")}\nwithOwnerLock(recordPath, mutate);\n` }, /per-record mutation lock/i);
    expectRejected({
      "cli/core/project-registry.ts": source("cli/core/project-registry.ts").replaceAll("withInventoryLock", "withoutInventoryLock"),
    }, /project registry.*inventory lock/i);
    expectRejected({
      "cli/core/project-writes.ts": source("cli/core/project-writes.ts").replaceAll("withInventoryLock", "withoutInventoryLock"),
    }, /project reference.*inventory lock/i);
  });

  test("rejects unresolved-force removal and current-record garbage collection", () => {
    expectRejected({ "cli/commands/machine/skill.ts": `${source("cli/commands/machine/skill.ts")}\nOption.Boolean("--force-unresolved");\n` }, /force-unresolved/i);
    expectRejected({
      "cli/core/inventory-gc.ts": source("cli/core/inventory-gc.ts").replace(
        'reason: "current-package-version"',
        'reason: "superseded-package-version"',
      ),
    }, /current inventory/i);
  });

  test("requires lifecycle commands, references, tombstones, and old-path negative tests", () => {
    expectRejected({
      "cli/commands/machine/skill.ts": source("cli/commands/machine/skill.ts").replace('["machine", "skill", "references"]', '["machine", "skill", "refs"]'),
    }, /machine skill references/i);
    expectRejected({
      "cli/core/inventory-tombstones.ts": source("cli/core/inventory-tombstones.ts").replaceAll("recoverInventoryTombstones", "recoverRemovedInventory"),
    }, /tombstone recovery/i);
    expectRejected({
      "test/commands-machine-inventory-shape.test.ts": source("test/commands-machine-inventory-shape.test.ts").replace('"drwn library "', '"drwn retired-library "'),
    }, /old-path negative tests/i);
    expectRejected({
      "cli/commands/status.ts": source("cli/commands/status.ts").replace('Option.Boolean("--machine"', 'Option.Boolean("--retired-machine"'),
    }, /machine-scoped status/i);
  });

  test("rejects broad Store archive creation", () => {
    expectRejected({
      "cli/core/worker-deploy.ts": source("cli/core/worker-deploy.ts").replace(
        'new Set<string>(["drwn/store.json"])',
        'new Set<string>(["drwn"])',
      ),
    }, /Store root archive/i);
  });
});

describe("portable machine inventory transfer release contract", () => {
  test("accepts the implemented strict additive transfer contract", () => {
    expect(verifyPortableInventoryTransferContract(root)).toEqual({
      name: "portable machine inventory transfer",
      ok: true,
      details: undefined,
    });
  });

  test("requires every command registration and negative option coverage", () => {
    expectRejectedPortable({
      "cli/index.ts": source("cli/index.ts").replace("cli.register(MachineInventoryBundleCommand);", ""),
    }, /bundle command is not registered/i);
    expectRejectedPortable({
      "cli/commands/machine/inventory.ts": `${source("cli/commands/machine/inventory.ts")}\nOption.Boolean("--replace");\n`,
    }, /forbidden transfer option/i);
    expectRejectedPortable({
      "test/commands-machine-inventory-shape.test.ts": source("test/commands-machine-inventory-shape.test.ts")
        .replaceAll('"--replace"', '"--retired-replace"'),
    }, /negative transfer option coverage/i);
  });

  test("rejects broad Store sources and forbidden state dependencies", () => {
    expectRejectedPortable({
      "cli/core/inventory-bundle.ts": source("cli/core/inventory-bundle.ts").replace(
        "const root = join(contentRoot, \"drwn-inventory\");",
        "const storeSource = resolveStoreRoot(snapshot.agentsDir);\n  const root = join(contentRoot, \"drwn-inventory\");",
      ),
    }, /whole Store source/i);
    expectRejectedPortable({
      "cli/core/inventory-bundle.ts": `${source("cli/core/inventory-bundle.ts")}\nconst unsafeArchive = { entries: ["drwn"] };\n`,
    }, /whole Store source/i);
    expectRejectedPortable({
      "cli/core/inventory-transfer.ts": `import { seedStore } from "./store-seed";\n${source("cli/core/inventory-transfer.ts")}`,
    }, /forbidden managed-state dependency/i);
  });

  test("rejects weakened archive, integrity, secret, and limit enforcement", () => {
    expectRejectedPortable({
      "cli/core/inventory-bundle.ts": source("cli/core/inventory-bundle.ts")
        .replace("if (!regular && !directory)", "if (false && !regular && !directory)"),
    }, /concrete archive member enforcement/i);
    expectRejectedPortable({
      "cli/core/inventory-bundle.ts": source("cli/core/inventory-bundle.ts")
        .replaceAll("PRIVATE_KEY_MARKERS", "IGNORED_PEM_MARKERS"),
    }, /private-key secret detection/i);
    expectRejectedPortable({
      "cli/core/inventory-portable.ts": source("cli/core/inventory-portable.ts")
        .replace("maxCompressedBundleBytes: 512 * 1024 * 1024", "maxCompressedBundleBytes: Number.MAX_SAFE_INTEGER"),
    }, /compressed bundle limit/i);
  });

  test("requires locked revalidation and Task 81 commit helpers", () => {
    expectRejectedPortable({
      "cli/core/inventory-transfer.ts": source("cli/core/inventory-transfer.ts")
        .replace("return await withInventoryLock(options.agentsDir", "return await withoutInventoryLock(options.agentsDir"),
    }, /global inventory lock/i);
    expectRejectedPortable({
      "cli/core/inventory-transfer.ts": source("cli/core/inventory-transfer.ts")
        .replaceAll("installSkillBundleRoot", "installPortableSkillDirectly"),
    }, /Task 81 skill package helper/i);
    expectRejectedPortable({
      "cli/core/inventory-transfer.ts": source("cli/core/inventory-transfer.ts")
        .replaceAll("createMcpLibraryRecord", "writePortableMcpDirectly"),
    }, /Task 81 MCP record helper/i);
  });

  test("rejects stale or unsafe transfer documentation", () => {
    expectRejectedPortable({
      "README.md": `${source("README.md")}\nPortable inventory transfer is a full backup and restore carrying credentials.\n`,
    }, /backup or credential-carrying transfer claim/i);
    expectRejectedPortable({
      "docs-docusaurus/docs/reference/cli/machine.md": source("docs-docusaurus/docs/reference/cli/machine.md")
        .replace("checksum is not authenticity", "checksum proves authenticity"),
    }, /checksum and authenticity boundary/i);
  });
});

function expectRejectedPortable(overrides: Record<string, string>, detail: RegExp | string) {
  const result = verifyPortableInventoryTransferContract(root, overrides);
  expect(result.ok).toBe(false);
  expect(result.details ?? "").toMatch(detail instanceof RegExp ? detail : new RegExp(detail));
}
