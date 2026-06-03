// ABOUTME: Verifies frontend URL composition for analyzer job and report links.
// ABOUTME: Keeps backend IDs and configurable web base URL handling predictable.

import { describe, expect, test } from "bun:test";
import { processingUrl, reportUrl } from "../cli/core/analyze/url";

describe("analyze urls", () => {
  test("composes processing and report URLs", () => {
    expect(processingUrl("https://app.test", "job_x")).toBe("https://app.test/processing/job_x");
    expect(processingUrl("https://app.test/", "job_x")).toBe("https://app.test/processing/job_x");
    expect(reportUrl("https://app.test/", "rep_y")).toBe("https://app.test/report/rep_y");
  });
});
