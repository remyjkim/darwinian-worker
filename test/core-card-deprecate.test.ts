// ABOUTME: Verifies card deprecation markers are written with git-config-safe keys and read back.
// ABOUTME: Guards against invalid config keys for semver versions and write-only deprecation state.

import { afterEach, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  deprecateCardVersion,
  deprecationConfigKey,
  getCardDeprecation,
  listCards,
  publishCard,
} from "../cli/core/card-store";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

async function scaffoldPublishedCard(version = "1.0.0") {
  const root = await createTempRoot("card-deprecate-");
  tempRoots.push(root);
  const agentsDir = join(root, "agents");
  const sourceDir = join(agentsDir, "drwn", "sources", "@me", "tool");
  await mkdir(sourceDir, { recursive: true });
  await writeFile(join(sourceDir, "card.json"), JSON.stringify({ name: "@me/tool", version }, null, 2));
  await publishCard(agentsDir, "@me/tool");
  return { agentsDir };
}

test("deprecationConfigKey encodes semver into a valid git config key", () => {
  expect(deprecationConfigKey("0.2.0")).toBe("drwn.deprecated.v0-2-0");
  expect(deprecationConfigKey("10.20.30")).toBe("drwn.deprecated.v10-20-30");
});

test("deprecateCardVersion succeeds for a semver version", async () => {
  const { agentsDir } = await scaffoldPublishedCard("0.2.0");

  const resolved = await deprecateCardVersion(agentsDir, "@me/tool@0.2.0", "Renamed to @me/other");

  expect(resolved.name).toBe("@me/tool");
  expect(resolved.version).toBe("0.2.0");
});

test("getCardDeprecation reads back the message and null when absent", async () => {
  const { agentsDir } = await scaffoldPublishedCard("0.2.0");

  expect(await getCardDeprecation(agentsDir, "@me/tool", "0.2.0")).toBeNull();
  await deprecateCardVersion(agentsDir, "@me/tool@0.2.0", "Renamed to @me/other");

  expect(await getCardDeprecation(agentsDir, "@me/tool", "0.2.0")).toBe("Renamed to @me/other");
  expect(await getCardDeprecation(agentsDir, "@me/tool", "9.9.9")).toBeNull();
});

test("getCardDeprecation returns null for a card with no bare repo", async () => {
  const root = await createTempRoot("card-deprecate-empty-");
  tempRoots.push(root);
  const agentsDir = join(root, "agents");

  expect(await getCardDeprecation(agentsDir, "@me/absent", "1.0.0")).toBeNull();
});

test("listCards surfaces deprecated versions with their messages", async () => {
  const { agentsDir } = await scaffoldPublishedCard("0.2.0");
  await deprecateCardVersion(agentsDir, "@me/tool@0.2.0", "Renamed to @me/other");

  const cards = await listCards(agentsDir);
  const card = cards.find((entry) => entry.name === "@me/tool");

  expect(card?.versions).toEqual(["0.2.0"]);
  expect(card?.deprecated).toEqual({ "0.2.0": "Renamed to @me/other" });
});

test("deprecateCardVersion defaults the message when omitted", async () => {
  const { agentsDir } = await scaffoldPublishedCard("1.0.0");

  await deprecateCardVersion(agentsDir, "@me/tool@1.0.0", "");

  expect(await getCardDeprecation(agentsDir, "@me/tool", "1.0.0")).toBe("deprecated");
});
