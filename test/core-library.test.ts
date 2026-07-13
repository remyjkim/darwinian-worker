// ABOUTME: Verifies local library inventory helpers for skills and MCP servers.
// ABOUTME: Protects the user-facing library model before command wrappers are added.

import { afterEach, describe, expect, test } from "bun:test";
import { cleanupTempRoots, createInstalledSkillBundle, scaffoldCliFixture } from "./helpers";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

describe("core library", () => {
  test("lists repo-native and package-backed skills", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await createInstalledSkillBundle(fixture.agentsDir, { skillName: "hello-skill" });

    const { listLibrarySkills } = await import("../cli/core/library");
    const skills = await listLibrarySkills(fixture.repoRoot, fixture.agentsDir, fixture.homeDir);

    expect(skills.some((skill) => skill.id === "alpha" && skill.source === "repo")).toBe(true);
    expect(skills.some((skill) => skill.id === "hello-skill" && skill.source === "npm")).toBe(true);
  });

  test("finds local skills by exact id", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    await createInstalledSkillBundle(fixture.agentsDir, { skillName: "hello-skill" });

    const { findLibrarySkill } = await import("../cli/core/library");

    expect((await findLibrarySkill(fixture.repoRoot, fixture.agentsDir, fixture.homeDir, "alpha"))?.source).toBe("repo");
    expect((await findLibrarySkill(fixture.repoRoot, fixture.agentsDir, fixture.homeDir, "hello-skill"))?.source).toBe("npm");
    expect(await findLibrarySkill(fixture.repoRoot, fixture.agentsDir, fixture.homeDir, "missing")).toBeNull();
  });

  test("lists and finds MCP servers from the packaged registry", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);

    const { findLibraryMcpServer, listLibraryMcpServers } = await import("../cli/core/library");
    const servers = await listLibraryMcpServers(fixture.repoRoot);

    expect(servers.some((server) => server.id === "context7" && server.source === "registry")).toBe(true);
    expect((await findLibraryMcpServer(fixture.repoRoot, "context7"))?.server.command).toBe("npx");
    expect(await findLibraryMcpServer(fixture.repoRoot, "missing")).toBeNull();
  });

  test("lists and finds user MCP library servers", async () => {
    const fixture = await scaffoldCliFixture();
    tempRoots.push(fixture.root);
    const { seedMcpInventory } = await import("./mcp-inventory-fixture");
    await seedMcpInventory(fixture.agentsDir, {
      version: 1,
      servers: {
        github: {
          description: "GitHub",
          transport: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
          optional: true,
        },
      },
    });

    const { findLibraryMcpServer, listLibraryMcpServers } = await import("../cli/core/library");
    const servers = await listLibraryMcpServers(fixture.repoRoot, fixture.agentsDir);

    expect(servers.some((server) => server.id === "github" && server.source === "library")).toBe(true);
    expect((await findLibraryMcpServer(fixture.repoRoot, "github", fixture.agentsDir))?.server.command).toBe("npx");
  });
});
