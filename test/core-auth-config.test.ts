// ABOUTME: Verifies analyzer auth config resolution for env, packaged, and user config.
// ABOUTME: Protects URL normalization and cards-era machine-config merge behavior.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempRoots, scaffoldCliFixture } from "./helpers";
import type { AgentsContext } from "../cli/context";
import { createEmptyMachineConfig } from "../cli/core/machine-config";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

function contextFor(fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>): Pick<AgentsContext, "repoRoot" | "agentsDir"> {
  return {
    repoRoot: fixture.repoRoot,
    agentsDir: fixture.agentsDir,
  };
}

describe("loadAnalyzerConfig", () => {
  test("defaults clientId and exposes the user config path when apiUrl is absent", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const { loadAnalyzerConfig } = await import("../cli/core/auth/config");

    const cfg = await loadAnalyzerConfig(contextFor(fixture), {});

    expect(cfg).toMatchObject({
      apiUrl: undefined,
      clientId: "drwn-cli",
      configPath: join(fixture.agentsDir, "drwn", "machine.json"),
    });
  });

  test("uses DRWN_ANALYZER_URL before configured apiUrl and trims trailing slash", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await mkdir(join(fixture.agentsDir, "drwn"), { recursive: true });
    await writeFile(
      join(fixture.agentsDir, "drwn", "machine.json"),
      JSON.stringify({
        ...createEmptyMachineConfig(),
        policy: { analyzer: { apiUrl: "https://configured.test", clientId: "configured-client" } },
      }),
    );
    const { loadAnalyzerConfig } = await import("../cli/core/auth/config");

    const cfg = await loadAnalyzerConfig(contextFor(fixture), {
      DRWN_ANALYZER_URL: "https://env.test/",
    });

    expect(cfg.apiUrl).toBe("https://env.test");
    expect(cfg.clientId).toBe("configured-client");
  });

  test("reads analyzer values from user config and trims webBaseUrl", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await mkdir(join(fixture.agentsDir, "drwn"), { recursive: true });
    await writeFile(
      join(fixture.agentsDir, "drwn", "machine.json"),
      JSON.stringify({
        ...createEmptyMachineConfig(),
        policy: { analyzer: {
          apiUrl: "https://api.test/",
          clientId: "custom-client",
          webBaseUrl: "https://app.test/",
          maxArchiveBytes: 1234,
        } },
      }),
    );
    const { loadAnalyzerConfig } = await import("../cli/core/auth/config");

    const cfg = await loadAnalyzerConfig(contextFor(fixture), {});

    expect(cfg.apiUrl).toBe("https://api.test");
    expect(cfg.clientId).toBe("custom-client");
    expect(cfg.webBaseUrl).toBe("https://app.test");
    expect(cfg.maxArchiveBytes).toBe(1234);
  });

  test("uses DRWN_ANALYZER_WEB_URL before configured webBaseUrl", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await mkdir(join(fixture.agentsDir, "drwn"), { recursive: true });
    await writeFile(
      join(fixture.agentsDir, "drwn", "machine.json"),
      JSON.stringify({
        ...createEmptyMachineConfig(),
        policy: { analyzer: { webBaseUrl: "https://configured-app.test" } },
      }),
    );
    const { loadAnalyzerConfig } = await import("../cli/core/auth/config");

    const cfg = await loadAnalyzerConfig(contextFor(fixture), {
      DRWN_ANALYZER_WEB_URL: "https://env-app.test/",
    });

    expect(cfg.webBaseUrl).toBe("https://env-app.test");
  });

  test("machine-config merge preserves analyzer settings", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await mkdir(join(fixture.agentsDir, "drwn"), { recursive: true });
    await writeFile(join(fixture.agentsDir, "drwn", "store.json"), JSON.stringify({ schemaVersion: 1, initAt: "now" }));
    await writeFile(
      join(fixture.agentsDir, "drwn", "machine.json"),
      JSON.stringify({
        ...createEmptyMachineConfig(),
        policy: { analyzer: { apiUrl: "https://machine.test/" } },
      }),
    );
    const { loadAnalyzerConfig } = await import("../cli/core/auth/config");

    const cfg = await loadAnalyzerConfig(contextFor(fixture), {});

    expect(cfg.apiUrl).toBe("https://machine.test");
  });
});
