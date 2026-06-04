// ABOUTME: Verifies deriveAuthoringScopeFromProbeResults and probeAuthoringScope.
// ABOUTME: Keeps scope derivation a pure function so probe runners can be injected.

import { describe, expect, test } from "bun:test";
import {
  deriveAuthoringScopeFromProbeResults,
  probeAuthoringScope,
} from "../cli/core/authoring-scope";

describe("deriveAuthoringScopeFromProbeResults", () => {
  test("uses gh api user .login when present", () => {
    expect(
      deriveAuthoringScopeFromProbeResults({ ghLogin: "junggyubae" }),
    ).toBe("@junggyubae");
  });

  test("falls back to github.user from git config when gh is null", () => {
    expect(
      deriveAuthoringScopeFromProbeResults({ ghLogin: null, githubUser: "junggyu" }),
    ).toBe("@junggyu");
  });

  test("falls back to local-part of email when handle-like", () => {
    expect(
      deriveAuthoringScopeFromProbeResults({
        ghLogin: null,
        githubUser: null,
        gitEmail: "remy@example.com",
      }),
    ).toBe("@remy");
  });

  test("returns null when nothing usable is supplied", () => {
    expect(
      deriveAuthoringScopeFromProbeResults({
        ghLogin: null,
        githubUser: null,
        gitEmail: null,
      }),
    ).toBeNull();
  });

  test("rejects email local-parts with disallowed characters (no sanitization)", () => {
    expect(
      deriveAuthoringScopeFromProbeResults({
        ghLogin: null,
        githubUser: null,
        gitEmail: "first.last+work@example.com",
      }),
    ).toBeNull();
  });

  test("normalizes to lowercase", () => {
    expect(
      deriveAuthoringScopeFromProbeResults({ ghLogin: "JunggYUBae" }),
    ).toBe("@junggyubae");
  });

  test("prefers gh over githubUser over email even when later candidates are also present", () => {
    expect(
      deriveAuthoringScopeFromProbeResults({
        ghLogin: "from-gh",
        githubUser: "from-git",
        gitEmail: "from-email@example.com",
      }),
    ).toBe("@from-gh");
  });

  test("falls through gh→githubUser→email when earlier candidates are invalid", () => {
    expect(
      deriveAuthoringScopeFromProbeResults({
        ghLogin: "bad name with spaces",
        githubUser: "good-handle",
        gitEmail: "ignored@example.com",
      }),
    ).toBe("@good-handle");
  });
});

describe("probeAuthoringScope", () => {
  test("returns gh login when gh probe succeeds", async () => {
    const result = await probeAuthoringScope({
      runGh: async () => "ghuser",
      runGit: async () => null,
    });
    expect(result).toEqual({ ghLogin: "ghuser", githubUser: null, gitEmail: null });
  });

  test("falls through to git probes when gh probe returns null", async () => {
    let callsToGit: string[][] = [];
    const result = await probeAuthoringScope({
      runGh: async () => null,
      runGit: async (args) => {
        callsToGit.push(args);
        if (args.includes("github.user")) return "gituser";
        if (args.includes("user.email")) return "ignored@example.com";
        return null;
      },
    });
    expect(result.ghLogin).toBeNull();
    expect(result.githubUser).toBe("gituser");
    expect(result.gitEmail).toBeNull();
    expect(callsToGit[0]).toEqual(["config", "--global", "github.user"]);
  });

  test("falls through to gitEmail when gh and githubUser both null", async () => {
    const result = await probeAuthoringScope({
      runGh: async () => null,
      runGit: async (args) => {
        if (args.includes("github.user")) return null;
        if (args.includes("user.email")) return "remy@example.com";
        return null;
      },
    });
    expect(result.ghLogin).toBeNull();
    expect(result.githubUser).toBeNull();
    expect(result.gitEmail).toBe("remy@example.com");
  });

  test("returns all-null when no probe succeeds", async () => {
    const result = await probeAuthoringScope({
      runGh: async () => null,
      runGit: async () => null,
    });
    expect(result).toEqual({ ghLogin: null, githubUser: null, gitEmail: null });
  });

  test("returns all-null when runners are not provided", async () => {
    const result = await probeAuthoringScope({});
    expect(result).toEqual({ ghLogin: null, githubUser: null, gitEmail: null });
  });
});
