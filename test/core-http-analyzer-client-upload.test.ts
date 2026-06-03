// ABOUTME: Verifies analyzer archive upload HTTP client behavior.
// ABOUTME: Protects multipart boundaries and clean auth/server error mapping.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAnalyzerClient } from "../cli/core/http/analyzer-client";
import { AuthExpiredError } from "../cli/core/http/errors";

let tmp: string | null = null;

afterEach(async () => {
  if (tmp) await rm(tmp, { recursive: true, force: true });
  tmp = null;
});

async function makeArchive() {
  tmp = await mkdtemp(join(tmpdir(), "drwn-up-"));
  const path = join(tmp, "x.tar.gz");
  await writeFile(path, Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0, 0, 0, 0]));
  return path;
}

describe("analyzer-client.upload", () => {
  test("posts multipart with Authorization header and returns parsed response", async () => {
    let captured: { url?: string; init?: RequestInit } = {};
    const mockFetch = (async (url: string, init?: RequestInit) => {
      captured = { url, init };
      return Response.json({ jobId: "job_x", status: "queued" }, { status: 201 });
    }) as unknown as typeof fetch;
    const archive = await makeArchive();
    const client = createAnalyzerClient("https://api.test/", mockFetch);

    const result = await client.upload(archive, "TOK");

    expect(result).toEqual({ jobId: "job_x", status: "queued" });
    expect(captured.url).toBe("https://api.test/api/analyze");
    expect(captured.init?.method).toBe("POST");
    const headers = new Headers(captured.init?.headers);
    expect(headers.get("authorization")).toBe("Bearer TOK");
    expect(headers.get("content-type")).toBeNull();
    expect(captured.init?.body).toBeInstanceOf(FormData);
  });

  test("throws AuthExpiredError on 401", async () => {
    const mockFetch = (async () => new Response("nope", { status: 401 })) as unknown as typeof fetch;
    await expect(createAnalyzerClient("https://api.test", mockFetch).upload(await makeArchive(), "T"))
      .rejects.toBeInstanceOf(AuthExpiredError);
  });

  test("throws ServerError on 413 and 5xx with status preserved", async () => {
    const tooLargeFetch = (async () => new Response("too big", { status: 413 })) as unknown as typeof fetch;
    await expect(createAnalyzerClient("https://api.test", tooLargeFetch).upload(await makeArchive(), "T"))
      .rejects.toMatchObject({ name: "ServerError", status: 413, message: "too big" });

    const serverFetch = (async () => new Response("boom", { status: 502 })) as unknown as typeof fetch;
    await expect(createAnalyzerClient("https://api.test", serverFetch).upload(await makeArchive(), "T"))
      .rejects.toMatchObject({ name: "ServerError", status: 502, message: "boom" });
  });
});
