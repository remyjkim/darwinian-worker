// ABOUTME: Verifies zod schemas for analyzer auth and analysis HTTP responses.
// ABOUTME: Locks server response contracts before command layers consume them.

import { describe, expect, test } from "bun:test";
import {
  AnalyzeUploadResponseSchema,
  DeviceCodeResponseSchema,
  DeviceTokenResponseSchema,
  JobInfoSchema,
  SessionResponseSchema,
} from "../cli/core/http/schemas";

describe("DeviceCodeResponseSchema", () => {
  test("parses a valid response", () => {
    const ok = DeviceCodeResponseSchema.safeParse({
      device_code: "d",
      user_code: "ABCD",
      verification_uri_complete: "https://example.com/device?user_code=ABCD",
      expires_in: 600,
      interval: 5,
    });
    expect(ok.success).toBe(true);
  });

  test("defaults interval to 5 when missing", () => {
    const r = DeviceCodeResponseSchema.parse({
      device_code: "d",
      user_code: "X",
      verification_uri_complete: "https://example.com/device",
      expires_in: 600,
    });
    expect(r.interval).toBe(5);
  });
});

describe("DeviceTokenResponseSchema", () => {
  test("parses a Bearer success response", () => {
    const ok = DeviceTokenResponseSchema.safeParse({
      access_token: "t",
      token_type: "Bearer",
      expires_in: 604800,
    });
    expect(ok.success).toBe(true);
  });

  test("rejects non-Bearer token_type", () => {
    const r = DeviceTokenResponseSchema.safeParse({
      access_token: "t",
      token_type: "Mac",
      expires_in: 1,
    });
    expect(r.success).toBe(false);
  });
});

describe("SessionResponseSchema", () => {
  test("accepts null", () => {
    expect(SessionResponseSchema.safeParse(null).success).toBe(true);
  });

  test("accepts {user, session}", () => {
    const ok = SessionResponseSchema.safeParse({
      user: { id: "u", email: "x@y.z" },
      session: { id: "s", expiresAt: "2026-06-10T00:00:00Z" },
    });
    expect(ok.success).toBe(true);
  });
});

describe("AnalyzeUploadResponseSchema", () => {
  test("accepts a queued upload response", () => {
    expect(AnalyzeUploadResponseSchema.parse({ jobId: "job_x", status: "queued" })).toEqual({
      jobId: "job_x",
      status: "queued",
    });
  });

  test("rejects non-queued upload status", () => {
    expect(AnalyzeUploadResponseSchema.safeParse({ jobId: "job_x", status: "processing" }).success).toBe(false);
  });
});

describe("JobInfoSchema", () => {
  test("accepts job info", () => {
    expect(
      JobInfoSchema.safeParse({
        id: "job_x",
        status: "completed",
        createdAt: "2026-06-03T00:00:00Z",
        updatedAt: "2026-06-03T00:01:00Z",
        error: null,
        reportId: "rep_x",
      }).success,
    ).toBe(true);
  });

  test("rejects unknown job status", () => {
    expect(
      JobInfoSchema.safeParse({
        id: "job_x",
        status: "done",
        createdAt: "2026-06-03T00:00:00Z",
        updatedAt: "2026-06-03T00:01:00Z",
        error: null,
        reportId: null,
      }).success,
    ).toBe(false);
  });
});
