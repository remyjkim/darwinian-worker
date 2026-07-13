// ABOUTME: Verifies the mind-store BeginningDB client adapter against the fake server.
// ABOUTME: Protects CAS error mapping, append, placement operations, and config resolution from env.

import { afterEach, expect, test } from "bun:test";
import { DrwnError } from "../cli/core/errors";
import { createMindDbClient, inspectMindMemoryHealth } from "../cli/core/mind-store/client";
import { resolveBgdbConfig } from "../cli/core/mind-store/config";
import { startFakeBgdb, type FakeBgdb } from "./fixtures/fake-bgdb";

let servers: FakeBgdb[] = [];

afterEach(() => {
  for (const server of servers.splice(0)) {
    server.stop();
  }
});

function startClient() {
  const server = startFakeBgdb();
  servers.push(server);
  const client = createMindDbClient({ baseUrl: server.baseUrl, token: server.token });
  return { server, client };
}

test("resolveBgdbConfig reads BGDB_* env and fails with a typed error when absent", () => {
  const config = resolveBgdbConfig({
    BGDB_BASE_URL: "http://db.test",
    BGDB_TENANT_ID: "42",
    BGDB_TOKEN: "tok",
    BGDB_PATH_PREFIX: "minds/mind_1",
  } as NodeJS.ProcessEnv);

  expect(config).toEqual({ baseUrl: "http://db.test", tenantId: 42, token: "tok", pathPrefix: "minds/mind_1" });

  expect(() => resolveBgdbConfig({} as NodeJS.ProcessEnv)).toThrow(DrwnError);
  try {
    resolveBgdbConfig({} as NodeJS.ProcessEnv);
  } catch (error) {
    expect((error as DrwnError).code).toBe("MIND_BINDING_NOT_FOUND");
  }
});

test("put creates and updates with CAS; conflicts surface as MIND_DB_CONFLICT", async () => {
  const { server, client } = startClient();

  const created = await client.put("/minds/m1/persona.md", "v1", { ifNoneMatch: "*" });
  expect(created.etag).toMatch(/^W\//);

  await expect(client.put("/minds/m1/persona.md", "v2", { ifNoneMatch: "*" })).rejects.toThrow(DrwnError);
  await client.put("/minds/m1/persona.md", "v2", { ifMatch: created.etag });
  expect(server.readFile("/minds/m1/persona.md")).toBe("v2");

  try {
    await client.put("/minds/m1/persona.md", "v3", { ifMatch: created.etag });
    throw new Error("expected conflict");
  } catch (error) {
    expect((error as DrwnError).code).toBe("MIND_DB_CONFLICT");
  }
});

test("get and stat return null for missing paths and etags for present ones", async () => {
  const { client } = startClient();

  expect(await client.get("/minds/m1/persona.md")).toBeNull();
  expect(await client.stat("/minds/m1/persona.md")).toBeNull();

  await client.put("/minds/m1/persona.md", "hello");
  const got = await client.get("/minds/m1/persona.md");
  expect(got?.content).toBe("hello");
  expect((await client.stat("/minds/m1/persona.md"))?.etag).toBe(got?.etag);
});

test("append, place, placements, unplace, and delete-everywhere round-trip", async () => {
  const { server, client } = startClient();

  await client.put("/pool/observations/2026-07-07/1403-01ARZ3NDEKTSV4RRFFQ69G5FAV.jsonl", "one\n");
  await client.append("/pool/observations/2026-07-07/1403-01ARZ3NDEKTSV4RRFFQ69G5FAV.jsonl", "two\n");
  await client.place(
    "/pool/observations/2026-07-07/1403-01ARZ3NDEKTSV4RRFFQ69G5FAV.jsonl",
    "/minds/m1/memory/observations/by-date/2026-07-07/1403-01ARZ3NDEKTSV4RRFFQ69G5FAV.jsonl",
  );

  const stat = await client.stat("/pool/observations/2026-07-07/1403-01ARZ3NDEKTSV4RRFFQ69G5FAV.jsonl");
  expect(await client.placements(stat!.inodeId)).toHaveLength(2);

  await client.unplace("/minds/m1/memory/observations/by-date/2026-07-07/1403-01ARZ3NDEKTSV4RRFFQ69G5FAV.jsonl");
  expect(server.state.requests).toContain(
    "DELETE /v1/fs/minds/m1/memory/observations/by-date/2026-07-07/1403-01ARZ3NDEKTSV4RRFFQ69G5FAV.jsonl?action=unplace",
  );
  expect(server.readFile("/pool/observations/2026-07-07/1403-01ARZ3NDEKTSV4RRFFQ69G5FAV.jsonl")).toBe("one\ntwo\n");

  await client.delete("/pool/observations/2026-07-07/1403-01ARZ3NDEKTSV4RRFFQ69G5FAV.jsonl", { everywhere: true });
  expect(server.readFile("/pool/observations/2026-07-07/1403-01ARZ3NDEKTSV4RRFFQ69G5FAV.jsonl")).toBeNull();
});

test("explicit unplace is idempotent and cannot destroy the final placement", async () => {
  const { server, client } = startClient();
  const path = "/pool/insights/2026-07-07/1403-01ARZ3NDEKTSV4RRFFQ69G5FAV.md";
  await client.put(path, "insight\n");

  await expect(client.unplace(path)).rejects.toThrow(DrwnError);
  expect(server.readFile(path)).toBe("insight\n");

  await expect(client.unplace("/pool/insights/missing.md")).resolves.toBeUndefined();
});

test("search and list are scoped and typed", async () => {
  const { client } = startClient();
  await client.put("/minds/m1/memory/insights/by-topic/i.md", "deep insight\n");
  await client.put("/minds/m2/memory/insights/by-topic/j.md", "deep other\n");

  expect(await client.search("deep", { pathPrefix: "/minds/m1" })).toEqual(["/minds/m1/memory/insights/by-topic/i.md"]);
  expect(await client.list("/minds/m1/memory/insights/by-topic")).toEqual([{ name: "i.md", kind: "file" }]);
});

test("memory health compares inode placements across pool, by-date, and by-topic views", async () => {
  const { client } = startClient();
  const pool = "/pool/insights/2026-07-07/1403-01ARZ3NDEKTSV4RRFFQ69G5FAV.md";
  const byDate = "/minds/m1/memory/insights/by-date/2026-07-07/1403-01ARZ3NDEKTSV4RRFFQ69G5FAV.md";
  const byTopic = "/minds/m1/memory/insights/by-topic/quality/current.md";
  await client.put(pool, "insight\n");
  await client.place(pool, byDate);
  await client.place(pool, byTopic);

  expect(await inspectMindMemoryHealth(client, "m1")).toEqual([]);

  await client.unplace(pool);
  const orphaned = await inspectMindMemoryHealth(client, "m1");
  expect(orphaned.filter((issue) => issue.code === "pool_placement_missing")).toHaveLength(1);
});

test("memory health reports unplaced entries and unsupported residue", async () => {
  const { client } = startClient();
  await client.put("/pool/observations/2026-07-07/1403-01ARZ3NDEKTSV4RRFFQ69G5FAV.jsonl", "{}\n");
  await client.put("/pool/l5/legacy.jsonl", "{}\n");
  await client.put("/minds/m1/memory/raw_data/file.bin", "x");

  const issues = await inspectMindMemoryHealth(client, "m1");
  expect(issues.map((issue) => issue.code)).toContain("unplaced_pool_entry");
  expect(issues.filter((issue) => issue.code === "unsupported_memory_residue")).toHaveLength(2);
});

test("unreachable server surfaces MIND_DB_UNREACHABLE", async () => {
  const client = createMindDbClient({ baseUrl: "http://127.0.0.1:1", token: "x" });

  try {
    await client.get("/minds/m1/persona.md");
    throw new Error("expected unreachable");
  } catch (error) {
    expect((error as DrwnError).code).toBe("MIND_DB_UNREACHABLE");
  }
});
