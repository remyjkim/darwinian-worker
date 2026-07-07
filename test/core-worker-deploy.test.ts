// ABOUTME: Verifies the CLI-side blueprint deploy payload — pinned members + forward-declared governance.
// ABOUTME: A blueprint resolves to a fixed member set; a bare card yields null (degenerate deploy, ref-only).

import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { resolveBlueprintDeployPayload } from "../cli/core/worker-deploy";
import { cleanupTempRoots, envFor, publishCardWithSkills, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];
afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function publishBlueprint(
  fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>,
  name: string,
  composedFrom: string[],
  extra: Record<string, unknown> = {},
) {
  const match = name.match(/^(@[^/]+)\/(.+)$/)!;
  const sourceRoot = join(fixture.agentsDir, "drwn", "sources", match[1]!, match[2]!);
  expect((await runAgentsCli(["card", "new", name, "--no-git"], envFor(fixture))).exitCode).toBe(0);
  const manifestPath = join(sourceRoot, "card.json");
  const manifest = JSON.parse(await Bun.file(manifestPath).text());
  Object.assign(manifest, { kind: "blueprint", composedFrom }, extra);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  expect((await runAgentsCli(["card", "publish", name], envFor(fixture))).exitCode).toBe(0);
}

test("resolveBlueprintDeployPayload pins members and governance for a blueprint", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/react-builder", skills: ["react"] });
  await publishBlueprint(fixture, "@me/frontend-eng", ["@me/react-builder@^1.0.0"], {
    permissions: { can_merge_pr: false },
    evals: ["passes_tests"],
  });

  const payload = await resolveBlueprintDeployPayload(fixture.agentsDir, "@me/frontend-eng@^1.0.0");

  expect(payload).not.toBeNull();
  expect(payload!.members.map((m) => m.name)).toEqual(["@me/react-builder"]);
  expect(payload!.members[0]!.integrity.length).toBeGreaterThan(0);
  expect(payload!.governance.composedFrom).toEqual(["@me/react-builder@^1.0.0"]);
  expect(payload!.governance.permissions).toEqual({ can_merge_pr: false });
  expect(payload!.governance.evals).toEqual(["passes_tests"]);
});

test("resolveBlueprintDeployPayload returns null for a bare card (degenerate deploy)", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/plain", skills: ["x"] });

  expect(await resolveBlueprintDeployPayload(fixture.agentsDir, "@me/plain@^1.0.0")).toBeNull();
});
