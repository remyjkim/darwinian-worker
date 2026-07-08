// ABOUTME: Verifies the mind-store BeginningDB client adapter against the fake server.
// ABOUTME: Protects CAS error mapping, append, placement operations, and config resolution from env.

import { afterEach, expect, test } from "bun:test";
import { DrwnError } from "../cli/core/errors";
import { createMindDbClient } from "../cli/core/mind-store/client";
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

  await client.put("/pool/l5/e.jsonl", "one\n");
  await client.append("/pool/l5/e.jsonl", "two\n");
  await client.place("/pool/l5/e.jsonl", "/minds/m1/memory/l5/e.jsonl");

  const stat = await client.stat("/pool/l5/e.jsonl");
  expect(await client.placements(stat!.inodeId)).toEqual(["/minds/m1/memory/l5/e.jsonl", "/pool/l5/e.jsonl"]);

  await client.unplace("/minds/m1/memory/l5/e.jsonl");
  expect(server.readFile("/pool/l5/e.jsonl")).toBe("one\ntwo\n");

  await client.delete("/pool/l5/e.jsonl", { everywhere: true });
  expect(server.readFile("/pool/l5/e.jsonl")).toBeNull();
});

test("search and list are scoped and typed", async () => {
  const { client } = startClient();
  await client.put("/minds/m1/memory/l4/i.md", "deep insight\n");
  await client.put("/minds/m2/memory/l4/j.md", "deep other\n");

  expect(await client.search("deep", { pathPrefix: "/minds/m1" })).toEqual(["/minds/m1/memory/l4/i.md"]);
  expect(await client.list("/minds/m1/memory/l4")).toEqual([{ name: "i.md", kind: "file" }]);
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
