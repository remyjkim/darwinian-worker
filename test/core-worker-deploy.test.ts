// ABOUTME: Verifies the CLI-side worker deploy payload contract.
// ABOUTME: Bare cards and blueprints both materialize through the portable lockfile + store-export bridge.

import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { seedStore } from "../cli/core/store-seed";
import { buildWorkerDeployPayload, type WorkerDeployPayload } from "../cli/core/worker-deploy";
import { cleanupTempRoots, envFor, publishCardWithSkills, runAgentsCli, scaffoldCliFixture } from "./helpers";
import fixturePayload from "./contract/deploy-payload.v1.json";

const tempRoots: string[] = [];
const contractFixture = fixturePayload as unknown as {
  bareCard: WorkerDeployPayload;
  blueprint: WorkerDeployPayload;
};

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

function normalizeForFixture(payload: WorkerDeployPayload): WorkerDeployPayload {
  const normalized = JSON.parse(JSON.stringify(payload)) as WorkerDeployPayload;
  normalized.storeExport.sha256 = "sha256-normalized";
  normalized.storeExport.byteLength = 0;
  normalized.storeExport.bytesBase64 = "base64-normalized";
  for (const card of normalized.lockfile.cards) {
    if (card.git?.commit) {
      card.git.commit = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    }
  }
  return normalized;
}

async function publishBlueprintFixture(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  await publishCardWithSkills(fixture, { name: "@me/react-builder", skills: ["react"] });
  await publishBlueprint(fixture, "@me/frontend-eng", ["@me/react-builder@^1.0.0"], {
    permissions: { canMergePr: false },
    evals: ["passes_tests"],
    identity: { instructions: "Blueprint identity." },
  });
}

test("buildWorkerDeployPayload emits the v1 contract for a bare card", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/plain", skills: ["plain"] });

  const payload = await buildWorkerDeployPayload({
    agentsDir: fixture.agentsDir,
    cardRef: "@me/plain@^1.0.0",
  });

  expect(normalizeForFixture(payload)).toEqual(contractFixture.bareCard);
});

test("buildWorkerDeployPayload emits the v1 contract for a blueprint", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishBlueprintFixture(fixture);

  const payload = await buildWorkerDeployPayload({
    agentsDir: fixture.agentsDir,
    cardRef: "@me/frontend-eng@^1.0.0",
  });

  expect(normalizeForFixture(payload)).toEqual(contractFixture.blueprint);
});

test("buildWorkerDeployPayload storeExport decodes and seeds a store", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishBlueprintFixture(fixture);

  const payload = await buildWorkerDeployPayload({
    agentsDir: fixture.agentsDir,
    cardRef: "@me/frontend-eng@^1.0.0",
  });
  const bytes = Buffer.from(payload.storeExport.bytesBase64, "base64");

  expect(bytes.byteLength).toBe(payload.storeExport.byteLength);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(payload.storeExport.sha256);

  const seedRoot = await mkdtemp(join(tmpdir(), "drwn-deploy-seed-"));
  const tarPath = join(seedRoot, "store.tar");
  await Bun.write(tarPath, bytes);
  const agentsDir = join(seedRoot, ".agents");
  await seedStore({ agentsDir, source: { kind: "tar", path: tarPath } });

  for (const card of payload.lockfile.cards) {
    expect(await Bun.file(join(agentsDir, card.path, "card.json")).exists()).toBe(true);
  }
});
