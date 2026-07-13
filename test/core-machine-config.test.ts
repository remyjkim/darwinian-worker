// ABOUTME: Verifies the first supported machine capability schema and file lifecycle.
// ABOUTME: Rejects prototype and permissive config behavior without migration or side effects.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DrwnError } from "../cli/core/errors";
import {
  createEmptyMachineConfig,
  initializeMachineConfig,
  parseMachineConfig,
  readMachineConfigFile,
  writeMachineConfigFile,
} from "../cli/core/machine-config";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

function validProfile() {
  return {
    id: "darwinian-operator" as const,
    source: "git+https://github.com/curation-labs/darwinian-operator.git#v1.0.2" as const,
    name: "@darwinian/operator" as const,
    version: "1.0.2" as const,
    commit: "6b2998c51b7c736c70c2e522cb8d7b3170e816d8",
    treeSha: "2297dfc30783200a2b6a0da1189d7de20a01f23c",
    integrity: "sha256-284cd3ba4880a60ba93b81c0be0dd15796b27a640ed697fdb1a18fe6b5ff30d9" as const,
    skills: ["bootstrap-project", "manage-defaults"],
    mcpServers: [],
  };
}

function expectInvalid(value: unknown) {
  try {
    parseMachineConfig(value);
    throw new Error("expected machine config to be rejected");
  } catch (error) {
    expect(error).toBeInstanceOf(DrwnError);
    expect((error as DrwnError).code).toBe("MACHINE_CONFIG_INVALID");
  }
}

describe("machine config V1", () => {
  test("defines exact empty machine intent", () => {
    expect(createEmptyMachineConfig()).toEqual({
      schema: "drwn.machine",
      schemaVersion: 1,
      policy: {},
      capabilities: { profile: null, skills: [], mcpServers: [] },
    });
  });

  test("accepts strict policy and a pinned approved profile subset", () => {
    const config = {
      schema: "drwn.machine" as const,
      schemaVersion: 1 as const,
      policy: {
        authoring: { scope: "@me" },
        targets: { codex: { enabled: false } },
        analyzer: { apiUrl: "https://analyzer.test", maxArchiveBytes: 1024 },
        trustedSources: { strict: true, gitHosts: ["github.com"] },
      },
      capabilities: {
        profile: validProfile(),
        skills: ["local-skill"],
        mcpServers: ["notion"],
      },
    };

    expect(parseMachineConfig(config)).toEqual(config);
  });

  test("rejects unknown fields at every object boundary", () => {
    const base = createEmptyMachineConfig();
    const cases: unknown[] = [
      { ...base, unexpected: true },
      { ...base, policy: { unexpected: true } },
      { ...base, policy: { authoring: { unexpected: true } } },
      { ...base, policy: { targets: { codex: { unexpected: true } } } },
      { ...base, policy: { analyzer: { unexpected: true } } },
      { ...base, capabilities: { ...base.capabilities, unexpected: true } },
      { ...base, capabilities: { ...base.capabilities, profile: { ...validProfile(), unexpected: true } } },
    ];

    for (const value of cases) {
      expectInvalid(value);
    }
  });

  test("rejects prototype fields and unsupported schema identities", () => {
    expectInvalid({ version: 1, optional: {}, defaults: { skills: [] } });
    expectInvalid({ ...createEmptyMachineConfig(), schema: "drwn.machine-v2" });
    expectInvalid({ ...createEmptyMachineConfig(), schemaVersion: 2 });
  });

  test("rejects duplicate capability IDs", () => {
    const base = createEmptyMachineConfig();
    expectInvalid({ ...base, capabilities: { ...base.capabilities, skills: ["alpha", "alpha"] } });
    expectInvalid({ ...base, capabilities: { ...base.capabilities, mcpServers: ["notion", "notion"] } });
  });

  test("rejects malformed and unapproved profile pins", () => {
    const base = createEmptyMachineConfig();
    expectInvalid({ ...base, capabilities: { ...base.capabilities, profile: { ...validProfile(), commit: "mutable" } } });
    expectInvalid({ ...base, capabilities: { ...base.capabilities, profile: { ...validProfile(), skills: ["not-approved"] } } });
    expectInvalid({ ...base, capabilities: { ...base.capabilities, profile: { ...validProfile(), mcpServers: ["notion"] } } });
  });

  test("missing reads are side-effect free", async () => {
    const root = await createTempRoot("machine-read-");
    tempRoots.push(root);
    const path = join(root, "missing", "machine.json");

    expect(await readMachineConfigFile(path)).toBeNull();
    expect(existsSync(join(root, "missing"))).toBe(false);
  });

  test("initialization is exact and byte-identical on repeat", async () => {
    const root = await createTempRoot("machine-init-");
    tempRoots.push(root);
    const path = join(root, "drwn", "machine.json");

    expect((await initializeMachineConfig(path)).created).toBe(true);
    const first = await readFile(path, "utf8");
    expect(JSON.parse(first)).toEqual(createEmptyMachineConfig());
    expect((await initializeMachineConfig(path)).created).toBe(false);
    expect(await readFile(path, "utf8")).toBe(first);
  });

  test("writes validate before atomically replacing bytes", async () => {
    const root = await createTempRoot("machine-write-");
    tempRoots.push(root);
    const path = join(root, "drwn", "machine.json");
    await mkdir(join(root, "drwn"), { recursive: true });
    await writeFile(path, "sentinel\n");

    await expect(writeMachineConfigFile(path, { version: 1 } as never)).rejects.toMatchObject({
      code: "MACHINE_CONFIG_INVALID",
    });
    expect(await readFile(path, "utf8")).toBe("sentinel\n");
  });

  test("wraps invalid JSON in the stable machine error", async () => {
    const root = await createTempRoot("machine-json-");
    tempRoots.push(root);
    const path = join(root, "machine.json");
    await writeFile(path, "{not-json\n");

    await expect(readMachineConfigFile(path)).rejects.toMatchObject({ code: "MACHINE_CONFIG_INVALID" });
  });
});
