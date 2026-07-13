// ABOUTME: Verifies the first supported project and local config schemas are strict and self-identifying.
// ABOUTME: Protects the clean-slate boundary from prototype readers, normalization, and side effects.

import { afterEach, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => cleanupTempRoots(tempRoots));

function canonicalProject(overrides: Record<string, unknown> = {}) {
  return {
    schema: "drwn.project-config" as const,
    schemaVersion: 1 as const,
    workers: [],
    activeWorker: null,
    ...overrides,
  };
}

async function writeProject(root: string, value: unknown) {
  const path = join(root, ".agents", "drwn", "config.json");
  await mkdir(dirname(path), { recursive: true });
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(path, bytes);
  return { path, bytes };
}

async function expectCode(operation: Promise<unknown>, code: string) {
  try {
    await operation;
    throw new Error(`Expected ${code}`);
  } catch (error) {
    expect(error).toHaveProperty("code", code);
  }
}

test("loadProjectConfig accepts the canonical namespaced schema without rewriting it", async () => {
  const root = await createTempRoot("project-schema-");
  tempRoots.push(root);
  const value = canonicalProject({
    mcpServers: { context7: { enabled: true } },
    skills: { include: ["alpha"] },
  });
  const { path, bytes } = await writeProject(root, value);
  const { loadProjectConfig } = await import("../cli/core/project");

  expect(await loadProjectConfig(path)).toEqual(value);
  expect(await readFile(path, "utf8")).toBe(bytes);
});

test.each([
  [{ version: 1, cards: [], activeWorkers: [] }, "prototype fields"],
  [{ schemaVersion: 1, workers: [], activeWorker: null }, "missing schema identity"],
  [{ schema: "drwn.project-config", schemaVersion: 2, workers: [], activeWorker: null }, "unsupported version"],
  [{ schema: "drwn.other", schemaVersion: 1, workers: [], activeWorker: null }, "wrong schema identity"],
  [{ schema: "drwn.project-config", schemaVersion: 1, workers: [] }, "missing activeWorker"],
  [canonicalProject({ activeWorker: 42 }), "invalid activeWorker"],
  [canonicalProject({ workers: "@me/worker" }), "invalid workers"],
  [canonicalProject({ cards: [] }), "prohibited prototype field"],
  [canonicalProject({ unknown: true }), "unknown field"],
] as const)("loadProjectConfig rejects %s (%s) without changing bytes", async (value) => {
  const root = await createTempRoot("project-schema-invalid-");
  tempRoots.push(root);
  const { path, bytes } = await writeProject(root, value);
  const { loadProjectConfig } = await import("../cli/core/project");

  await expectCode(loadProjectConfig(path), "PROJECT_CONFIG_INVALID");
  expect(await readFile(path, "utf8")).toBe(bytes);
});

test("scaffoldProjectConfig writes the supported explicit empty state", async () => {
  const root = await createTempRoot("project-schema-scaffold-");
  tempRoots.push(root);
  const { scaffoldProjectConfig } = await import("../cli/core/project");

  const path = await scaffoldProjectConfig(root);

  expect(JSON.parse(await readFile(path, "utf8"))).toEqual(canonicalProject());
});

test("scaffoldProjectConfig --force rejects prototype state without rewriting it", async () => {
  const root = await createTempRoot("project-schema-force-");
  tempRoots.push(root);
  const { path, bytes } = await writeProject(root, { version: 1, cards: ["@me/old"] });
  const { scaffoldProjectConfig } = await import("../cli/core/project");

  await expectCode(scaffoldProjectConfig(root, { force: true }), "PROJECT_CONFIG_INVALID");
  expect(await readFile(path, "utf8")).toBe(bytes);
});

test("project mutation helpers reject prototype config without rewriting it", async () => {
  const root = await createTempRoot("project-schema-write-");
  tempRoots.push(root);
  const { path, bytes } = await writeProject(root, { version: 1, skills: { include: ["alpha"] } });
  const { includeProjectSkill } = await import("../cli/core/project-writes");

  expect(() => includeProjectSkill(root, "beta")).toThrow();
  expect(await readFile(path, "utf8")).toBe(bytes);
});

test("loadConfigLocal accepts only namespaced local schema V1", async () => {
  const root = await createTempRoot("project-local-schema-");
  tempRoots.push(root);
  const path = join(root, ".agents", "drwn", "config.local.json");
  await mkdir(dirname(path), { recursive: true });
  const value = {
    schema: "drwn.project-local" as const,
    schemaVersion: 1 as const,
    activeWorker: "@me/local",
    cardReplacements: { "@me/member": "file:/tmp/member" },
    localOnlyRoots: ["file:/tmp/local"],
    sourceOverrides: { "@me/member": "file:/tmp/member" },
  };
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
  const { loadConfigLocal } = await import("../cli/core/config-local");

  expect(await loadConfigLocal(root)).toEqual(value);
});

test.each([
  { activate: ["@me/one"] },
  { schema: "drwn.project-local", schemaVersion: 2 },
  { schema: "drwn.project-local", schemaVersion: 1, activeWorker: ["@me/one"] },
  { schema: "drwn.project-local", schemaVersion: 1, unknown: true },
])("loadConfigLocal rejects unsupported local config %#", async (value) => {
  const root = await createTempRoot("project-local-schema-invalid-");
  tempRoots.push(root);
  const path = join(root, ".agents", "drwn", "config.local.json");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
  const { loadConfigLocal } = await import("../cli/core/config-local");

  await expectCode(loadConfigLocal(root), "PROJECT_CONFIG_INVALID");
});
