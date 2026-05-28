// ABOUTME: Verifies the unified card-aware skill resolver across Layer 1 and Layer 2.
// ABOUTME: Protects the Wave 1 contract that card-bundled skills win over user-defaults.

import { afterEach, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { resolveProjectCards } from "../cli/core/card-project";
import { resolveSkillSource } from "../cli/core/card-skill-resolver";
import { cleanupTempRoots, publishCardWithSkills, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("resolveSkillSource returns Layer 1 attribution for a card-bundled skill", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const versionDir = await publishCardWithSkills(fixture, { name: "@me/backend", skills: ["polish"] });
  const lockedCards = await resolveProjectCards(fixture.agentsDir, ["@me/backend@^1.0.0"]);

  const resolved = await resolveSkillSource("polish", lockedCards, fixture.repoRoot, fixture.agentsDir);

  expect(resolved.layer).toBe("card");
  if (resolved.layer !== "card") {
    throw new Error("expected card layer");
  }
  expect(resolved.cardName).toBe("@me/backend");
  expect(resolved.cardVersion).toBe("1.0.0");
  expect(resolved.path).toBe(join(versionDir, "skills", "polish"));
});

test("resolveSkillSource returns Layer 2 attribution for a name not in any card", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  const resolved = await resolveSkillSource("alpha", [], fixture.repoRoot, fixture.agentsDir);

  expect(resolved.layer).toBe("user-default");
});

test("resolveSkillSource returns missing when neither layer provides the skill", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);

  const resolved = await resolveSkillSource("ghost", [], fixture.repoRoot, fixture.agentsDir);

  expect(resolved.layer).toBe("missing");
});

test("resolveSkillSource prefers Layer 1 even when the same name exists in Layer 2", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const versionDir = await publishCardWithSkills(fixture, { name: "@me/backend", skills: ["alpha"] });
  const lockedCards = await resolveProjectCards(fixture.agentsDir, ["@me/backend@^1.0.0"]);

  const resolved = await resolveSkillSource("alpha", lockedCards, fixture.repoRoot, fixture.agentsDir);

  expect(resolved.layer).toBe("card");
  if (resolved.layer !== "card") {
    throw new Error("expected card layer");
  }
  expect(resolved.path).toBe(join(versionDir, "skills", "alpha"));
});

test("resolveSkillSource walks cards in lockfile order on conflict (first wins)", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  const aDir = await publishCardWithSkills(fixture, { name: "@me/a", skills: ["shared"] });
  await publishCardWithSkills(fixture, { name: "@me/b", skills: ["shared"] });
  const lockedCards = await resolveProjectCards(fixture.agentsDir, ["@me/b@^1.0.0", "@me/a@^1.0.0"]);

  const resolved = await resolveSkillSource("shared", lockedCards, fixture.repoRoot, fixture.agentsDir);

  expect(resolved.layer).toBe("card");
  if (resolved.layer !== "card") {
    throw new Error("expected card layer");
  }
  expect(resolved.cardName).toBe("@me/a");
  expect(resolved.path).toBe(join(aDir, "skills", "shared"));
});

test("resolveSkillSource returns missing when card store skill dir does not exist on disk", async () => {
  const fixture = await scaffoldCliFixture();
  tempRoots.push(fixture.root);
  await publishCardWithSkills(fixture, { name: "@me/c", skills: ["polish"] });
  const lockedCards = await resolveProjectCards(fixture.agentsDir, ["@me/c@^1.0.0"]);
  await rm(join(lockedCards[0]!.path, "skills", "polish"), { recursive: true, force: true });

  const resolved = await resolveSkillSource("polish", lockedCards, fixture.repoRoot, fixture.agentsDir);

  expect(resolved.layer).toBe("missing");
  if (resolved.layer !== "missing") {
    throw new Error("expected missing layer");
  }
  expect(resolved.reason).toContain("corrupt");
});
