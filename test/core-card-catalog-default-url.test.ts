// ABOUTME: Verifies resolveDefaultCommunityCatalogUrl reads the URL from CanonicalConfig.defaults.
// ABOUTME: Keeps the default catalog URL as configurable data, not a code constant.

import { describe, expect, test } from "bun:test";
import { resolveDefaultCommunityCatalogUrl } from "../cli/core/card-catalog";
import type { CanonicalConfig } from "../cli/core/types";

function configWithDefaults(defaults: NonNullable<CanonicalConfig["defaults"]>): CanonicalConfig {
  return {
    version: 1,
    targets: {
      claude: { enabled: true, configPath: "/c", format: "json-merge", mcpKey: "mcpServers" },
      codex: { enabled: true, configPath: "/d", format: "toml-merge", mcpKey: "mcp_servers" },
      cursor: { enabled: true, configPath: "/u", format: "json-standalone", mcpKey: "mcpServers" },
      opencode: { enabled: false, configPath: "/o", format: "json-merge", mcpKey: "mcp" },
    },
    optional: {},
    defaults,
  };
}

describe("resolveDefaultCommunityCatalogUrl", () => {
  test("returns the configured URL when defaults.communityCatalogUrl is set", () => {
    const config = configWithDefaults({ communityCatalogUrl: "https://example.com/foo.git" });
    expect(resolveDefaultCommunityCatalogUrl(config)).toBe("https://example.com/foo.git");
  });

  test("returns null when defaults.communityCatalogUrl is explicitly null (disabled)", () => {
    const config = configWithDefaults({ communityCatalogUrl: null });
    expect(resolveDefaultCommunityCatalogUrl(config)).toBeNull();
  });

  test("returns null when defaults.communityCatalogUrl is undefined", () => {
    const config = configWithDefaults({});
    expect(resolveDefaultCommunityCatalogUrl(config)).toBeNull();
  });

  test("returns null when defaults section is missing", () => {
    const config: CanonicalConfig = {
      version: 1,
      targets: {
        claude: { enabled: true, configPath: "/c", format: "json-merge", mcpKey: "mcpServers" },
        codex: { enabled: true, configPath: "/d", format: "toml-merge", mcpKey: "mcp_servers" },
        cursor: { enabled: true, configPath: "/u", format: "json-standalone", mcpKey: "mcpServers" },
      opencode: { enabled: false, configPath: "/o", format: "json-merge", mcpKey: "mcp" },
      },
      optional: {},
    };
    expect(resolveDefaultCommunityCatalogUrl(config)).toBeNull();
  });

  test("returns null when config is null or undefined", () => {
    expect(resolveDefaultCommunityCatalogUrl(null)).toBeNull();
    expect(resolveDefaultCommunityCatalogUrl(undefined)).toBeNull();
  });
});
