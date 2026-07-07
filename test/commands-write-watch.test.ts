// ABOUTME: Verifies write-watch path collection, ignore rules, and debounce semantics.
// ABOUTME: Guards linked-root normalization and single-flight write serialization.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  collectWriteWatchPaths,
  createRecursiveWatcher,
  linkedRootOverlapsProject,
  normalizeWatchPath,
  shouldIgnoreWatchEvent,
  startWriteWatch,
} from "../cli/core/write-watch";
import { cleanupTempRoots, createTempRoot } from "./helpers";

const tempRoots: string[] = [];
afterEach(async () => cleanupTempRoots(tempRoots));

async function waitForCondition(predicate: () => boolean, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await Bun.sleep(20);
  }
  return predicate();
}

async function writeUntilObserved(
  path: string,
  content: (attempt: number) => string,
  predicate: () => boolean,
  timeoutMs = 5000,
) {
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    await writeFile(path, content(attempt));
    attempt += 1;
    if (await waitForCondition(predicate, 250)) {
      return true;
    }
  }
  return predicate();
}

async function waitForStableValue<T>(read: () => T, stableMs = 150, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let previous = read();
  let stableSince = Date.now();
  while (Date.now() < deadline) {
    await Bun.sleep(20);
    const current = read();
    if (!Object.is(current, previous)) {
      previous = current;
      stableSince = Date.now();
      continue;
    }
    if (Date.now() - stableSince >= stableMs) {
      return true;
    }
  }
  return false;
}

describe("write-watch helpers", () => {
  test("normalizeWatchPath strips file: prefix", () => {
    expect(normalizeWatchPath("file:/tmp/source")).toBe("/tmp/source");
    expect(normalizeWatchPath("/tmp/source")).toBe("/tmp/source");
  });

  test("collectWriteWatchPaths includes drwn dir and existing linked roots", async () => {
    const root = await createTempRoot("write-watch-");
    tempRoots.push(root);
    const linked = join(root, "linked");
    await mkdir(join(root, ".agents", "drwn"), { recursive: true });
    await writeFile(join(root, ".agents", "drwn", "config.json"), "{}\n");
    await mkdir(linked, { recursive: true });
    const paths = collectWriteWatchPaths(root, [`file:${linked}`]);
    expect(paths).toContain(join(root, ".agents", "drwn"));
    expect(paths).toContain(linked);
    expect(paths.some((path) => path.startsWith("file:"))).toBe(false);
  });

  test("shouldIgnoreWatchEvent ignores generated output under overlapping linked root", async () => {
    const root = await createTempRoot("write-watch-ignore-");
    tempRoots.push(root);
    const linked = join(root, "linked");
    const generated = join(root, ".agents", "drwn", "generated", "workers", "x");
    expect(linkedRootOverlapsProject(root, [linked])).toBe(true);
    expect(shouldIgnoreWatchEvent(root, generated, [linked])).toBe(true);
    expect(shouldIgnoreWatchEvent(root, join(linked, "skills", "a", "SKILL.md"), [linked])).toBe(false);
  });
});

describe("startWriteWatch", () => {
  test("rejects --watch with --json at command layer", async () => {
    const { runAgentsCli, scaffoldCliFixture } = await import("./helpers");
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const projectDir = join(fixture.root, "project");
    await mkdir(join(projectDir, ".agents", "drwn"), { recursive: true });
    await writeFile(join(projectDir, ".agents", "drwn", "config.json"), "{}\n");
    const result = await runAgentsCli(["write", "--watch", "--json"], {
      AGENTS_REPO_ROOT: fixture.repoRoot,
      AGENTS_HOME_DIR: fixture.homeDir,
      AGENTS_DIR: fixture.agentsDir,
    }, projectDir, { skipWriteScopeAuto: true });
    expect(result.exitCode).not.toBe(0);
    expect(`${result.stderr}${result.stdout}`).toMatch(/--watch is incompatible/i);
  });

  test("debounces rapid triggers into one follow-up run", async () => {
    const root = await createTempRoot("write-watch-debounce-");
    tempRoots.push(root);
    await mkdir(join(root, ".agents", "drwn"), { recursive: true });
    await writeFile(join(root, ".agents", "drwn", "config.json"), "{}\n");
    let runs = 0;
    const stop = startWriteWatch({
      projectRoot: root,
      debounceMs: 50,
      onTrigger: async () => {
        runs += 1;
      },
    });
    const configPath = join(root, ".agents", "drwn", "config.json");
    expect(
      await writeUntilObserved(configPath, (attempt) => `{"ready":${attempt}}\n`, () => runs > 0),
    ).toBe(true);
    expect(await waitForStableValue(() => runs)).toBe(true);
    runs = 0;
    await writeFile(configPath, '{"version":2}\n');
    await writeFile(configPath, '{"version":3}\n');
    await Bun.sleep(120);
    stop();
    expect(runs).toBe(1);
  });

  test("single-flight queues one follow-up during in-progress write", async () => {
    const root = await createTempRoot("write-watch-flight-");
    tempRoots.push(root);
    await mkdir(join(root, ".agents", "drwn"), { recursive: true });
    await writeFile(join(root, ".agents", "drwn", "config.json"), "{}\n");
    let runs = 0;
    let release: (() => void) | undefined;
    let exerciseSingleFlight = false;
    const stop = startWriteWatch({
      projectRoot: root,
      debounceMs: 10,
      onTrigger: async () => {
        runs += 1;
        if (exerciseSingleFlight && runs === 1) {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
      },
    });
    const configPath = join(root, ".agents", "drwn", "config.json");
    expect(
      await writeUntilObserved(configPath, (attempt) => `{"ready":${attempt}}\n`, () => runs > 0),
    ).toBe(true);
    expect(await waitForStableValue(() => runs)).toBe(true);
    runs = 0;
    exerciseSingleFlight = true;
    await writeFile(configPath, '{"version":2}\n');
    await Bun.sleep(30);
    await writeFile(configPath, '{"version":3}\n');
    await Bun.sleep(30);
    release?.();
    await Bun.sleep(150);
    stop();
    expect(runs).toBeGreaterThanOrEqual(1);
    expect(runs).toBeLessThanOrEqual(2);
  });

  test("creates config.local.json after watch starts and triggers write", async () => {
    const root = await createTempRoot("write-watch-overlay-");
    tempRoots.push(root);
    await mkdir(join(root, ".agents", "drwn"), { recursive: true });
    await writeFile(join(root, ".agents", "drwn", "config.json"), "{}\n");
    let runs = 0;
    const stop = startWriteWatch({
      projectRoot: root,
      debounceMs: 50,
      onTrigger: async () => {
        runs += 1;
      },
    });
    try {
      const configPath = join(root, ".agents", "drwn", "config.json");
      expect(
        await writeUntilObserved(configPath, (attempt) => `{"version":${attempt + 2}}\n`, () => runs > 0),
      ).toBe(true);
      expect(await waitForStableValue(() => runs)).toBe(true);
      runs = 0;
      await writeFile(join(root, ".agents", "drwn", "config.local.json"), '{"overrides":{}}\n');
      expect(await waitForCondition(() => runs > 0)).toBe(true);
    } finally {
      stop();
    }
  });

  test("picks up linked-root override changes after startup", async () => {
    const root = await createTempRoot("write-watch-linked-swap-");
    tempRoots.push(root);
    const firstLinked = join(root, "linked-a");
    const secondLinked = join(root, "linked-b");
    await mkdir(join(root, ".agents", "drwn"), { recursive: true });
    await writeFile(join(root, ".agents", "drwn", "config.json"), "{}\n");
    await mkdir(firstLinked, { recursive: true });
    await mkdir(secondLinked, { recursive: true });
    await writeFile(join(firstLinked, "touch.txt"), "a\n");
    await writeFile(join(secondLinked, "touch.txt"), "b\n");
    const events: string[] = [];
    const stop = startWriteWatch({
      projectRoot: root,
      debounceMs: 50,
      onTrigger: async () => {
        events.push("run");
      },
    });
    try {
      const configPath = join(root, ".agents", "drwn", "config.json");
      expect(
        await writeUntilObserved(configPath, (attempt) => `{"ready":${attempt}}\n`, () => events.length >= 1),
      ).toBe(true);
      expect(await waitForStableValue(() => events.length)).toBe(true);
      events.length = 0;
      await writeFile(
        join(root, ".agents", "drwn", "config.local.json"),
        `${JSON.stringify({ overrides: { "@me/x": `file:${firstLinked}` } }, null, 2)}\n`,
      );
      expect(await waitForCondition(() => events.length >= 1)).toBe(true);
      await writeFile(join(firstLinked, "touch.txt"), "a2\n");
      expect(await waitForCondition(() => events.length >= 2)).toBe(true);
      await writeFile(
        join(root, ".agents", "drwn", "config.local.json"),
        `${JSON.stringify({ overrides: { "@me/x": `file:${secondLinked}` } }, null, 2)}\n`,
      );
      expect(await waitForCondition(() => events.length >= 3)).toBe(true);
      await writeFile(join(secondLinked, "touch.txt"), "b2\n");
      expect(await waitForCondition(() => events.length >= 4)).toBe(true);
    } finally {
      stop();
    }
    expect(events.length).toBeGreaterThan(1);
  });
});

describe("createRecursiveWatcher", () => {
  test("nested skill edits trigger callback", async () => {
    const root = await createTempRoot("write-watch-nested-");
    tempRoots.push(root);
    const skillDir = join(root, "skills", "nested");
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), "v1\n");
    const events: string[] = [];
    const watcher = createRecursiveWatcher(root, (eventPath) => events.push(eventPath));
    const skillPath = join(skillDir, "SKILL.md");
    expect(
      await writeUntilObserved(
        skillPath,
        (attempt) => `v${attempt + 2}\n`,
        () => events.some((event) => event.includes("SKILL.md")),
      ),
    ).toBe(true);
    watcher.close();
    expect(events.some((event) => event.includes("SKILL.md"))).toBe(true);
  });
});
