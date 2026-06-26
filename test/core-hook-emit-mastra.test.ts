// ABOUTME: Verifies Mastra hook composer TypeScript emission.
// ABOUTME: Protects the in-process adapter handoff used by Mastra consumers.

import { afterEach, describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { emitMastraComposer } from "../cli/core/hook-generator/emit-mastra-composer";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

describe("emitMastraComposer", () => {
  it("writes a composer.ts with absolute policy imports in deterministic order", async () => {
    const root = await createTempRoot("hook-mastra-");
    tempRoots.push(root);
    const first = join(root, "extracted", "a", "hooks", "deny", "policy.ts");
    const second = join(root, "extracted", "b", "hooks", "audit", "policy.ts");

    const path = await emitMastraComposer({
      outputDir: join(root, "generated", "hooks", "mastra"),
      policies: [
        { cardName: "@me/security", policyName: "deny", policyTsPath: first },
        { cardName: "@me/audit", policyName: "audit", policyTsPath: second },
      ],
    });

    const text = await readFile(path, "utf8");
    expect(path.endsWith("composer.ts")).toBe(true);
    expect(text).toContain(`from ${JSON.stringify(first)}`);
    expect(text).toContain(`from ${JSON.stringify(second)}`);
    expect(text).toContain("export const policies = [policy_0__me_security_deny, policy_1__me_audit_audit];");
    expect(text).toContain('export { composeToolHooks } from "darwinian-mind/hook-policy";');
  });
});
