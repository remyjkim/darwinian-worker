// ABOUTME: Verifies shell-free command string parsing into argv tokens.
// ABOUTME: Protects command metacharacters from becoming executable shell syntax.

import { describe, expect, test } from "bun:test";
import { parseCommandString, parseCommandStringOrThrow } from "../src/argv";

describe("parseCommandString", () => {
  test("splits a simple command on ASCII whitespace", () => {
    expect(parseCommandStringOrThrow("git status")).toEqual(["git", "status"]);
  });

  test("preserves double-quoted spaces", () => {
    expect(parseCommandStringOrThrow('git commit -m "hello world"')).toEqual(["git", "commit", "-m", "hello world"]);
  });

  test("preserves single-quoted spaces", () => {
    expect(parseCommandStringOrThrow("echo 'a b'")).toEqual(["echo", "a b"]);
  });

  test("keeps shell metacharacters inert as literal token text", () => {
    expect(parseCommandStringOrThrow("echo hi; rm x")).toEqual(["echo", "hi;", "rm", "x"]);
  });

  test("reports unmatched quotes", () => {
    const result = parseCommandString('echo "unterminated');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("Unmatched");
    }
  });

  test("reports dangling escapes", () => {
    const result = parseCommandString("echo trailing\\");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("Dangling");
    }
  });
});
