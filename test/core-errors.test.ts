// ABOUTME: Verifies shared typed errors used by core Git and store modules.
// ABOUTME: Keeps machine-readable error metadata stable for commands.

import { describe, expect, test } from "bun:test";
import { DrwnError } from "../cli/core/errors";

describe("DrwnError", () => {
  test("serializes code, message, hints, and error causes", () => {
    const error = new DrwnError("GIT_REF_NOT_FOUND", "ref not found", ["fetch first"], new Error("missing"));

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("DrwnError");
    expect(error.toJSON()).toEqual({
      code: "GIT_REF_NOT_FOUND",
      message: "ref not found",
      hints: ["fetch first"],
      cause: "missing",
    });
  });
});
