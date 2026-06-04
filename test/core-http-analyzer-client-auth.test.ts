// ABOUTME: Verifies auth endpoints in the shared analyzer HTTP client.
// ABOUTME: Keeps device flow and session commands independent from live backend tests.

import { describe, expect, test } from "bun:test";
import { createAnalyzerClient } from "../cli/core/http/analyzer-client";
import { AuthExpiredError, ServerError } from "../cli/core/http/errors";

describe("analyzer-client auth methods", () => {
  test("requestDeviceCode posts client_id and parses response", async () => {
    let captured: { url?: string; init?: RequestInit } = {};
    const mockFetch = (async (url: string, init?: RequestInit) => {
      captured = { url, init };
      return Response.json({
        device_code: "dev",
        user_code: "ABCD",
        verification_uri_complete: "https://app.test/device?user_code=ABCD",
        expires_in: 600,
        interval: 5,
      });
    }) as unknown as typeof fetch;

    const result = await createAnalyzerClient("https://api.test", mockFetch).requestDeviceCode("drwn-cli");

    expect(captured.url).toBe("https://api.test/api/auth/device/code");
    expect(captured.init?.method).toBe("POST");
    expect(JSON.parse(captured.init?.body as string)).toEqual({ client_id: "drwn-cli" });
    expect(result.device_code).toBe("dev");
  });

  test("pollDeviceToken returns success result on 200", async () => {
    const mockFetch = (async () => Response.json({
      access_token: "tok",
      token_type: "Bearer",
      expires_in: 604800,
    })) as unknown as typeof fetch;

    await expect(createAnalyzerClient("https://api.test", mockFetch).pollDeviceToken("dev", "drwn-cli")).resolves.toEqual({
      kind: "success",
      token: { access_token: "tok", token_type: "Bearer", expires_in: 604800 },
    });
  });

  test("pollDeviceToken returns body error on 400", async () => {
    const mockFetch = (async () => Response.json({ error: "authorization_pending" }, { status: 400 })) as unknown as typeof fetch;

    await expect(createAnalyzerClient("https://api.test", mockFetch).pollDeviceToken("dev", "drwn-cli")).resolves.toEqual({
      kind: "error",
      error: "authorization_pending",
    });
  });

  test("getSession parses null and throws AuthExpiredError on 401", async () => {
    const nullFetch = (async () => Response.json(null)) as unknown as typeof fetch;
    await expect(createAnalyzerClient("https://api.test", nullFetch).getSession("tok")).resolves.toBeNull();

    const expiredFetch = (async () => new Response("no", { status: 401 })) as unknown as typeof fetch;
    await expect(createAnalyzerClient("https://api.test", expiredFetch).getSession("tok")).rejects.toBeInstanceOf(AuthExpiredError);
  });

  test("requestDeviceCode throws ServerError for non-ok responses", async () => {
    const mockFetch = (async () => new Response("boom", { status: 502 })) as unknown as typeof fetch;
    await expect(createAnalyzerClient("https://api.test", mockFetch).requestDeviceCode("drwn-cli")).rejects.toMatchObject({
      name: "ServerError",
      status: 502,
      message: "boom",
    } satisfies Partial<ServerError>);
  });

  test("signOut is best-effort", async () => {
    const mockFetch = (async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    await expect(createAnalyzerClient("https://api.test", mockFetch).signOut("tok")).resolves.toBeUndefined();
  });
});
