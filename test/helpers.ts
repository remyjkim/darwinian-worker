// ABOUTME: Provides reusable temp-repo and temp-home fixtures for CLI and core integration tests.
// ABOUTME: Centralizes CLI spawning with environment overrides so tests never touch the real machine state.

import { expect } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { CanonicalConfig, CanonicalRegistry } from "../cli/core/types";

export async function createTempRoot(prefix: string) {
  return await mkdtemp(join(tmpdir(), prefix));
}

export async function cleanupTempRoots(roots: string[]) {
  await Promise.all(
    roots.splice(0).map(async (root) => {
      await rm(root, { recursive: true, force: true });
    }),
  );
}

export function createFixtureRegistry(): CanonicalRegistry {
  return {
    version: 1,
    servers: {
      context7: {
        description: "Docs",
        transport: "stdio",
        command: "npx",
        args: ["-y", "@upstash/context7-mcp"],
        optional: false,
      },
      "parallel-search": {
        description: "Parallel Search MCP",
        transport: "http",
        url: "https://search.parallel.ai/mcp",
        optional: false,
      },
    },
  };
}

export function createFixtureConfig(
  paths: { claudeSettings: string; codexConfig: string; cursorConfig: string },
  parallelMcpEnabled = false,
): CanonicalConfig {
  return {
    version: 1,
    targets: {
      claude: { enabled: true, configPath: paths.claudeSettings, format: "json-merge", mcpKey: "mcpServers" },
      codex: { enabled: true, configPath: paths.codexConfig, format: "toml-merge", mcpKey: "mcp_servers" },
      cursor: { enabled: true, configPath: paths.cursorConfig, format: "json-standalone", mcpKey: "mcpServers", symlink: true },
    },
    catalogs: {
      npmSkills: { enabled: true, searchLimit: 20 },
      mcp: { enabled: false, sources: [] },
    },
    optional: {},
    parallel: { cli: { enabled: true }, mcp: { enabled: parallelMcpEnabled } },
  };
}

export async function scaffoldCliFixture(options?: { parallelMcpEnabled?: boolean; curatedSkillNames?: string[] }) {
  const root = await createTempRoot("agents-cli-");
  const repoRoot = join(root, "repo");
  const homeDir = join(root, "home");
  const agentsDir = join(homeDir, ".agents");
  const claudeSettings = join(homeDir, ".claude", "settings.json");
  const codexConfig = join(homeDir, ".codex", "config.toml");
  const cursorConfig = join(homeDir, ".cursor", "mcp.json");

  await mkdir(join(repoRoot, "registry"), { recursive: true });
  await mkdir(join(repoRoot, "skills", "shared"), { recursive: true });
  await mkdir(join(repoRoot, "skills", "claude-only"), { recursive: true });
  await mkdir(join(repoRoot, "skills", "codex-only"), { recursive: true });
  await mkdir(join(repoRoot, "skills", "experimental"), { recursive: true });
  await mkdir(dirname(claudeSettings), { recursive: true });
  await mkdir(dirname(codexConfig), { recursive: true });
  await mkdir(dirname(cursorConfig), { recursive: true });
  await mkdir(join(agentsDir, "skills"), { recursive: true });

  await writeFile(join(repoRoot, "registry", "mcp-servers.json"), JSON.stringify(createFixtureRegistry(), null, 2));
  await writeFile(
    join(repoRoot, "registry", "config.json"),
    JSON.stringify(
      createFixtureConfig({ claudeSettings, codexConfig, cursorConfig }, options?.parallelMcpEnabled ?? false),
      null,
      2,
    ),
  );
  await writeFile(claudeSettings, JSON.stringify({ model: "sonnet" }, null, 2));
  await writeFile(codexConfig, 'personality = "pragmatic"\n');
  await writeFile(cursorConfig, JSON.stringify({ mcpServers: {} }, null, 2));

  for (const name of ["alpha", "beta"]) {
    const skillDir = join(repoRoot, "skills", "shared", name);
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), `---\nname: ${name}\ndescription: ${name}\n---\n`);
  }

  for (const name of options?.curatedSkillNames ?? []) {
    await symlink(join(repoRoot, "skills", "shared", name), join(agentsDir, "skills", name), "dir");
  }

  return { root, repoRoot, homeDir, agentsDir, claudeSettings, codexConfig, cursorConfig };
}

export function envFor(fixture: { repoRoot: string; homeDir: string; agentsDir: string }) {
  return {
    AGENTS_REPO_ROOT: fixture.repoRoot,
    AGENTS_HOME_DIR: fixture.homeDir,
    AGENTS_DIR: fixture.agentsDir,
  };
}

export async function publishCardWithSkills(
  fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>,
  options: {
    name: string;
    version?: string;
    skills: string[];
    servers?: Record<string, unknown>;
  },
): Promise<string> {
  const version = options.version ?? "1.0.0";
  const match = options.name.match(/^(@[^/]+)\/(.+)$/);
  if (!match) {
    throw new Error(`Use a scoped card name in tests: ${options.name}`);
  }
  const [, scope, cardName] = match;
  const sourceRoot = join(fixture.agentsDir, "bgng", "sources", scope!, cardName!);
  if (!existsSync(join(sourceRoot, "card.json"))) {
    expect((await runAgentsCli(["card", "new", options.name, "--no-git"], envFor(fixture))).exitCode).toBe(0);
  }

  const manifestPath = join(sourceRoot, "card.json");
  const manifest = JSON.parse(await Bun.file(manifestPath).text());
  manifest.version = version;
  manifest.skills = { include: options.skills };
  if (options.servers) {
    manifest.servers = options.servers;
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  for (const skill of options.skills) {
    const skillDir = join(sourceRoot, "skills", skill);
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), `---\nname: ${skill}\ndescription: ${skill}\n---\n`);
  }

  const published = await runAgentsCli(["card", "publish", options.name], envFor(fixture));
  expect(published.exitCode).toBe(0);
  return join(fixture.agentsDir, "bgng", "cards", scope!, cardName!, version);
}

export async function createInstalledSkillBundle(
  agentsDir: string,
  options?: {
    packageName?: string;
    version?: string;
    skillName?: string;
    scope?: "shared" | "claude-only" | "codex-only" | "experimental";
  },
) {
  const packageName = options?.packageName ?? "@acme/skills-sample";
  const version = options?.version ?? "1.0.0";
  const skillName = options?.skillName ?? "hello-skill";
  const scope = options?.scope ?? "shared";
  const packageRoot = join(agentsDir, "packages", "skills", ...packageName.split("/"), version);
  const skillDir = join(packageRoot, "skills", scope, skillName);

  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, "SKILL.md"), `---\nname: ${skillName}\ndescription: ${skillName}\n---\n`);
  await writeFile(
    join(packageRoot, "bundle.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        bundleName: packageName,
        version,
        skills: [{ name: skillName, scope, path: `skills/${scope}/${skillName}` }],
      },
      null,
      2,
    ),
  );
  await symlink(version, join(dirname(packageRoot), "current"), "dir");

  return { packageName, version, skillName, scope, packageRoot, skillDir };
}

export async function createSkillBundleFixture(
  root: string,
  options?: { packageName?: string; version?: string; skillName?: string },
) {
  const packageName = options?.packageName ?? "@acme/skills-sample";
  const version = options?.version ?? "1.0.0";
  const skillName = options?.skillName ?? "hello-skill";
  const bundleRoot = join(root, "bundle");
  const skillDir = join(bundleRoot, "skills", "shared", skillName);

  await mkdir(skillDir, { recursive: true });
  await writeFile(
    join(bundleRoot, "package.json"),
    JSON.stringify(
      {
        name: packageName,
        version,
        description: "fixture",
        license: "MIT",
        files: ["skills", "bundle.json", "README.md"],
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(bundleRoot, "bundle.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        bundleName: packageName,
        version,
        displayName: "Sample Skills",
        skills: [{ name: skillName, scope: "shared", path: `skills/shared/${skillName}` }],
      },
      null,
      2,
    ),
  );
  await writeFile(join(bundleRoot, "README.md"), "# fixture\n");
  await writeFile(join(skillDir, "SKILL.md"), `---\nname: ${skillName}\ndescription: fixture\n---\n`);
  return { bundleRoot, packageName, version, skillName };
}

export async function createExecutable(dir: string, name: string, body: string) {
  await mkdir(dir, { recursive: true });
  const path = join(dir, name);
  await writeFile(path, `#!/bin/sh\n${body}\n`);
  await chmod(path, 0o755);
  return path;
}

export async function runAgentsCli(args: string[], env: Record<string, string>, cwd?: string) {
  const entrypoint = new URL("../cli/index.ts", import.meta.url).pathname;
  const proc = Bun.spawn([process.execPath, "run", entrypoint, ...args], {
    cwd: cwd ?? join(import.meta.dir, ".."),
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      ...env,
    },
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  return { stdout, stderr, exitCode };
}

export async function runGlobalAgentsCli(args: string[], env: Record<string, string>) {
  const proc = Bun.spawn(["bgng", ...args], {
    cwd: join(import.meta.dir, ".."),
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      ...env,
    },
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  return { stdout, stderr, exitCode };
}

export async function runSyncWrapper(args: string[], env: Record<string, string>) {
  const proc = Bun.spawn(["bun", "run", "sync-mcp.ts", ...args], {
    cwd: join(import.meta.dir, ".."),
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      ...env,
    },
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  return { stdout, stderr, exitCode };
}
