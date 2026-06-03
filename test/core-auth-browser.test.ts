// ABOUTME: Verifies best-effort system browser opening across supported platforms.
// ABOUTME: Keeps auth and analyze browser behavior dependency-free.

import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { openBrowser } from "../cli/core/auth/browser";

const originalPlatform = process.platform;

afterEach(() => {
  Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
});

describe("openBrowser", () => {
  test("uses 'open' argv on darwin", () => {
    const spy = spyOn(Bun, "spawn").mockReturnValue({} as unknown as ReturnType<typeof Bun.spawn>);
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    openBrowser("https://x.test");
    expect(spy.mock.calls[0]?.[0]).toEqual(["open", "https://x.test"]);
    spy.mockRestore();
  });

  test("uses 'xdg-open' on linux", () => {
    const spy = spyOn(Bun, "spawn").mockReturnValue({} as unknown as ReturnType<typeof Bun.spawn>);
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    openBrowser("https://x.test");
    expect(spy.mock.calls[0]?.[0]).toEqual(["xdg-open", "https://x.test"]);
    spy.mockRestore();
  });

  test("uses cmd start on win32", () => {
    const spy = spyOn(Bun, "spawn").mockReturnValue({} as unknown as ReturnType<typeof Bun.spawn>);
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    openBrowser("https://x.test");
    expect(spy.mock.calls[0]?.[0]).toEqual(["cmd", "/c", "start", "", "https://x.test"]);
    spy.mockRestore();
  });

  test("swallows spawn errors", () => {
    const spy = spyOn(Bun, "spawn").mockImplementation(() => {
      throw new Error("boom");
    });
    expect(() => openBrowser("https://x.test")).not.toThrow();
    spy.mockRestore();
  });
});
