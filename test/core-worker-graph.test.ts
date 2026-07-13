// ABOUTME: Verifies Worker roots resolve into an explicit, deterministic Card dependency graph.
// ABOUTME: Protects root/member identity, deduplication, and Blueprint composition boundaries.

import { afterEach, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveWorkerGraph } from "../cli/core/worker-graph";
import { cleanupTempRoots, envFor, publishCardWithSkills, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function publishBlueprint(
  fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>,
  options: { name: string; composedFrom: string[]; version?: string },
) {
  const version = options.version ?? "1.0.0";
  const match = options.name.match(/^(@[^/]+)\/(.+)$/);
  if (!match) throw new Error(`Use a scoped card name in tests: ${options.name}`);
  const [, scope, cardName] = match;
  const sourceRoot = join(fixture.agentsDir, "drwn", "sources", scope!, cardName!);
  if (!(await Bun.file(join(sourceRoot, "card.json")).exists())) {
    expect((await runAgentsCli(["card", "new", options.name, "--no-git"], envFor(fixture))).exitCode).toBe(0);
  }
  const manifestPath = join(sourceRoot, "card.json");
  const manifest = JSON.parse(await Bun.file(manifestPath).text());
  manifest.version = version;
  manifest.kind = "blueprint";
  manifest.composedFrom = options.composedFrom;
  await mkdir(sourceRoot, { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  expect((await runAgentsCli(["card", "publish", options.name], envFor(fixture))).exitCode).toBe(0);
}

test("a Blueprint root resolves to one root record and its ordered member Cards", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/a", skills: ["alpha"] });
  await publishCardWithSkills(fixture, { name: "@me/b", skills: ["beta"] });
  await publishBlueprint(fixture, { name: "@me/worker", composedFrom: ["@me/a@^1.0.0", "@me/b@^1.0.0"] });

  const graph = await resolveWorkerGraph(fixture.agentsDir, ["@me/worker@^1.0.0"]);

  expect(graph.roots).toEqual([
    {
      name: "@me/worker",
      requested: "@me/worker@^1.0.0",
      kind: "blueprint",
      members: ["@me/a", "@me/b"],
    },
  ]);
  expect(graph.cards.map((card) => card.name)).toEqual(["@me/worker", "@me/a", "@me/b"]);
});

test("a plain Card root resolves as a degenerate Worker", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/plain", skills: ["alpha"] });

  const graph = await resolveWorkerGraph(fixture.agentsDir, ["@me/plain@^1.0.0"]);

  expect(graph.roots).toEqual([
    { name: "@me/plain", requested: "@me/plain@^1.0.0", kind: "card", members: [] },
  ]);
  expect(graph.cards.map((card) => card.name)).toEqual(["@me/plain"]);
});

test("two roots may share one identical member Card entry while retaining both edges", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/shared", skills: ["alpha"] });
  await publishBlueprint(fixture, { name: "@me/one", composedFrom: ["@me/shared@^1.0.0"] });
  await publishBlueprint(fixture, { name: "@me/two", composedFrom: ["@me/shared@^1.0.0"] });

  const graph = await resolveWorkerGraph(fixture.agentsDir, ["@me/one@^1.0.0", "@me/two@^1.0.0"]);

  expect(graph.roots.map((root) => root.members)).toEqual([["@me/shared"], ["@me/shared"]]);
  expect(graph.cards.filter((card) => card.name === "@me/shared")).toHaveLength(1);
});

test("two roots resolving one member name to incompatible versions fail", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/shared", version: "1.0.0", skills: ["alpha"] });
  await publishCardWithSkills(fixture, { name: "@me/shared", version: "2.0.0", skills: ["alpha"] });
  await publishBlueprint(fixture, { name: "@me/one", composedFrom: ["@me/shared@1.0.0"] });
  await publishBlueprint(fixture, { name: "@me/two", composedFrom: ["@me/shared@2.0.0"] });

  await expect(
    resolveWorkerGraph(fixture.agentsDir, ["@me/one@^1.0.0", "@me/two@^1.0.0"]),
  ).rejects.toMatchObject({ code: "WORKER_CARD_VERSION_CONFLICT" });
});

test("a Blueprint member may not itself be a Blueprint", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/member", skills: ["alpha"] });
  await publishBlueprint(fixture, { name: "@me/inner", composedFrom: ["@me/member@^1.0.0"] });
  await publishBlueprint(fixture, { name: "@me/outer", composedFrom: ["@me/inner@^1.0.0"] });

  await expect(resolveWorkerGraph(fixture.agentsDir, ["@me/outer@^1.0.0"])).rejects.toMatchObject({
    code: "BLUEPRINT_MEMBER_IS_BLUEPRINT",
  });
});
