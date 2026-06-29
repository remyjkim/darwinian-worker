// ABOUTME: Tests the version-floor evaluator that compares a lock's minDrwnVersion to the running drwn.
// ABOUTME: Locks in warn/strict semantics so drwn never silently materializes a lock above its version.

import { describe, expect, test } from "bun:test";
import { evaluateVersionFloor, formatVersionFloorWarning } from "../cli/core/card-lock";

describe("evaluateVersionFloor", () => {
  test("no required floor is always satisfied", () => {
    expect(evaluateVersionFloor(undefined, "0.5.0")).toEqual({ required: null, running: "0.5.0", satisfied: true });
  });

  test("running above the floor is satisfied", () => {
    expect(evaluateVersionFloor("0.4.0", "0.5.0").satisfied).toBe(true);
  });

  test("running equal to the floor is satisfied", () => {
    expect(evaluateVersionFloor("0.4.0", "0.4.0").satisfied).toBe(true);
  });

  test("running below the floor is not satisfied", () => {
    expect(evaluateVersionFloor("0.6.0", "0.5.0")).toEqual({ required: "0.6.0", running: "0.5.0", satisfied: false });
  });

  test("the warning names both versions and the remedy", () => {
    const warning = formatVersionFloorWarning(evaluateVersionFloor("0.6.0", "0.5.0"));
    expect(warning).toContain("0.6.0");
    expect(warning).toContain("0.5.0");
    expect(warning.toLowerCase()).toContain("upgrade");
  });
});
