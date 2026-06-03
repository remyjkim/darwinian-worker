// ABOUTME: Builds local bare Git card repositories for network-free integration tests.
// ABOUTME: Lets tests exercise real Git operations through file:// remotes.

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface LocalCardRepo {
  url: string;
  bareRepoPath: string;
  sourceDir: string;
  tempDir: string;
}

export async function createLocalCardRepo(options: {
  name: string;
  version?: string;
  skills?: string[];
  servers?: Record<string, unknown>;
}): Promise<LocalCardRepo> {
  const version = options.version ?? "1.0.0";
  const skills = options.skills ?? ["sample-skill"];
  const tempDir = await mkdtemp(join(tmpdir(), "drwn-test-repo-"));
  const sourceDir = join(tempDir, "source");
  const bareRepoPath = join(tempDir, "bare.git");

  await writeCardSource(sourceDir, {
    name: options.name,
    version,
    skills,
    servers: options.servers ?? {},
  });
  await runGitInTest(["init", "--bare", bareRepoPath]);
  await commitSourceToBare({ bareRepoPath, sourceDir, tempDir, name: options.name, version, tag: `v${version}` });

  return {
    url: `file://${bareRepoPath}`,
    bareRepoPath,
    sourceDir,
    tempDir,
  };
}

export async function tagAdditionalVersion(
  repo: Pick<LocalCardRepo, "bareRepoPath" | "sourceDir" | "tempDir">,
  options: {
    name: string;
    version: string;
    skills?: string[];
    message?: string;
  },
): Promise<string> {
  await writeCardSource(repo.sourceDir, {
    name: options.name,
    version: options.version,
    skills: options.skills ?? ["sample-skill"],
    servers: {},
  });
  return await commitSourceToBare({
    bareRepoPath: repo.bareRepoPath,
    sourceDir: repo.sourceDir,
    tempDir: repo.tempDir,
    name: options.name,
    version: options.version,
    tag: `v${options.version}`,
    message: options.message,
  });
}

export async function cleanupLocalCardRepo(repo: Pick<LocalCardRepo, "tempDir">) {
  await rm(repo.tempDir, { recursive: true, force: true });
}

async function writeCardSource(
  sourceDir: string,
  options: {
    name: string;
    version: string;
    skills: string[];
    servers: Record<string, unknown>;
  },
) {
  await rm(sourceDir, { recursive: true, force: true });
  await mkdir(sourceDir, { recursive: true });
  await writeFile(
    join(sourceDir, "card.json"),
    `${JSON.stringify(
      {
        name: options.name,
        version: options.version,
        description: "Test card",
        skills: { include: options.skills },
        servers: options.servers,
      },
      null,
      2,
    )}\n`,
  );

  for (const skill of options.skills) {
    await mkdir(join(sourceDir, "skills", skill), { recursive: true });
    await writeFile(join(sourceDir, "skills", skill, "SKILL.md"), `# ${skill}\n\nTest skill body.\n`);
  }
}

async function commitSourceToBare(options: {
  bareRepoPath: string;
  sourceDir: string;
  tempDir: string;
  name: string;
  version: string;
  tag: string;
  message?: string;
}) {
  const tempIndex = join(options.tempDir, `.tmp-index-${options.version}`);
  await rm(tempIndex, { force: true });
  await runGitInTest(
    ["--git-dir", options.bareRepoPath, "--work-tree", options.sourceDir, "add", "-A"],
    { GIT_INDEX_FILE: tempIndex },
  );
  const treeSha = (await runGitInTest(["--git-dir", options.bareRepoPath, "write-tree"], { GIT_INDEX_FILE: tempIndex })).stdout.trim();
  const parent = await maybeCurrentHead(options.bareRepoPath);
  const commitArgs = [
    "--git-dir",
    options.bareRepoPath,
    "commit-tree",
    treeSha,
    "-m",
    options.message ?? `Publish ${options.name}@${options.version}`,
  ];
  if (parent) {
    commitArgs.push("-p", parent);
  }
  const commitSha = (await runGitInTest(commitArgs, gitIdentityEnv(tempIndex))).stdout.trim();
  await runGitInTest(["--git-dir", options.bareRepoPath, "update-ref", "refs/heads/main", commitSha]);
  await runGitInTest(["--git-dir", options.bareRepoPath, "tag", "-a", options.tag, "-m", options.tag, commitSha], gitIdentityEnv(tempIndex));
  return commitSha;
}

async function maybeCurrentHead(bareRepoPath: string) {
  const result = await runGitInTest(["--git-dir", bareRepoPath, "rev-parse", "--verify", "refs/heads/main"], undefined, {
    allowFailure: true,
  });
  return result.exitCode === 0 ? result.stdout.trim() : null;
}

function gitIdentityEnv(tempIndex: string) {
  return {
    GIT_INDEX_FILE: tempIndex,
    GIT_AUTHOR_NAME: "Test",
    GIT_AUTHOR_EMAIL: "test@example.com",
    GIT_COMMITTER_NAME: "Test",
    GIT_COMMITTER_EMAIL: "test@example.com",
  };
}

async function runGitInTest(args: string[], env?: Record<string, string>, options?: { allowFailure?: boolean }) {
  const proc = Bun.spawn(["git", ...args], {
    env: env ? { ...process.env, ...env } : undefined,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0 && !options?.allowFailure) {
    throw new Error(`git ${args.join(" ")} failed: ${stderr || stdout}`);
  }
  return { exitCode: exitCode ?? -1, stdout, stderr };
}

export async function readCardJson(sourceDir: string) {
  return JSON.parse(await readFile(join(sourceDir, "card.json"), "utf8"));
}
