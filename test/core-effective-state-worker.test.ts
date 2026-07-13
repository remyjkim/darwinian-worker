// ABOUTME: Verifies effective state selects exactly one Worker root and expands only its Card closure.
// ABOUTME: Protects projects from implicit multi-root composition and dependency-Card activation.

import { afterEach, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CardLockEntry } from "../cli/core/card-lock";
import { buildEffectiveState, selectActiveWorker } from "../cli/core/effective-state";
import type { ResolvedWorkerGraph } from "../cli/core/worker-graph";
import { cleanupTempRoots, envFor, publishCardWithSkills, runAgentsCli, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => cleanupTempRoots(tempRoots));

function card(name: string): CardLockEntry {
  return {
    name,
    requested: `${name}@1.0.0`,
    version: "1.0.0",
    path: `/tmp/${name}`,
    integrity: `sha256-${name}`,
    manifest: { name, version: "1.0.0" },
    skills: [],
    hooks: [],
    registry: null,
    origin: "file",
  };
}

const graph: ResolvedWorkerGraph = {
  roots: [
    { name: "@me/worker", requested: "@me/worker@1.0.0", kind: "blueprint", members: ["@me/a", "@me/b"] },
    { name: "@me/other", requested: "@me/other@1.0.0", kind: "card", members: [] },
  ],
  cards: [
    { ...card("@me/worker"), manifest: { name: "@me/worker", version: "1.0.0", kind: "blueprint", composedFrom: ["@me/a", "@me/b"] } },
    card("@me/a"),
    card("@me/b"),
    card("@me/other"),
  ],
};

test("zero roots produces no active closure", () => {
  expect(selectActiveWorker({ roots: [], cards: [] }, undefined)).toEqual({ root: null, cards: [] });
});

test("one root is implicitly active", () => {
  const single = { roots: [graph.roots[0]!], cards: graph.cards.slice(0, 3) };
  expect(selectActiveWorker(single, undefined).cards.map((entry) => entry.name)).toEqual([
    "@me/worker", "@me/a", "@me/b",
  ]);
});

test("multiple roots require an explicit selection", () => {
  expect(() => selectActiveWorker(graph, undefined)).toThrow(
    expect.objectContaining({ code: "MULTIPLE_WORKERS_REQUIRE_SELECTION" }),
  );
});

test("explicit root selection expands only root plus ordered members", () => {
  expect(selectActiveWorker(graph, "@me/worker").cards.map((entry) => entry.name)).toEqual([
    "@me/worker", "@me/a", "@me/b",
  ]);
  expect(selectActiveWorker(graph, "@me/other").cards.map((entry) => entry.name)).toEqual(["@me/other"]);
});

test("a dependency Card is not an installed Worker root", () => {
  expect(() => selectActiveWorker(graph, "@me/a")).toThrow(
    expect.objectContaining({ code: "ACTIVE_WORKER_NOT_INSTALLED" }),
  );
});

test("an explicit null selection produces no active closure", () => {
  expect(selectActiveWorker(graph, null)).toEqual({ root: null, cards: [] });
});

async function publishBlueprint(
  fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>,
  name: string,
  composedFrom: string[],
) {
  expect((await runAgentsCli(["card", "new", name, "--no-git"], envFor(fixture))).exitCode).toBe(0);
  const [, scope, cardName] = name.match(/^(@[^/]+)\/(.+)$/)!;
  const manifestPath = join(fixture.agentsDir, "drwn", "sources", scope!, cardName!, "card.json");
  const manifest = JSON.parse(await Bun.file(manifestPath).text());
  manifest.kind = "blueprint";
  manifest.composedFrom = composedFrom;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  expect((await runAgentsCli(["card", "publish", name], envFor(fixture))).exitCode).toBe(0);
}

test("buildEffectiveState projects a selected Blueprint root and all of its members", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/a", skills: ["alpha"] });
  await publishCardWithSkills(fixture, { name: "@me/b", skills: ["beta"] });
  await publishBlueprint(fixture, "@me/worker", ["@me/a@1.0.0", "@me/b@1.0.0"]);
  const projectDir = join(fixture.root, "project");
  await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
  await writeFile(join(projectDir, ".agents", "drwn", "config.json"), '{\n  "version": 2\n}\n');
  const applied = await runAgentsCli(["card", "apply", "@me/worker@1.0.0"], envFor(fixture), projectDir);
  expect(applied).toMatchObject({ exitCode: 0 });

  const state = await buildEffectiveState({
    repoRoot: fixture.repoRoot,
    agentsDir: fixture.agentsDir,
    homeDir: fixture.homeDir,
    cwd: projectDir,
  });

  expect(state.activeCards.map((entry) => entry.name)).toEqual(["@me/worker", "@me/a", "@me/b"]);
  expect(state.skillSelection?.include).toEqual(["alpha", "beta"]);
});
