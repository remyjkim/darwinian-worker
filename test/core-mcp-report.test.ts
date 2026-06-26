// ABOUTME: Verifies reporting for optional MCP servers declared by locked cards.
// ABOUTME: Keeps write-time MCP visibility separate from materialization side effects.

import { describe, expect, test } from "bun:test";
import type { CardLockEntry } from "../cli/core/card-lock";
import { computeOptionalMcpReport } from "../cli/core/mcp-report";
import type { RegistryServer, ServerOverride } from "../cli/core/types";

const slackServer: RegistryServer = {
  description: "Slack",
  transport: "stdio",
  command: "slack-mcp",
  optional: true,
};

function lockedCard(servers: Record<string, ServerOverride>): CardLockEntry {
  return {
    name: "@me/base",
    requested: "@me/base@1.0.0",
    version: "1.0.0",
    path: "/tmp/card",
    integrity: "sha256-test",
    manifest: {
      name: "@me/base",
      version: "1.0.0",
      servers,
    },
    skills: [],
    hooks: [],
    registry: null,
    origin: "store",
  };
}

describe("computeOptionalMcpReport", () => {
  test("returns null when locked cards declare no optional MCP servers", () => {
    const report = computeOptionalMcpReport({
      lockedCards: [lockedCard({ context7: { ...slackServer, optional: false } })],
      activeServers: {},
      effectiveRegistry: { version: 1, servers: {} },
      projectConfigPath: "/project/.agents/drwn/config.json",
      projectServerOverrides: undefined,
    });

    expect(report).toBeNull();
  });

  test("ignores card server toggle entries because they are not definitions", () => {
    const report = computeOptionalMcpReport({
      lockedCards: [lockedCard({ slack: { enabled: true } })],
      activeServers: { slack: slackServer },
      effectiveRegistry: { version: 1, servers: { slack: slackServer } },
      projectConfigPath: "/project/.agents/drwn/config.json",
      projectServerOverrides: undefined,
    });

    expect(report).toBeNull();
  });

  test("reports skipped card-declared optional MCP servers with the project opt-in command", () => {
    const report = computeOptionalMcpReport({
      lockedCards: [lockedCard({ slack: slackServer })],
      activeServers: {},
      effectiveRegistry: { version: 1, servers: { slack: slackServer } },
      projectConfigPath: "/project/.agents/drwn/config.json",
      projectServerOverrides: undefined,
    });

    expect(report?.entries).toEqual([
      {
        cardName: "@me/base",
        cardVersion: "1.0.0",
        serverName: "slack",
        status: "skipped",
        reason: "optional-disabled",
        optInCommand: "drwn add mcp slack",
      },
    ]);
    expect(report?.skippedCount).toBe(1);
    expect(report?.shadowedCount).toBe(0);
  });

  test("reports active when the active definition matches the card definition", () => {
    const report = computeOptionalMcpReport({
      lockedCards: [lockedCard({ slack: slackServer })],
      activeServers: { slack: slackServer },
      effectiveRegistry: { version: 1, servers: { slack: slackServer } },
      projectConfigPath: "/project/.agents/drwn/config.json",
      projectServerOverrides: undefined,
    });

    expect(report?.entries[0]?.status).toBe("active");
    expect(report?.skippedCount).toBe(0);
    expect(report?.shadowedCount).toBe(0);
  });

  test("reports shadowed when an active same-name definition differs from the card definition", () => {
    const report = computeOptionalMcpReport({
      lockedCards: [lockedCard({ slack: slackServer })],
      activeServers: { slack: { ...slackServer, command: "other-slack-mcp" } },
      effectiveRegistry: { version: 1, servers: { slack: { ...slackServer, command: "other-slack-mcp" } } },
      projectConfigPath: "/project/.agents/drwn/config.json",
      projectServerOverrides: undefined,
    });

    expect(report?.entries).toEqual([
      {
        cardName: "@me/base",
        cardVersion: "1.0.0",
        serverName: "slack",
        status: "shadowed",
        reason: "definition-shadowed",
      },
    ]);
    expect(report?.skippedCount).toBe(0);
    expect(report?.shadowedCount).toBe(1);
  });
});
