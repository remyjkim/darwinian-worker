// ABOUTME: Verifies package wiring for repo-local and globally linked CLI execution modes.
// ABOUTME: Protects the `drwn` script and binary metadata needed for `bun link` workflows.

import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

describe("CLI install mode", () => {
  test("package.json exposes repo-local and binary entrypoints", async () => {
    const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as {
      name?: string;
      scripts?: Record<string, string>;
      bin?: string | Record<string, string>;
    };

    expect(pkg.name).toBe("darwinian-harness");
    expect(pkg.scripts?.drwn).toBe("bun run cli/index.ts");
    expect(typeof pkg.bin).toBe("object");
    expect((pkg.bin as Record<string, string>).drwn).toBe("cli/index.ts");
    expect((pkg.bin as Record<string, string>)["drwn-hx"]).toBe("cli/index.ts");
  });
});
