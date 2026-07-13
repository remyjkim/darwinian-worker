// ABOUTME: Verifies the standalone drwn-command-bridge package publishing contract.
// ABOUTME: Protects the node-runnable bundle shape used by npx and MCP clients.

import { describe, expect, test } from "bun:test";

const packagePath = new URL("../package.json", import.meta.url);
const licensePath = new URL("../LICENSE", import.meta.url);
const legacyProductPrefix = ["co", "work"].join("");
const legacyPackageName = [legacyProductPrefix, "mcp"].join("-");

async function readPackageJson() {
  expect(await Bun.file(packagePath).exists()).toBe(true);
  return await Bun.file(packagePath).json();
}

describe("package contract", () => {
  test("declares the node-runnable MCP package shape", async () => {
    const packageJson = await readPackageJson();
    expect(packageJson.name).toBe("drwn-command-bridge");
    expect(packageJson.type).toBe("module");
    expect(packageJson.bin).toEqual({ "drwn-command-bridge": "dist/index.js" });
    expect(packageJson.engines).toEqual({ node: ">=20" });
    expect(JSON.stringify(packageJson)).not.toContain(legacyPackageName);
  });

  test("declares public package ownership and licensing metadata", async () => {
    const packageJson = await readPackageJson();
    expect(packageJson.description).toContain("default-deny MCP host bridge");
    expect(packageJson.license).toBe("Apache-2.0");
    expect(packageJson.author).toBeDefined();
    expect(packageJson.repository).toEqual({
      type: "git",
      url: "git+https://github.com/remyjkim/darwinian-worker.git",
      directory: "drwn-command-bridge",
    });
    expect(await Bun.file(licensePath).exists()).toBe(true);
  });

  test("defines build, test, typecheck, and prepack scripts", async () => {
    const packageJson = await readPackageJson();
    expect(packageJson.scripts).toMatchObject({
      build: expect.any(String),
      test: expect.any(String),
      typecheck: expect.any(String),
      prepack: expect.any(String),
      "pack:check": expect.any(String),
      "smoke:macos": expect.any(String),
      verify: expect.any(String),
    });
  });

  test("publishes the built bundle and operator docs", async () => {
    const packageJson = await readPackageJson();
    expect(packageJson.files).toEqual(expect.arrayContaining(["dist", "README.md", "bridge.policy.example.yaml", "LICENSE"]));
  });
});
