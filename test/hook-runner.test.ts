// ABOUTME: Tests the session-signal hook orchestration (sink append + card-usage write-on-change).
// ABOUTME: Uses a real temp dir for the sink; injects card resolution and the clock.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeCardLock, type CardLockEntry, type ProjectLockGraph } from "../cli/core/card-lock";
import { minimumDrwnVersionForManifests } from "../cli/core/mind-capability";
import { emitCardUsage, emitSkillMarker, resolveActiveGraphFromLock } from "../cli/core/hook-runner";
import type { ActiveWorkerGraph, CardRef } from "../cli/core/hook-signals";

const dirs: string[] = [];

const card = (name: string, version: string, integrity: string): CardRef => ({ name, version, integrity });

/** The common shape: every Card is its own plain root. */
function activeGraph(...cards: CardRef[]): ActiveWorkerGraph {
  return {
    cards,
    workerRoots: cards.map((entry) => ({
      name: entry.name,
      version: entry.version,
      kind: "card" as const,
      integrity: entry.integrity ?? "",
    })),
  };
}

/** A minimal but genuinely valid lock entry — `file` origin needs no treeSha or git metadata. */
function lockEntry(name: string, version: string, integrity: string, manifest: Record<string, unknown> = {}): CardLockEntry {
  return {
    name,
    requested: `file:../${name.split("/").pop()}`,
    version,
    path: `/cards/${name}`,
    integrity,
    manifest: { name, version, ...manifest } as CardLockEntry["manifest"],
    skills: [],
    hooks: [],
    registry: null,
    origin: "file",
  };
}

/** Writes a real `.agents/drwn/card.lock` through the writer, so fixtures pass the validator. */
async function writeLock(graph: ProjectLockGraph): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), "drwn-hook-lock-"));
  dirs.push(root);
  await writeCardLock(root, graph);
  return root;
}
function tempTranscript(): { transcriptPath: string; sinkPath: string; sessionId: string } {
  const dir = mkdtempSync(join(tmpdir(), "drwn-hook-"));
  dirs.push(dir);
  const sessionId = "sess1";
  return {
    transcriptPath: join(dir, `${sessionId}.jsonl`),
    sinkPath: join(dir, `${sessionId}.drwn-signals.jsonl`),
    sessionId,
  };
}
function readLines(path: string) {
  return readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("emitSkillMarker", () => {
  test("appends a skill_invocation line to the co-located sink", async () => {
    const t = tempTranscript();
    await emitSkillMarker(
      { session_id: t.sessionId, transcript_path: t.transcriptPath, hook_event_name: "PreToolUse", tool_name: "Skill", tool_use_id: "toolu_1", tool_input: { skill: "x" } },
      "pre",
      { now: () => "2026-06-23T00:00:00.000Z" },
    );
    const lines = readLines(t.sinkPath);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ type: "skill_invocation", tool_use_id: "toolu_1", skill: "x" });
  });

  test("does nothing when transcript_path is absent", async () => {
    await emitSkillMarker({ session_id: "s" }, "post", { now: () => "t" });
    // no throw, nothing to assert beyond not crashing
    expect(true).toBe(true);
  });

  test("no-ops on a partial payload (post without tool_use_id)", async () => {
    const t = tempTranscript();
    await emitSkillMarker({ session_id: t.sessionId, transcript_path: t.transcriptPath, hook_event_name: "PostToolUse", tool_name: "Skill" }, "post", { now: () => "t" });
    expect(existsSync(t.sinkPath)).toBe(false);
  });

  test("concurrent appends all land (append-mode safe)", async () => {
    const t = tempTranscript();
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        emitSkillMarker(
          { session_id: t.sessionId, transcript_path: t.transcriptPath, hook_event_name: "PreToolUse", tool_name: "Skill", tool_use_id: `t${i}` },
          "pre",
          { now: () => "t" },
        ),
      ),
    );
    expect(readLines(t.sinkPath)).toHaveLength(20);
  });

  test("adds active cards to slash expansions when a card lock is available", async () => {
    const t = tempTranscript();
    await emitSkillMarker(
      {
        session_id: t.sessionId,
        transcript_path: t.transcriptPath,
        cwd: "/p",
        hook_event_name: "UserPromptExpansion",
        command_name: "superpowers:verification-before-completion",
        command_source: "plugin",
        command_args: "smoke",
      },
      "expansion",
      {
        now: () => "2026-06-23T00:00:00.000Z",
        resolveActiveGraph: async () => activeGraph(card("@scope/card-beta", "2.0.0", "sha256-beta")),
      },
    );
    expect(readLines(t.sinkPath)[0]).toMatchObject({
      type: "slash_expansion",
      command_name: "superpowers:verification-before-completion",
      cards: [{ name: "@scope/card-beta", version: "2.0.0", integrity: "sha256-beta" }],
    });
  });

  test("omits cards from slash expansions when no card lock is available", async () => {
    const t = tempTranscript();
    await emitSkillMarker(
      {
        session_id: t.sessionId,
        transcript_path: t.transcriptPath,
        cwd: "/p",
        hook_event_name: "UserPromptExpansion",
        command_name: "superpowers:verification-before-completion",
        command_source: "plugin",
      },
      "expansion",
      {
        now: () => "2026-06-23T00:00:00.000Z",
        resolveActiveGraph: async () => null,
      },
    );
    expect(readLines(t.sinkPath)[0]).not.toHaveProperty("cards");
  });
});

describe("emitCardUsage", () => {
  const deps = (graph: ActiveWorkerGraph | null) => ({
    now: () => "2026-06-23T00:00:00.000Z",
    resolveActiveGraph: async () => graph,
  });

  test("writes a card_usage line on first prompt", async () => {
    const t = tempTranscript();
    await emitCardUsage({ session_id: t.sessionId, transcript_path: t.transcriptPath, cwd: "/p" }, deps(activeGraph(card("a", "1.0.0", "sha256-a"))));
    const lines = readLines(t.sinkPath);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ type: "card_usage", cards: [{ name: "a", version: "1.0.0", integrity: "sha256-a" }] });
  });

  test("stamps the Worker roots that produced the session", async () => {
    const t = tempTranscript();
    await emitCardUsage(
      { session_id: t.sessionId, transcript_path: t.transcriptPath, cwd: "/p" },
      deps({
        cards: [card("@scope/team", "1.0.0", "sha256-team"), card("@scope/member", "3.1.0", "sha256-member")],
        workerRoots: [{ name: "@scope/team", version: "1.0.0", kind: "blueprint", integrity: "sha256-team" }],
      }),
    );
    expect(readLines(t.sinkPath)[0]).toMatchObject({
      type: "card_usage",
      schema_version: 2,
      worker_roots: [{ name: "@scope/team", version: "1.0.0", kind: "blueprint", integrity: "sha256-team" }],
    });
  });

  test("does not append again when the card set is unchanged (write-on-change)", async () => {
    const t = tempTranscript();
    const payload = { session_id: t.sessionId, transcript_path: t.transcriptPath, cwd: "/p" };
    await emitCardUsage(payload, deps(activeGraph(card("a", "1.0.0", "sha256-a"))));
    await emitCardUsage(payload, deps(activeGraph(card("a", "1.0.0", "sha256-a"))));
    expect(readLines(t.sinkPath)).toHaveLength(1);
  });

  test("appends a new line when the card set changes", async () => {
    const t = tempTranscript();
    const payload = { session_id: t.sessionId, transcript_path: t.transcriptPath, cwd: "/p" };
    await emitCardUsage(payload, deps(activeGraph(card("a", "1.0.0", "sha256-a"))));
    await emitCardUsage(payload, deps(activeGraph(card("a", "1.0.0", "sha256-a"), card("b", "2.0.0", "sha256-b"))));
    expect(readLines(t.sinkPath)).toHaveLength(2);
  });

  test("re-stamps when a local card is edited but its version stays put", async () => {
    const t = tempTranscript();
    const payload = { session_id: t.sessionId, transcript_path: t.transcriptPath, cwd: "/p" };
    await emitCardUsage(payload, deps(activeGraph(card("a", "1.0.0", "sha256-before"))));
    await emitCardUsage(payload, deps(activeGraph(card("a", "1.0.0", "sha256-after"))));
    const stamps = readLines(t.sinkPath);
    expect(stamps).toHaveLength(2);
    expect(stamps.map((line) => line.cards[0].integrity)).toEqual(["sha256-before", "sha256-after"]);
  });

  // The two below pin write-on-change to the whole Card closure rather than to the
  // roots: a Blueprint root is a stable name over members that move underneath it.
  const blueprintGraph = (memberIntegrity: string): ActiveWorkerGraph => ({
    cards: [card("@scope/team", "1.0.0", "sha256-team"), card("@scope/member", "3.1.0", memberIntegrity)],
    workerRoots: [{ name: "@scope/team", version: "1.0.0", kind: "blueprint", integrity: "sha256-team" }],
  });

  test("stays quiet when a blueprint's members are unchanged", async () => {
    const t = tempTranscript();
    const payload = { session_id: t.sessionId, transcript_path: t.transcriptPath, cwd: "/p" };
    await emitCardUsage(payload, deps(blueprintGraph("sha256-member")));
    await emitCardUsage(payload, deps(blueprintGraph("sha256-member")));
    expect(readLines(t.sinkPath)).toHaveLength(1);
  });

  test("re-stamps when a blueprint's member is edited even though the root is untouched", async () => {
    const t = tempTranscript();
    const payload = { session_id: t.sessionId, transcript_path: t.transcriptPath, cwd: "/p" };
    await emitCardUsage(payload, deps(blueprintGraph("sha256-member-before")));
    await emitCardUsage(payload, deps(blueprintGraph("sha256-member-after")));
    const stamps = readLines(t.sinkPath);
    expect(stamps).toHaveLength(2);
    // The root looks identical across both stamps; only the closure moved.
    expect(stamps.map((line) => line.worker_roots[0].integrity)).toEqual(["sha256-team", "sha256-team"]);
    expect(stamps.map((line) => line.cards[1].integrity)).toEqual(["sha256-member-before", "sha256-member-after"]);
  });

  test("re-stamps a v1 sidecar once integrity is available", async () => {
    const t = tempTranscript();
    const payload = { session_id: t.sessionId, transcript_path: t.transcriptPath, cwd: "/p" };
    writeFileSync(t.sinkPath, `${JSON.stringify({ schema_version: 1, type: "card_usage", cards: [{ name: "a", version: "1.0.0" }] })}\n`);
    await emitCardUsage(payload, deps(activeGraph(card("a", "1.0.0", "sha256-a"))));
    expect(readLines(t.sinkPath)).toHaveLength(2);
  });

  test("write-on-change ignores interleaved skill records (finds last card_usage)", async () => {
    const t = tempTranscript();
    const payload = { session_id: t.sessionId, transcript_path: t.transcriptPath, cwd: "/p" };
    await emitCardUsage(payload, deps(activeGraph(card("a", "1.0.0", "sha256-a"))));
    await emitSkillMarker({ ...payload, hook_event_name: "PreToolUse", tool_name: "Skill", tool_use_id: "t" }, "pre", { now: () => "t" });
    await emitCardUsage(payload, deps(activeGraph(card("a", "1.0.0", "sha256-a"))));
    const cardUsage = readLines(t.sinkPath).filter((l) => l.type === "card_usage");
    expect(cardUsage).toHaveLength(1);
  });

  test("skips silently when there is no card.lock (resolveActiveGraph → null)", async () => {
    const t = tempTranscript();
    await emitCardUsage({ session_id: t.sessionId, transcript_path: t.transcriptPath, cwd: "/p" }, deps(null));
    expect(existsSync(t.sinkPath)).toBe(false);
  });

  test("skips a prototype card.lock instead of reading it", async () => {
    const root = mkdtempSync(join(tmpdir(), "drwn-hook-prototype-lock-"));
    dirs.push(root);
    const stateDir = join(root, ".agents", "drwn");
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(
      join(stateDir, "card.lock"),
      JSON.stringify({ lockfileVersion: 2, cards: [{ name: "@scope/improve", version: "1.2.3" }] }),
    );

    expect(await resolveActiveGraphFromLock(root)).toBeNull();
  });
});

// dw#52 follow-up (Remy's review): write-on-change must key on the whole ROOT GRAPH
// (cards + worker_roots membership), not the flattened card list alone. `validateCardLockfile`
// checks a blueprint's member COUNT but never member identity (card-lock.ts:225), so a
// count-preserving member swap keeps every card's integrity — hence the flat closure — identical
// while the root membership moves. The cards-only key was blind to that; these pin the fix.
describe("emitCardUsage — write-on-change keys on the root graph", () => {
  const bp = (composedFrom: string[]) => lockEntry("b", "1.0.0", "sha256-b", { kind: "blueprint", composedFrom });
  // Four cards; NONE of these entries differ between the two graphs. Only the root membership does.
  const swapCards = () => [bp(["x", "y"]), lockEntry("x", "1.0.0", "sha256-x"), lockEntry("y", "1.0.0", "sha256-y"), lockEntry("z", "1.0.0", "sha256-z")];
  // roots {b, z}: b composes its real members [x, y]; z is a standalone root.
  const graphBefore: ProjectLockGraph = {
    workerRoots: [
      { name: "b", requested: "file:../b", kind: "blueprint", members: ["x", "y"] },
      { name: "z", requested: "file:../z", kind: "card", members: [] },
    ],
    cards: swapCards(),
  };
  // roots {b, y}: b.members SWAPPED to [x, z] (still length 2 -> count check passes), y promoted
  // to a standalone root, z demoted into b's membership. b's manifest — hence integrity — untouched.
  const graphAfter: ProjectLockGraph = {
    workerRoots: [
      { name: "b", requested: "file:../b", kind: "blueprint", members: ["x", "z"] },
      { name: "y", requested: "file:../y", kind: "card", members: [] },
    ],
    cards: swapCards(),
  };

  /** A project dir whose `.agents/drwn/card.lock` the hot path (resolveActiveGraphFromLock) reads. */
  function tempProject() {
    const proj = mkdtempSync(join(tmpdir(), "drwn-hook-graphkey-"));
    dirs.push(proj);
    const transcriptPath = join(proj, "sess.jsonl");
    return { proj, payload: { session_id: "sess", transcript_path: transcriptPath, cwd: proj }, sinkPath: join(proj, "sess.drwn-signals.jsonl") };
  }

  test("re-stamps when a root is demoted via a count-preserving member swap (same card closure)", async () => {
    const { proj, payload, sinkPath } = tempProject();
    const clock = (t: string) => ({ now: () => t });

    await writeCardLock(proj, graphBefore);
    await emitCardUsage(payload, clock("2026-07-19T00:00:00.000Z"));
    await writeCardLock(proj, graphAfter); // worker_roots {b,z} -> {b,y}; cards byte-identical
    await emitCardUsage(payload, clock("2026-07-19T00:00:01.000Z"));

    const stamps = readLines(sinkPath).filter((l) => l.type === "card_usage");
    expect(stamps).toHaveLength(2);
    expect(stamps.map((s) => s.worker_roots.map((r: { name: string }) => r.name).sort().join(","))).toEqual(["b,z", "b,y"]);
    // The flattened closure is the same across both stamps — proof the roots, not the cards, drove the re-stamp.
    expect(stamps[0].cards).toEqual(stamps[1].cards);
  });

  test("stays quiet when only the root ORDER changes (reordering is cosmetic)", async () => {
    const { proj, payload, sinkPath } = tempProject();
    const reordered = (order: Array<"a" | "b">): ProjectLockGraph => ({
      workerRoots: order.map((name) => ({ name, requested: `file:../${name}`, kind: "card" as const, members: [] })),
      cards: order.map((name) => lockEntry(name, "1.0.0", `sha256-${name}`)),
    });

    await writeCardLock(proj, reordered(["a", "b"]));
    await emitCardUsage(payload, { now: () => "2026-07-19T00:00:00.000Z" });
    await writeCardLock(proj, reordered(["b", "a"])); // same membership {a,b}, order flipped
    await emitCardUsage(payload, { now: () => "2026-07-19T00:00:01.000Z" });

    expect(readLines(sinkPath).filter((l) => l.type === "card_usage")).toHaveLength(1);
  });

  test("does not churn on an unchanged root graph (idempotent across runs)", async () => {
    const { proj, payload, sinkPath } = tempProject();
    await writeCardLock(proj, graphAfter);
    await emitCardUsage(payload, { now: () => "2026-07-19T00:00:00.000Z" });
    await emitCardUsage(payload, { now: () => "2026-07-19T00:00:01.000Z" });
    expect(readLines(sinkPath).filter((l) => l.type === "card_usage")).toHaveLength(1);
  });

  test("re-stamps a v1 sidecar (no worker_roots) exactly once, then stays quiet", async () => {
    const { proj, payload, sinkPath } = tempProject();
    // A stamp written under the old cards-only key: no worker_roots field at all.
    writeFileSync(sinkPath, `${JSON.stringify({ schema_version: 1, type: "card_usage", cards: [{ name: "z", version: "1.0.0" }] })}\n`);
    await writeCardLock(proj, graphAfter);
    await emitCardUsage(payload, { now: () => "2026-07-19T00:00:00.000Z" }); // graphs differ → one re-stamp
    await emitCardUsage(payload, { now: () => "2026-07-19T00:00:01.000Z" }); // now unchanged → no loop
    expect(readLines(sinkPath).filter((l) => l.type === "card_usage")).toHaveLength(2);
  });

  test("re-stamps once when the prior stamp's closure MATCHES but it carries no worker_roots (root key isolated)", async () => {
    const { proj, payload, sinkPath } = tempProject();
    const graph: ProjectLockGraph = {
      workerRoots: [{ name: "a", requested: "file:../a", kind: "card", members: [] }],
      cards: [lockEntry("a", "1.0.0", "sha256-a")],
    };
    // Prior stamp: cards byte-identical to what this graph resolves to, but the worker_roots field
    // is absent — so ONLY the root key (empty set vs {a}) can drive the re-stamp, not the closure.
    writeFileSync(sinkPath, `${JSON.stringify({ schema_version: 1, type: "card_usage", cards: [{ name: "a", version: "1.0.0", integrity: "sha256-a" }] })}\n`);
    await writeCardLock(proj, graph);
    await emitCardUsage(payload, { now: () => "2026-07-19T00:00:00.000Z" }); // cards equal, roots [] vs {a} → one re-stamp
    await emitCardUsage(payload, { now: () => "2026-07-19T00:00:01.000Z" }); // now equal → quiet
    const stamps = readLines(sinkPath).filter((l) => l.type === "card_usage");
    expect(stamps).toHaveLength(2);
    // The closure never moved — the root key alone carried the change.
    expect(stamps[0].cards).toEqual([{ name: "a", version: "1.0.0", integrity: "sha256-a" }]);
    expect(stamps[1].cards).toEqual([{ name: "a", version: "1.0.0", integrity: "sha256-a" }]);
  });
});

describe("resolveActiveGraphFromLock", () => {
  test("joins each Worker root to the version and integrity of its Card", async () => {
    const root = await writeLock({
      workerRoots: [{ name: "@scope/alpha", requested: "file:../alpha", kind: "card", members: [] }],
      cards: [lockEntry("@scope/alpha", "1.0.0", "sha256-alpha")],
    });

    expect(await resolveActiveGraphFromLock(root)).toEqual({
      cards: [{ name: "@scope/alpha", version: "1.0.0", integrity: "sha256-alpha" }],
      workerRoots: [{ name: "@scope/alpha", version: "1.0.0", kind: "card", integrity: "sha256-alpha" }],
    });
  });

  test("marks a blueprint root and keeps its members out of the roots", async () => {
    const root = await writeLock({
      workerRoots: [{ name: "@scope/team", requested: "file:../team", kind: "blueprint", members: ["@scope/member"] }],
      cards: [
        lockEntry("@scope/team", "1.0.0", "sha256-team", { kind: "blueprint", composedFrom: ["@scope/member"] }),
        lockEntry("@scope/member", "3.1.0", "sha256-member"),
      ],
    });

    const graph = await resolveActiveGraphFromLock(root);
    expect(graph?.workerRoots).toEqual([
      { name: "@scope/team", version: "1.0.0", kind: "blueprint", integrity: "sha256-team" },
    ]);
    expect(graph?.cards).toHaveLength(2);
  });

  test("carries every root when a project has several", async () => {
    const root = await writeLock({
      workerRoots: [
        { name: "@scope/alpha", requested: "file:../alpha", kind: "card", members: [] },
        { name: "@scope/beta", requested: "file:../beta", kind: "card", members: [] },
      ],
      cards: [lockEntry("@scope/alpha", "1.0.0", "sha256-alpha"), lockEntry("@scope/beta", "2.0.0", "sha256-beta")],
    });

    expect((await resolveActiveGraphFromLock(root))?.workerRoots).toEqual([
      { name: "@scope/alpha", version: "1.0.0", kind: "card", integrity: "sha256-alpha" },
      { name: "@scope/beta", version: "2.0.0", kind: "card", integrity: "sha256-beta" },
    ]);
  });

  test("stays silent on an invalid lock rather than disrupting the host", async () => {
    const root = mkdtempSync(join(tmpdir(), "drwn-hook-invalid-lock-"));
    dirs.push(root);
    mkdirSync(join(root, ".agents", "drwn"), { recursive: true });
    writeFileSync(join(root, ".agents", "drwn", "card.lock"), "{ not json");

    expect(await resolveActiveGraphFromLock(root)).toBeNull();
  });

  test("stays silent when a root is missing from cards", async () => {
    const root = mkdtempSync(join(tmpdir(), "drwn-hook-orphan-root-"));
    dirs.push(root);
    mkdirSync(join(root, ".agents", "drwn"), { recursive: true });
    writeFileSync(
      join(root, ".agents", "drwn", "card.lock"),
      JSON.stringify({
        schema: "drwn.project-lock",
        schemaVersion: 1,
        // Must be the real floor for this graph, or the lock is rejected on that
        // instead and the missing-root path is never reached.
        store: { minDrwnVersion: minimumDrwnVersionForManifests([]) },
        workerRoots: [{ name: "@scope/ghost", requested: "file:../ghost", kind: "card", members: [] }],
        cards: [],
      }),
    );

    expect(await resolveActiveGraphFromLock(root)).toBeNull();
  });

  test("returns null when there is no lock above the cwd", async () => {
    const root = mkdtempSync(join(tmpdir(), "drwn-hook-no-lock-"));
    dirs.push(root);
    expect(await resolveActiveGraphFromLock(root)).toBeNull();
  });
});
