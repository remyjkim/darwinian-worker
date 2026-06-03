// ABOUTME: Verifies card reference parsing for local store, file, and Git origins.
// ABOUTME: Protects dispatch metadata before resolver and install commands consume refs.

import { describe, expect, test } from "bun:test";
import { parseCardRef } from "../cli/core/card-store";

describe("parseCardRef", () => {
  test("parses scoped store refs with a semver range", () => {
    expect(parseCardRef("@me/backend@^1.0.0")).toEqual({
      origin: "store",
      name: "@me/backend",
      range: "^1.0.0",
      original: "@me/backend@^1.0.0",
    });
  });

  test("parses unscoped store refs without a range", () => {
    expect(parseCardRef("backend")).toEqual({
      origin: "store",
      name: "backend",
      range: "*",
      original: "backend",
    });
  });

  test("parses file refs", () => {
    expect(parseCardRef("file:../cards/backend")).toEqual({
      origin: "file",
      name: "file:../cards/backend",
      range: "*",
      filePath: "../cards/backend",
      original: "file:../cards/backend",
    });
  });

  test("parses git+ refs with explicit refs", () => {
    expect(parseCardRef("git+file:///tmp/backend.git#v1.0.0")).toEqual({
      origin: "git",
      name: "",
      range: "*",
      gitUrl: "file:///tmp/backend.git",
      gitRef: "v1.0.0",
      original: "git+file:///tmp/backend.git#v1.0.0",
    });
  });

  test("parses git+ refs with semver ranges", () => {
    expect(parseCardRef("git+file:///tmp/backend.git@^1.0.0")).toEqual({
      origin: "git",
      name: "",
      range: "^1.0.0",
      gitUrl: "file:///tmp/backend.git",
      gitRange: "^1.0.0",
      original: "git+file:///tmp/backend.git@^1.0.0",
    });
  });

  test("rewrites github shorthand refs to canonical git URLs", () => {
    expect(parseCardRef("github:team/cards#main")).toEqual({
      origin: "git",
      name: "",
      range: "*",
      gitUrl: "https://github.com/team/cards.git",
      gitRef: "main",
      original: "github:team/cards#main",
    });
    expect(parseCardRef("github:team/cards@~2.0.0").gitUrl).toBe("https://github.com/team/cards.git");
  });

  test("rewrites gitlab shorthand refs to canonical git URLs", () => {
    expect(parseCardRef("gitlab:team/cards#main")).toEqual({
      origin: "git",
      name: "",
      range: "*",
      gitUrl: "https://gitlab.com/team/cards.git",
      gitRef: "main",
      original: "gitlab:team/cards#main",
    });
    expect(parseCardRef("gitlab:team/cards@~2.0.0").gitRange).toBe("~2.0.0");
  });

  test("rejects malformed git refs", () => {
    expect(() => parseCardRef("git+#main")).toThrow("git URL");
    expect(() => parseCardRef("git+file:///tmp/backend.git")).toThrow("requires #ref or @range");
    expect(() => parseCardRef("github:team/cards")).toThrow("requires #ref or @range");
    expect(() => parseCardRef("github:#main")).toThrow("owner/repo");
  });
});
