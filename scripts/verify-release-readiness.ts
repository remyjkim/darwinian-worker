// ABOUTME: Runs the release-readiness quality gate for the drwn CLI and darwinian-harness package.
// ABOUTME: Combines automated checks and explicit warnings into a single non-mutating verification entrypoint.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

type CheckResult = {
  name: string;
  ok: boolean;
  details?: string;
};

type GateReport = {
  ok: boolean;
  checks: CheckResult[];
  warnings: string[];
};

const repoRoot = process.cwd();
const args = new Set(process.argv.slice(2));
const jsonMode = args.has("--json");
const testMode = process.env.QUALITY_GATE_TEST_MODE === "1";

async function runCommand(name: string, cmd: string[]) {
  const proc = Bun.spawn(cmd, {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  return {
    name,
    ok: exitCode === 0,
    details: exitCode === 0 ? undefined : `${stdout}${stderr}`.trim(),
  } satisfies CheckResult;
}

async function verifyPackageContents() {
  const proc = Bun.spawn(["npm", "pack", "--dry-run", "--json"], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    return {
      name: "package contents",
      ok: false,
      details: `${stdout}${stderr}`.trim(),
    } satisfies CheckResult;
  }

  const parsed = JSON.parse(stdout) as Array<{ files?: Array<{ path: string }> }>;
  const files = parsed[0]?.files?.map((file) => file.path) ?? [];
  const forbidden = files.filter(
    (file) =>
      file === ".env" ||
      file.startsWith(".ai/") ||
      file.startsWith("test/") ||
      file.startsWith("scripts/"),
  );
  const required = [
    "cli/index.ts",
    "cli/commands/write.ts",
    "cli/commands/mcp/write.ts",
    "registry/config.json",
    "registry/mcp-servers.json",
    "skills/shared/frontend-design/SKILL.md",
  ];
  const removedCommandFiles = [
    "cli/commands/apply.ts",
    "cli/commands/mcp/apply.ts",
    "cli/commands/sync.ts",
    "cli/commands/mcp/sync.ts",
    "cli/commands/skills/sync.ts",
    "sync-mcp.ts",
  ];
  const forbiddenCommands = removedCommandFiles.filter((file) => files.includes(file));
  const missingRequired = required.filter((file) => !files.includes(file));
  const details = [
    ...(forbidden.length > 0 ? [`Forbidden: ${forbidden.join(", ")}`] : []),
    ...(forbiddenCommands.length > 0 ? [`Removed commands: ${forbiddenCommands.join(", ")}`] : []),
    ...(missingRequired.length > 0 ? [`Missing: ${missingRequired.join(", ")}`] : []),
  ];

  return {
    name: "package contents",
    ok: details.length === 0,
    details: details.join("; ") || undefined,
  } satisfies CheckResult;
}

function findHardcodedUserPaths() {
  const targets = [
    "cli",
    "sync-mcp.ts",
    "README.md",
    "registry/mcp-servers.json",
    "registry/config.json",
    "package.json",
    ".ai/knowledges/01_agents-cli-usage-guide.md",
    ".ai/knowledges/02_per-project-config-guide.md",
    ".ai/knowledges/03_npm-skill-bundles-guide.md",
    ".ai/knowledges/04_homebrew-release-checklist.md",
    ".ai/knowledges/05_npm-publishing-analysis-and-manual.md",
  ];
  const matches: string[] = [];

  for (const target of targets) {
    const pathValue = join(repoRoot, target);
    if (!existsSync(pathValue)) {
      continue;
    }
    const stat = Bun.file(pathValue);
    if (target === "cli") {
      for (const file of new Bun.Glob("**/*").scanSync({ cwd: pathValue, absolute: true })) {
        if (!file.endsWith(".ts")) {
          continue;
        }
        const content = readFileSync(file, "utf8");
        if (content.includes("/Users/")) {
          matches.push(file.replace(`${repoRoot}/`, ""));
        }
      }
      continue;
    }

    const content = readFileSync(pathValue, "utf8");
    if (content.includes("/Users/")) {
      matches.push(target);
    }
  }

  return matches;
}

function verifyPackageMetadata() {
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as Record<string, unknown>;
  const requiredKeys = ["name", "version", "description", "license", "author", "keywords", "bin"] as const;
  const missing = requiredKeys.filter((key) => pkg[key] === undefined);
  const metadataIssues: string[] = [];
  const warnings: string[] = [];

  if (pkg.name !== "darwinian-harness") {
    metadataIssues.push("name must be darwinian-harness");
  }

  if (typeof pkg.bin !== "object" || pkg.bin === null || (pkg.bin as Record<string, string>).drwn !== "cli/index.ts") {
    metadataIssues.push("bin.drwn must point to cli/index.ts");
  }

  if (typeof pkg.scripts !== "object" || pkg.scripts === null || (pkg.scripts as Record<string, string>).drwn !== "bun run cli/index.ts") {
    metadataIssues.push("scripts.drwn must be 'bun run cli/index.ts'");
  }

  if (pkg.repository === undefined) {
    warnings.push("repository metadata unresolved");
  }

  return {
    check: {
      name: "package metadata",
      ok: missing.length === 0 && metadataIssues.length === 0,
      details: [...(missing.length > 0 ? [`Missing: ${missing.join(", ")}`] : []), ...metadataIssues].join("; ") || undefined,
    } satisfies CheckResult,
    warnings,
  };
}

function verifyDocsPresence() {
  const requiredFiles = [
    "README.md",
    "CONTRIBUTING.md",
    "LICENSE",
    ".ai/knowledges/01_agents-cli-usage-guide.md",
    ".ai/knowledges/02_per-project-config-guide.md",
    ".ai/knowledges/03_npm-skill-bundles-guide.md",
    ".ai/knowledges/04_homebrew-release-checklist.md",
    ".ai/knowledges/05_npm-publishing-analysis-and-manual.md",
  ];
  const missing = requiredFiles.filter((file) => !existsSync(join(repoRoot, file)));

  return {
    name: "documentation presence",
    ok: missing.length === 0,
    details: missing.length > 0 ? `Missing: ${missing.join(", ")}` : undefined,
  } satisfies CheckResult;
}

async function main() {
  const checks: CheckResult[] = [];
  const warnings: string[] = [];

  if (testMode) {
    checks.push({ name: "quality gate test mode", ok: true });
  } else {
    checks.push(await runCommand("bun test", ["bun", "test"]));
    checks.push(await runCommand("typecheck", ["bun", "run", "typecheck"]));
  }

  const hardcodedPaths = findHardcodedUserPaths();
  checks.push({
    name: "hardcoded path scan",
    ok: hardcodedPaths.length === 0,
    details: hardcodedPaths.length > 0 ? hardcodedPaths.join(", ") : undefined,
  });

  const packageResult = verifyPackageMetadata();
  checks.push(packageResult.check);
  warnings.push(...packageResult.warnings);

  checks.push(verifyDocsPresence());
  checks.push(await verifyPackageContents());

  const report: GateReport = {
    ok: checks.every((check) => check.ok),
    checks,
    warnings,
  };

  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    for (const check of checks) {
      console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}${check.details ? ` - ${check.details}` : ""}`);
    }
    for (const warning of warnings) {
      console.log(`WARN ${warning}`);
    }
  }

  process.exitCode = report.ok ? 0 : 1;
}

await main();
