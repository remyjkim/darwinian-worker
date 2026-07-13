// ABOUTME: Verifies materialization mode precedence including explicit vendored wins.
// ABOUTME: Covers per-card CARDS_SOURCE_PATH presence and overlay override paths.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CardLockEntry } from "../cli/core/card-lock";
import { resolveCardSourcePath, resolveMode } from "../cli/core/mode-resolution";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

const baseCard: CardLockEntry = {
  name: "@me/backend",
  requested: "@me/backend@1.0.0",
  version: "1.0.0",
  path: "/store/extracted/abc",
  integrity: "sha256-abc",
  treeSha: "a".repeat(40),
  manifest: { name: "@me/backend", version: "1.0.0", skills: { include: [] } },
  skills: [],
  hooks: [],
  registry: null,
  origin: "store",
  git: { commit: "b".repeat(40) },
};

describe("resolveMode", () => {
  test("explicit vendored wins over CARDS_SOURCE_PATH", () => {
    const mode = resolveMode(baseCard, {
      projectConfig: { version: 2, materialization: "vendored" },
      cardsSourcePath: "/tmp/sources",
    });
    expect(mode.mode).toBe("vendored");
    expect(mode.vendorEligible).toBe(true);
  });

  test("overlay override from config.local", () => {
    const mode = resolveMode(baseCard, {
      configLocal: { overrides: { "@me/backend": "file:/tmp/dev" } },
    });
    expect(mode.mode).toBe("overlay");
    expect(mode.vendorEligible).toBe(false);
    expect(mode.sourcePath).toBe("/tmp/dev");
  });

  test("file-origin cards are overlay-only", () => {
    const mode = resolveMode({ ...baseCard, origin: "file", treeSha: undefined, git: undefined }, {});
    expect(mode.mode).toBe("overlay");
    expect(mode.vendorEligible).toBe(false);
  });

  test("source root present but per-card card.json absent => vendored", async () => {
    const root = await createTempRoot("mode-resolution-");
    tempRoots.push(root);
    await mkdir(join(root, "@me", "other"), { recursive: true });
    await writeFile(join(root, "@me", "other", "card.json"), "{}");

    const mode = resolveMode(baseCard, { cardsSourcePath: root });
    expect(mode.mode).toBe("vendored");
    expect(mode.vendorEligible).toBe(true);
    expect(resolveCardSourcePath(root, baseCard.name)).toBeNull();
  });

  test("per-card source present => linked", async () => {
    const root = await createTempRoot("mode-resolution-");
    tempRoots.push(root);
    await mkdir(join(root, "@me", "backend"), { recursive: true });
    await writeFile(join(root, "@me", "backend", "card.json"), "{}");

    const mode = resolveMode(baseCard, { cardsSourcePath: root });
    expect(mode.mode).toBe("linked");
    expect(mode.vendorEligible).toBe(false);
    expect(mode.sourcePath).toBe(join(root, "@me", "backend"));
  });

  test("explicit linked with absent per-card source => vendored + warning reason", async () => {
    const root = await createTempRoot("mode-resolution-");
    tempRoots.push(root);

    const mode = resolveMode(baseCard, {
      projectConfig: { version: 2, materialization: "linked" },
      cardsSourcePath: root,
    });
    expect(mode.mode).toBe("vendored");
    expect(mode.vendorEligible).toBe(true);
    expect(mode.reason).toContain("absent");
  });
});
