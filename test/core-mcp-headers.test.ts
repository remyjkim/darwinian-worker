// ABOUTME: Verifies HTTP MCP `headers` render correctly across Claude, Cursor, and Codex targets.
// ABOUTME: Covers env-var passthrough, Codex bearer translation, and header-less backward compatibility.

import { describe, expect, test } from "bun:test";
import { parse as parseToml } from "smol-toml";
import type { CardLockEntry } from "../cli/core/card-lock";
import { validateCardManifest } from "../cli/core/card-manifest";
import { collectCardServerDefinitions, mergeCardServerDefinitionsIntoRegistry } from "../cli/core/card-mcp";
import { codexUnsupportedHeaderKeys, mergeCodexTomlText, renderCursorConfig, renderJsonMcpConfig, renderMcpServerForTarget } from "../cli/core/mcp";
import { validateMcpLibraryServer } from "../cli/core/mcp-library";
import type { CanonicalRegistry, RegistryServer } from "../cli/core/types";

function headerAuthHttpServer(): Record<string, RegistryServer> {
  return {
    fal: {
      description: "fal.ai hosted MCP",
      transport: "http",
      url: "https://mcp.fal.ai/mcp",
      headers: { Authorization: "Bearer ${FAL_KEY}", "X-Trace": "on" },
      optional: false,
    },
  };
}

function headerlessHttpServer(): Record<string, RegistryServer> {
  return {
    "parallel-search": {
      description: "Parallel Search MCP",
      transport: "http",
      url: "https://search.parallel.ai/mcp",
      optional: false,
    },
  };
}

describe("HTTP MCP headers rendering", () => {
  test("Claude render emits headers verbatim with ${VAR} preserved", () => {
    const parsed = JSON.parse(renderJsonMcpConfig(headerAuthHttpServer())) as {
      mcpServers: Record<string, { type: string; url: string; headers?: Record<string, string> }>;
    };
    const fal = parsed.mcpServers.fal!;
    expect(fal.type).toBe("http");
    expect(fal.url).toBe("https://mcp.fal.ai/mcp");
    expect(fal.headers).toEqual({ Authorization: "Bearer ${FAL_KEY}", "X-Trace": "on" });
  });

  test("Cursor render rewrites header ${VAR} to ${env:VAR}", () => {
    const parsed = JSON.parse(renderCursorConfig(headerAuthHttpServer())) as {
      mcpServers: Record<string, { url: string; headers?: Record<string, string> }>;
    };
    const fal = parsed.mcpServers.fal!;
    expect(fal.url).toBe("https://mcp.fal.ai/mcp");
    expect(fal.headers).toEqual({ Authorization: "Bearer ${env:FAL_KEY}", "X-Trace": "on" });
  });

  test("Codex render maps Authorization Bearer to bearer_token_env_var and literals to http_headers", () => {
    const toml = mergeCodexTomlText("", headerAuthHttpServer());
    const parsed = parseToml(toml) as {
      mcp_servers: Record<string, { url: string; bearer_token_env_var?: string; http_headers?: Record<string, string> }>;
    };
    const fal = parsed.mcp_servers.fal!;
    expect(fal.url).toBe("https://mcp.fal.ai/mcp");
    expect(fal.bearer_token_env_var).toBe("FAL_KEY");
    expect(fal.http_headers).toEqual({ "X-Trace": "on" });
    // The secret must never be emitted as a literal value.
    expect(toml).not.toContain("${FAL_KEY}");
    expect(toml).not.toContain("Bearer");
  });

  test("Codex flags and omits a non-bearer ${VAR} header it cannot interpolate", () => {
    const server: Record<string, RegistryServer> = {
      custom: {
        description: "Custom MCP",
        transport: "http",
        url: "https://example.com/mcp",
        headers: { "X-Api-Key": "${SECRET}", "X-Static": "ok" },
        optional: false,
      },
    };
    expect(codexUnsupportedHeaderKeys(server.custom!)).toEqual(["X-Api-Key"]);
    const toml = mergeCodexTomlText("", server);
    expect(toml).not.toContain("${SECRET}");
    const parsed = parseToml(toml) as {
      mcp_servers: Record<string, { http_headers?: Record<string, string> }>;
    };
    expect(parsed.mcp_servers.custom!.http_headers).toEqual({ "X-Static": "ok" });
  });

  test("header-less HTTP server renders identically across targets (no headers key)", () => {
    const claude = JSON.parse(renderJsonMcpConfig(headerlessHttpServer())) as {
      mcpServers: Record<string, Record<string, unknown>>;
    };
    expect(claude.mcpServers["parallel-search"]).toEqual({
      type: "http",
      url: "https://search.parallel.ai/mcp",
    });

    const cursor = JSON.parse(renderCursorConfig(headerlessHttpServer())) as {
      mcpServers: Record<string, Record<string, unknown>>;
    };
    expect(cursor.mcpServers["parallel-search"]).toEqual({
      type: "http",
      url: "https://search.parallel.ai/mcp",
    });

    const toml = mergeCodexTomlText("", headerlessHttpServer());
    const codex = parseToml(toml) as { mcp_servers: Record<string, Record<string, unknown>> };
    expect(codex.mcp_servers["parallel-search"]).toEqual({
      url: "https://search.parallel.ai/mcp",
      enabled: true,
    });
  });
});

describe("OpenCode MCP rendering", () => {
  test("stdio servers render as local with a combined command array", () => {
    expect(renderMcpServerForTarget("opencode", {
      description: "Docs",
      transport: "stdio",
      command: "npx",
      args: ["-y", "tool"],
      env: { API_KEY: "${MY_KEY}" },
      optional: false,
    })).toEqual({
      type: "local",
      command: ["npx", "-y", "tool"],
      enabled: true,
      environment: { API_KEY: "{env:MY_KEY}" },
      timeout: 30000,
    });
  });

  test("http and sse servers both render as remote with {env:VAR} headers", () => {
    for (const transport of ["http", "sse"] as const) {
      expect(renderMcpServerForTarget("opencode", {
        description: "fal.ai hosted MCP",
        transport,
        url: "https://mcp.fal.ai/mcp",
        headers: { Authorization: "Bearer ${FAL_KEY}", "X-Trace": "on" },
        optional: false,
      })).toEqual({
        type: "remote",
        url: "https://mcp.fal.ai/mcp",
        enabled: true,
        headers: { Authorization: "Bearer {env:FAL_KEY}", "X-Trace": "on" },
        timeout: 30000,
      });
    }
  });

  test("startupTimeoutSec overrides the timeout in milliseconds", () => {
    expect(renderMcpServerForTarget("opencode", {
      description: "Slow start",
      transport: "stdio",
      command: "npx",
      startupTimeoutSec: 60,
      optional: false,
    })).toMatchObject({ timeout: 60000 });
  });
});

describe("header validation", () => {
  const httpServer = (headers: unknown) => ({
    description: "fal.ai hosted MCP",
    transport: "http",
    url: "https://mcp.fal.ai/mcp",
    headers,
    optional: false,
  });

  test("card manifest accepts string headers and rejects non-string values", () => {
    const ok = validateCardManifest({
      name: "@me/fal",
      version: "0.1.0",
      servers: { fal: httpServer({ Authorization: "Bearer ${FAL_KEY}" }) },
    });
    expect(ok.ok).toBe(true);

    const bad = validateCardManifest({
      name: "@me/fal",
      version: "0.1.0",
      servers: { fal: httpServer({ Authorization: 123 }) },
    });
    expect(bad.ok).toBe(false);
    expect(bad.errors).toContain("servers.fal.headers must be a string-to-string map");
  });

  test("mcp library validation rejects non-string header values", () => {
    expect(() => validateMcpLibraryServer("fal", httpServer({ Authorization: "Bearer ${FAL_KEY}" }))).not.toThrow();
    expect(() => validateMcpLibraryServer("fal", httpServer({ Authorization: 123 }))).toThrow(
      /headers must be a string-to-string map/,
    );
  });
});

describe("card round-trip", () => {
  test("a card-declared header-auth HTTP server survives the registry merge and renders into Claude", () => {
    const lockedCards = [
      {
        name: "@remyjkim/fal",
        version: "0.1.0",
        manifest: {
          name: "@remyjkim/fal",
          version: "0.1.0",
          servers: {
            fal: {
              description: "fal.ai hosted MCP",
              transport: "http",
              url: "https://mcp.fal.ai/mcp",
              headers: { Authorization: "Bearer ${FAL_KEY}" },
              optional: false,
            },
          },
        },
      },
    ] as unknown as CardLockEntry[];

    const defs = collectCardServerDefinitions(lockedCards);
    expect(defs).toHaveLength(1);

    const registry: CanonicalRegistry = { version: 1, servers: {} };
    const merged = mergeCardServerDefinitionsIntoRegistry(registry, defs);
    const claude = JSON.parse(renderJsonMcpConfig(merged.servers)) as {
      mcpServers: Record<string, { type: string; url: string; headers?: Record<string, string> }>;
    };
    expect(claude.mcpServers.fal!.headers).toEqual({ Authorization: "Bearer ${FAL_KEY}" });
  });
});
