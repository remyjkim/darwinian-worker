// ABOUTME: Tests home-directory resolution across platforms and env fallbacks.
// ABOUTME: Guards the OS-uniform resolver that never yields an empty string.

import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { resolveHomeDir } from "../cli/core/home";

describe("resolveHomeDir", () => {
  test("should return AGENTS_HOME_DIR when set even if HOME is set", () => {
    expect(resolveHomeDir({ AGENTS_HOME_DIR: "/custom/agents", HOME: "/home/u" })).toBe("/custom/agents");
  });

  test("should fall back to HOME when AGENTS_HOME_DIR is unset", () => {
    expect(resolveHomeDir({ HOME: "/home/u" })).toBe("/home/u");
  });

  test("should not let an empty AGENTS_HOME_DIR mask HOME", () => {
    expect(resolveHomeDir({ AGENTS_HOME_DIR: "", HOME: "/home/u" })).toBe("/home/u");
  });

  test("should fall back to USERPROFILE when HOME is empty", () => {
    expect(resolveHomeDir({ HOME: "", USERPROFILE: "C:\\Users\\u" })).toBe("C:\\Users\\u");
  });

  test("should fall back to os.homedir() when no env vars are set", () => {
    expect(resolveHomeDir({})).toBe(homedir());
  });

  test("should never return an empty string", () => {
    expect(resolveHomeDir({ HOME: "", USERPROFILE: "" })).toBe(homedir());
    expect(resolveHomeDir({}).length).toBeGreaterThan(0);
  });
});
