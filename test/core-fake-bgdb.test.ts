// ABOUTME: Semantics tests for the fake BeginningDB harness: ETag CAS, append, placements, LastPlacement fallback.
// ABOUTME: These assertions define the contract the mind-store client relies on; the real-DB contract suite mirrors them.

import { afterEach, expect, test } from "bun:test";
import { startFakeBgdb, type FakeBgdb } from "./fixtures/fake-bgdb";

let servers: FakeBgdb[] = [];

afterEach(() => {
  for (const server of servers.splice(0)) {
    server.stop();
  }
});

function start() {
  const server = startFakeBgdb();
  servers.push(server);
  return server;
}

function call(server: FakeBgdb, method: string, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${server.token}`);
  return fetch(new URL(path, server.baseUrl), { ...init, method, headers });
}

test("rejects missing or wrong bearer tokens", async () => {
  const server = start();

  const noAuth = await fetch(new URL("/v1/fs/x", server.baseUrl));
  const wrongAuth = await fetch(new URL("/v1/fs/x", server.baseUrl), { headers: { authorization: "Bearer nope" } });

  expect(noAuth.status).toBe(401);
  expect(wrongAuth.status).toBe(401);
});

test("PUT creates without an ETag header (stat carries it); If-None-Match/If-Match do CAS", async () => {
  const server = start();

  const created = await call(server, "PUT", "/v1/fs/minds/m1/persona.md", { body: "v1", headers: { "if-none-match": "*" } });
  expect(created.status).toBe(201);
  expect(created.headers.get("etag")).toBeNull();
  const firstEtag = server.etagOf("/minds/m1/persona.md")!;
  expect(firstEtag).toMatch(/^W\/"\d+:1"$/);
  const stat = await call(server, "GET", "/v1/stat/minds/m1/persona.md");
  expect(stat.headers.get("etag")).toBe(firstEtag);

  const refused = await call(server, "PUT", "/v1/fs/minds/m1/persona.md", { body: "v2", headers: { "if-none-match": "*" } });
  expect(refused.status).toBe(412);

  const stale = await call(server, "PUT", "/v1/fs/minds/m1/persona.md", { body: "v2", headers: { "if-match": 'W/"999:9"' } });
  expect(stale.status).toBe(412);

  const updated = await call(server, "PUT", "/v1/fs/minds/m1/persona.md", { body: "v2", headers: { "if-match": firstEtag } });
  expect(updated.status).toBe(204);
  expect(server.etagOf("/minds/m1/persona.md")).not.toBe(firstEtag);
  expect(server.readFile("/minds/m1/persona.md")).toBe("v2");
});

test("PATCH is an offset write requiring Content-Range; appending writes at the current size", async () => {
  const server = start();
  await call(server, "PUT", "/v1/fs/pool/l5/a.jsonl", { body: '{"n":1}\n' });

  const missingRange = await call(server, "PATCH", "/v1/fs/pool/l5/a.jsonl", { body: "x" });
  expect(missingRange.status).toBe(400);

  const appended = await call(server, "PATCH", "/v1/fs/pool/l5/a.jsonl", {
    body: '{"n":2}\n',
    headers: { "content-range": 'bytes 8-' },
  });

  expect(appended.status).toBe(204);
  expect(server.readFile("/pool/l5/a.jsonl")).toBe('{"n":1}\n{"n":2}\n');
});

test("place creates a second path to the same inode; edits are visible through both", async () => {
  const server = start();
  await call(server, "PUT", "/v1/fs/pool/l5/entry.jsonl", { body: "one\n" });

  const placed = await call(server, "POST", "/v1/fs/pool/l5/entry.jsonl?action=place&destination=/minds/m1/memory/l5/entry.jsonl");
  expect(placed.status).toBe(201);

  await call(server, "PATCH", "/v1/fs/minds/m1/memory/l5/entry.jsonl", {
    body: "two\n",
    headers: { "content-range": "bytes 4-" },
  });
  expect(server.readFile("/pool/l5/entry.jsonl")).toBe("one\ntwo\n");

  const stat = await call(server, "GET", "/v1/stat/pool/l5/entry.jsonl");
  const { inode_id } = (await stat.json()) as { inode_id: number };
  const placements = await call(server, "GET", `/v1/files/${inode_id}/placements`);
  expect(((await placements.json()) as { paths: string[] }).paths).toEqual([
    "/minds/m1/memory/l5/entry.jsonl",
    "/pool/l5/entry.jsonl",
  ]);
});

test("DELETE unplaces one path; deleting the last placement removes the inode", async () => {
  const server = start();
  await call(server, "PUT", "/v1/fs/pool/l5/entry.jsonl", { body: "x\n" });
  await call(server, "POST", "/v1/fs/pool/l5/entry.jsonl?action=place&destination=/minds/m1/memory/l5/entry.jsonl");

  expect((await call(server, "DELETE", "/v1/fs/minds/m1/memory/l5/entry.jsonl")).status).toBe(204);
  expect(server.readFile("/pool/l5/entry.jsonl")).toBe("x\n");

  expect((await call(server, "DELETE", "/v1/fs/pool/l5/entry.jsonl")).status).toBe(204);
  expect(server.readFile("/pool/l5/entry.jsonl")).toBeNull();
});

test("delete_everywhere removes all placements at once", async () => {
  const server = start();
  await call(server, "PUT", "/v1/fs/pool/l4/r.md", { body: "r\n" });
  await call(server, "POST", "/v1/fs/pool/l4/r.md?action=place&destination=/minds/m1/memory/l4/r.md");

  const removed = await call(server, "DELETE", "/v1/fs/pool/l4/r.md?action=delete_everywhere");

  expect(removed.status).toBe(204);
  expect(server.readFile("/minds/m1/memory/l4/r.md")).toBeNull();
});

test("search matches content and respects path_prefix", async () => {
  const server = start();
  await call(server, "PUT", "/v1/fs/minds/m1/memory/l4/insight.md", { body: "retro insight\n" });
  await call(server, "PUT", "/v1/fs/minds/m2/memory/l4/other.md", { body: "retro other\n" });

  const scoped = await call(server, "GET", "/v1/search?q=retro&path_prefix=/minds/m1");

  expect(((await scoped.json()) as { results: string[] }).results).toEqual(["/minds/m1/memory/l4/insight.md"]);
});

test("list returns immediate children with kinds", async () => {
  const server = start();
  await call(server, "PUT", "/v1/fs/minds/m1/persona.md", { body: "p\n" });
  await call(server, "PUT", "/v1/fs/minds/m1/beliefs/@team/card/e/BELIEF.md", { body: "b\n" });

  const listed = await call(server, "GET", "/v1/list/minds/m1");

  expect(((await listed.json()) as { entries: Array<{ name: string; kind: string }> }).entries).toEqual([
    { name: "beliefs", kind: "dir" },
    { name: "persona.md", kind: "file" },
  ]);
});
