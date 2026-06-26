// ABOUTME: Verifies publish and resolution validation for persona, beliefs, and memory card content.
// ABOUTME: Protects complete mind-card sources from producing incomplete published trees.

import { afterEach, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { computeCardIntegrity, publishCard, resolveCard } from "../cli/core/card-store";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function scaffoldSource(options?: {
  complete?: boolean;
  invalidJsonl?: boolean;
}) {
  const root = await createTempRoot("card-publish-mind-");
  tempRoots.push(root);
  const agentsDir = join(root, "agents");
  const sourceDir = join(agentsDir, "drwn", "sources", "@me", "mind");
  await mkdir(sourceDir, { recursive: true });
  await writeFile(
    join(sourceDir, "card.json"),
    JSON.stringify(
      {
        name: "@me/mind",
        version: "1.0.0",
        persona: { include: ["voice"], visibility: "internal" },
        beliefs: { include: ["engineering"], visibility: "public" },
        memory: { l6: { include: ["raw"], visibility: "private", format: "jsonl" } },
      },
      null,
      2,
    ),
  );
  if (options?.complete || options?.invalidJsonl) {
    await mkdir(join(sourceDir, "persona", "voice"), { recursive: true });
    await writeFile(join(sourceDir, "persona", "voice", "PERSONA.md"), "voice\n");
    await mkdir(join(sourceDir, "beliefs", "engineering"), { recursive: true });
    await writeFile(join(sourceDir, "beliefs", "engineering", "BELIEF.md"), "engineering\n");
    await mkdir(join(sourceDir, "memory", "l6", "raw"), { recursive: true });
    await writeFile(
      join(sourceDir, "memory", "l6", "raw", "memory.jsonl"),
      options.invalidJsonl ? "{not-json\n" : `${JSON.stringify({ event: "done" })}\n`,
    );
  }
  return { agentsDir, sourceDir };
}

test("publishCard rejects missing mind content files declared in the manifest", async () => {
  const { agentsDir } = await scaffoldSource();

  await expect(publishCard(agentsDir, "@me/mind")).rejects.toThrow("missing persona directory");
});

test("publishCard rejects invalid jsonl memory content", async () => {
  const { agentsDir } = await scaffoldSource({ invalidJsonl: true });

  await expect(publishCard(agentsDir, "@me/mind")).rejects.toThrow("invalid JSONL");
});

test("publishCard succeeds for complete mind content and integrity covers new files", async () => {
  const { agentsDir, sourceDir } = await scaffoldSource({ complete: true });

  const published = await publishCard(agentsDir, "@me/mind");
  const resolved = await resolveCard(agentsDir, "@me/mind@1.0.0");
  const before = await computeCardIntegrity(published.versionDir);
  await writeFile(join(published.versionDir, "persona", "voice", "PERSONA.md"), "modified\n");
  const after = await computeCardIntegrity(published.versionDir);

  expect(resolved.manifest.persona?.include).toEqual(["voice"]);
  expect(resolved.manifest.beliefs?.include).toEqual(["engineering"]);
  expect(resolved.manifest.memory?.l6?.format).toBe("jsonl");
  expect(after).not.toBe(before);

  await rm(join(sourceDir, "memory", "l6", "raw", "memory.jsonl"));
});
