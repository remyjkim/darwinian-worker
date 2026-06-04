// ABOUTME: Verifies analyzer job polling HTTP client behavior.
// ABOUTME: Keeps wait-mode command logic independent from live backend availability.

import { describe, expect, test } from "bun:test";
import { createAnalyzerClient } from "../cli/core/http/analyzer-client";
import { AuthExpiredError } from "../cli/core/http/errors";

describe("analyzer-client.getJob", () => {
  test("gets and parses a job", async () => {
    let captured: { url?: string; init?: RequestInit } = {};
    const mockFetch = (async (url: string, init?: RequestInit) => {
      captured = { url, init };
      return Response.json({
        id: "job/x",
        status: "processing",
        createdAt: "2026-06-03T00:00:00Z",
        updatedAt: "2026-06-03T00:01:00Z",
        error: null,
        reportId: null,
      });
    }) as unknown as typeof fetch;

    const job = await createAnalyzerClient("https://api.test", mockFetch).getJob("job/x", "TOK");

    expect(captured.url).toBe("https://api.test/api/jobs/job%2Fx");
    expect(new Headers(captured.init?.headers).get("authorization")).toBe("Bearer TOK");
    expect(job.status).toBe("processing");
  });

  test("throws AuthExpiredError on 401", async () => {
    const mockFetch = (async () => new Response("no", { status: 401 })) as unknown as typeof fetch;
    await expect(createAnalyzerClient("https://api.test", mockFetch).getJob("job", "T"))
      .rejects.toBeInstanceOf(AuthExpiredError);
  });

  test("throws ServerError on 404", async () => {
    const mockFetch = (async () => new Response("Job not found", { status: 404 })) as unknown as typeof fetch;
    await expect(createAnalyzerClient("https://api.test", mockFetch).getJob("job", "T"))
      .rejects.toMatchObject({ name: "ServerError", status: 404, message: "Job not found" });
  });

  test("rejects malformed JSON", async () => {
    const mockFetch = (async () => Response.json({ nope: true })) as unknown as typeof fetch;
    await expect(createAnalyzerClient("https://api.test", mockFetch).getJob("job", "T")).rejects.toThrow();
  });
});
