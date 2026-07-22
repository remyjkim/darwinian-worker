// ABOUTME: Specifies pure target-native classification for same-ID ambient MCP definitions.
// ABOUTME: Proves stable reason codes, deterministic ordering, and secret-free public results.

import { describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  classifyAmbientMcpCollision,
  classifyAmbientMcpCollisions,
  type AmbientMcpDefinition,
} from "../cli/core/ambient-policy";
import { inspectAmbientMcpDefinitions } from "../cli/core/ambient-capabilities";
import { cleanupTempRoots, createFixtureConfig, scaffoldCliFixture } from "./helpers";

function definition(
  target: "claude" | "codex" | "cursor" | "opencode",
  source: "user" | "project" | "local",
  id: string,
  value: unknown,
): AmbientMcpDefinition {
  return {
    target,
    source,
    id,
    path: source === "project" ? `/repo/${target}/project-config` : `/home/${target}/user-config`,
    value,
  };
}

function classify(
  target: "claude" | "codex" | "cursor" | "opencode",
  projectValue: unknown,
  userValue: unknown,
) {
  return classifyAmbientMcpCollision({
    declared: definition(target, "project", "notion", projectValue),
    ambient: definition(target, "user", "notion", userValue),
  });
}

describe("Claude ambient MCP policy", () => {
  test("normalizes stdio defaults and omitted empty fields before equality", () => {
    const collision = classify(
      "claude",
      { command: "npx", args: [], env: {} },
      { type: "stdio", command: "npx" },
    );

    expect(collision).toEqual(expect.objectContaining({
      disposition: "identical",
      reasonCode: "AMBIENT_IDENTICAL",
      declared: expect.objectContaining({ transport: "stdio" }),
      ambient: expect.objectContaining({ transport: "stdio" }),
      remediation: null,
    }));
  });

  test("normalizes streamable-http and http aliases before equality", () => {
    expect(classify(
      "claude",
      { type: "http", url: "https://example.test/mcp" },
      { type: "streamable-http", url: "https://example.test/mcp", headers: {} },
    )?.disposition).toBe("identical");
  });

  test("classifies same-transport whole-entry differences as scope shadowing", () => {
    expect(classify(
      "claude",
      { command: "project-command" },
      { command: "user-command" },
    )).toEqual(expect.objectContaining({
      disposition: "warning",
      reasonCode: "CLAUDE_SCOPE_SHADOW",
    }));
  });

  test("classifies cross-transport whole-entry replacement as warning-only", () => {
    expect(classify(
      "claude",
      { command: "project-command" },
      { type: "http", url: "https://example.test/mcp" },
    )).toEqual(expect.objectContaining({
      disposition: "warning",
      reasonCode: "CLAUDE_SCOPE_SHADOW",
      declared: expect.objectContaining({ transport: "stdio" }),
      ambient: expect.objectContaining({ transport: "http" }),
    }));
  });
});

describe("Codex ambient MCP policy", () => {
  test("classifies equal tables as identical regardless of key order", () => {
    expect(classify(
      "codex",
      { command: "npx", args: ["server"], startup_timeout_sec: 30 },
      { startup_timeout_sec: 30, args: ["server"], command: "npx" },
    )?.reasonCode).toBe("AMBIENT_IDENTICAL");
  });

  test("classifies same-transport field inheritance as project augmentation", () => {
    expect(classify(
      "codex",
      { command: "project-command", args: ["server"] },
      { command: "user-command", tool_timeout_sec: 60, env: { REGION: "us" } },
    )).toEqual(expect.objectContaining({
      disposition: "warning",
      reasonCode: "CODEX_PROJECT_AUGMENTS_USER",
      declared: expect.objectContaining({ transport: "stdio" }),
      ambient: expect.objectContaining({ transport: "stdio" }),
    }));
  });

  test("classifies user HTTP plus project stdio as an incompatible effective table", () => {
    expect(classify(
      "codex",
      { command: "npx" },
      { url: "https://example.test/mcp", bearer_token_env_var: "TOKEN" },
    )).toEqual(expect.objectContaining({
      disposition: "fatal",
      reasonCode: "CODEX_INCOMPATIBLE_TRANSPORTS",
    }));
  });

  test("classifies user stdio plus project HTTP as an incompatible effective table", () => {
    expect(classify(
      "codex",
      { url: "https://example.test/mcp" },
      { command: "npx", env: { TOKEN: "secret" } },
    )).toEqual(expect.objectContaining({
      disposition: "fatal",
      reasonCode: "CODEX_INCOMPATIBLE_TRANSPORTS",
    }));
  });
});

describe("Cursor ambient MCP policy", () => {
  test("classifies equal normalized entries as identical", () => {
    expect(classify(
      "cursor",
      { command: "npx", args: ["server"], env: {} },
      { type: "stdio", args: ["server"], command: "npx" },
    )?.reasonCode).toBe("AMBIENT_IDENTICAL");
  });

  test("classifies inherited same-transport fields as a warning", () => {
    expect(classify(
      "cursor",
      { command: "npx", args: ["project"] },
      { command: "npx", env: { TOKEN: "${env:TOKEN}" } },
    )).toEqual(expect.objectContaining({
      disposition: "warning",
      reasonCode: "CURSOR_PROJECT_MERGES_USER",
    }));
  });

  test("classifies a project transport selection as warning-only", () => {
    expect(classify(
      "cursor",
      { command: "npx" },
      { type: "http", url: "https://example.test/mcp" },
    )).toEqual(expect.objectContaining({
      disposition: "warning",
      reasonCode: "CURSOR_PROJECT_TRANSPORT_OVERRIDE",
      declared: expect.objectContaining({ transport: "stdio" }),
      ambient: expect.objectContaining({ transport: "http" }),
    }));
  });
});

describe("OpenCode ambient MCP policy", () => {
  test("classifies equal normalized entries as identical", () => {
    expect(classify(
      "opencode",
      { type: "local", command: ["npx", "server"], enabled: true },
      { type: "local", command: ["npx", "server"], enabled: true },
    )?.reasonCode).toBe("AMBIENT_IDENTICAL");
  });

  test("classifies a same-id project definition as a project-wins warning", () => {
    expect(classify(
      "opencode",
      { type: "local", command: ["npx", "project"] },
      { type: "local", command: ["npx", "user"] },
    )).toEqual(expect.objectContaining({
      disposition: "warning",
      reasonCode: "OPENCODE_PROJECT_OVERRIDES_USER",
    }));
  });

  test("classifies cross-transport same-id definitions as the same project-wins warning", () => {
    expect(classify(
      "opencode",
      { type: "local", command: ["npx", "server"] },
      { type: "remote", url: "https://example.test/mcp" },
    )?.reasonCode).toBe("OPENCODE_PROJECT_OVERRIDES_USER");
  });
});

test("public collision results never contain source definitions or secret-bearing values", () => {
  const collision = classify(
    "codex",
    { command: "npx", env: { PROJECT_TOKEN: "project-secret-sentinel" } },
    {
      url: "https://example.test/mcp",
      bearer_token_env_var: "USER_TOKEN_NAME",
      http_headers: { Authorization: "Bearer user-secret-sentinel" },
    },
  );
  const serialized = JSON.stringify(collision);

  expect(serialized).not.toContain("project-secret-sentinel");
  expect(serialized).not.toContain("user-secret-sentinel");
  expect(serialized).not.toContain("USER_TOKEN_NAME");
  expect(serialized).not.toContain("http_headers");
  expect(serialized).not.toContain("value");
});

test("malformed entries are handed off to target validation instead of misclassified", () => {
  expect(classify("claude", "not-an-object", { command: "npx" })).toBeNull();
  expect(classify("cursor", { command: "npx", url: "https://example.test" }, { command: "npx" })).toBeNull();
  expect(classify("codex", { command: 42 }, { command: "npx" })).toBeNull();
});

test("collision ordering is deterministic by target, server ID, and ambient precedence", () => {
  const project = (target: "claude" | "codex" | "cursor", id: string) =>
    definition(target, "project", id, { command: "project" });
  const collisions = classifyAmbientMcpCollisions([
    { declared: project("cursor", "zeta"), ambient: definition("cursor", "user", "zeta", { command: "user" }) },
    { declared: project("claude", "beta"), ambient: definition("claude", "user", "beta", { command: "user" }) },
    { declared: project("claude", "alpha"), ambient: definition("claude", "user", "alpha", { command: "user" }) },
    { declared: project("claude", "alpha"), ambient: definition("claude", "local", "alpha", { command: "local" }) },
    { declared: project("codex", "alpha"), ambient: definition("codex", "user", "alpha", { command: "user" }) },
  ]);

  expect(collisions.map((entry) => `${entry.target}:${entry.id}:${entry.ambient.source}`)).toEqual([
    "claude:alpha:local",
    "claude:alpha:user",
    "claude:beta:user",
    "codex:alpha:user",
    "cursor:zeta:user",
  ]);
});

test("ambient inspection reads isolated Claude local/user, Codex user, and Cursor user definitions", async () => {
  const fixture = await scaffoldCliFixture();
  const projectRoot = join(fixture.root, "project");
  try {
    await writeFile(fixture.claudeUserMcp, `${JSON.stringify({
      mcpServers: { notion: { command: "claude-user" } },
      projects: { [projectRoot]: { mcpServers: { notion: { command: "claude-local" } } } },
    })}\n`);
    await writeFile(fixture.codexConfig, '[mcp_servers.notion]\ncommand = "codex-user"\n');
    await writeFile(fixture.cursorConfig, `${JSON.stringify({
      mcpServers: { notion: { command: "cursor-user" } },
    })}\n`);
    const config = createFixtureConfig({
      claudeSettings: fixture.claudeSettings,
      claudeUserMcp: fixture.claudeUserMcp,
      codexConfig: fixture.codexConfig,
      cursorConfig: fixture.cursorConfig,
    });

    const inspected = await inspectAmbientMcpDefinitions({
      config,
      homeDir: fixture.homeDir,
      projectRoot,
    });

    expect(inspected.errors).toEqual([]);
    expect(inspected.definitions.map((entry) => `${entry.target}:${entry.source}:${entry.id}`)).toEqual([
      "claude:local:notion",
      "claude:user:notion",
      "codex:user:notion",
      "cursor:user:notion",
    ]);
    expect(inspected.definitions.every((entry) => entry.path.startsWith(fixture.homeDir))).toBe(true);
  } finally {
    await cleanupTempRoots([fixture.root]);
  }
});

test("ambient inspection reports malformed files without leaking their content", async () => {
  const fixture = await scaffoldCliFixture();
  try {
    await writeFile(fixture.codexConfig, 'token = "secret-sentinel"\n[mcp_servers.invalid\n');
    const config = createFixtureConfig({
      claudeSettings: fixture.claudeSettings,
      claudeUserMcp: fixture.claudeUserMcp,
      codexConfig: fixture.codexConfig,
      cursorConfig: fixture.cursorConfig,
    });

    const inspected = await inspectAmbientMcpDefinitions({ config, homeDir: fixture.homeDir });

    expect(inspected.errors).toContainEqual(expect.objectContaining({
      target: "codex",
      path: fixture.codexConfig,
    }));
    expect(JSON.stringify(inspected.errors)).not.toContain("secret-sentinel");
  } finally {
    await cleanupTempRoots([fixture.root]);
  }
});
