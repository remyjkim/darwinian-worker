// ABOUTME: Mutation-tests the release gate for the first supported machine inventory contract.
// ABOUTME: Prevents dormant prototype namespaces and unsafe lifecycle persistence from shipping.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verifyMachineInventoryContract } from "../scripts/verify-release-readiness";

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
