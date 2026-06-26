// ABOUTME: Builds deterministic dm-card-base card remotes for catalog collaboration tests.
// ABOUTME: Mirrors the public remyjkim/dm-card-base card shape without depending on GitHub.

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as git from "../../cli/core/git";

export const DM_CARD_BASE_REMOTE = "https://github.com/remyjkim/dm-card-base.git";
export const DM_CARD_BASE_NAME = "@remyjkim/dm-card-base";
export const DM_CARD_BASE_VERSION = "0.1.0";
export const DM_CARD_BASE_SKILLS = [
  "bootstrap-project",
  "apply-mind-card",
  "author-mind-card",
  "install-harness-project",
  "inspect-harness",
  "materialize-harness",
  "manage-harness-library",
  "repair-harness",
  "manage-defaults",
  "recommend-harness",
  "share-mind-card",
  "support-harness",
];

export interface DmCardBaseRemote {
  tempDir: string;
  sourceDir: string;
  bareRepoPath: string;
  url: string;
}

export interface DmCardBaseCatalogRemote {
  tempDir: string;
  sourceDir: string;
  bareRepoPath: string;
  url: string;
}

export async function createDmCardBaseRemote(version = DM_CARD_BASE_VERSION): Promise<DmCardBaseRemote> {
  const tempDir = await mkdtemp(join(tmpdir(), "drwn-dm-card-base-"));
  const sourceDir = join(tempDir, "source");
  const bareRepoPath = join(tempDir, "dm-card-base.git");
  await git.initBare(bareRepoPath);
  await writeDmCardBaseSource(sourceDir, version);
  await commitDmCardBaseVersion({ sourceDir, bareRepoPath, version });
  await git.runGit(["--git-dir", bareRepoPath, "symbolic-ref", "HEAD", "refs/heads/main"]);
  return {
    tempDir,
    sourceDir,
    bareRepoPath,
    url: `file://${bareRepoPath}`,
  };
}

export async function createDmCardBaseCatalogRemote(scope = "@remyjkim"): Promise<DmCardBaseCatalogRemote> {
  const tempDir = await mkdtemp(join(tmpdir(), "drwn-dm-catalog-"));
  const sourceDir = join(tempDir, "source");
  const bareRepoPath = join(tempDir, "catalog.git");
  await mkdir(sourceDir, { recursive: true });
  await writeFile(
    join(sourceDir, "catalog.json"),
    `${JSON.stringify(
      {
        catalogVersion: 1,
        scope,
        description: "dm-card-base team catalog",
        cards: [],
      },
      null,
      2,
    )}\n`,
  );
  await git.initBare(bareRepoPath);
  const tree = await git.writeTreeFromDir(bareRepoPath, sourceDir);
  const commit = await git.commitTree(bareRepoPath, tree, null, "Initial catalog");
  await git.updateRef(bareRepoPath, "refs/heads/main", commit);
  await git.runGit(["--git-dir", bareRepoPath, "symbolic-ref", "HEAD", "refs/heads/main"]);
  return {
    tempDir,
    sourceDir,
    bareRepoPath,
    url: `file://${bareRepoPath}`,
  };
}

export async function tagDmCardBaseVersion(remote: DmCardBaseRemote, version: string): Promise<string> {
  await writeDmCardBaseSource(remote.sourceDir, version);
  return await commitDmCardBaseVersion({
    sourceDir: remote.sourceDir,
    bareRepoPath: remote.bareRepoPath,
    version,
  });
}

async function writeDmCardBaseSource(sourceDir: string, version: string) {
  await rm(sourceDir, { recursive: true, force: true });
  await mkdir(sourceDir, { recursive: true });
  await writeFile(
    join(sourceDir, "card.json"),
    `${JSON.stringify(
      {
        name: DM_CARD_BASE_NAME,
        version,
        description: "Personal base card bundling the 12 current-lane Darwinian Mind skills.",
        skills: { include: DM_CARD_BASE_SKILLS },
        license: "Apache-2.0",
        harness: { minVersion: "0.1.0" },
        stability: "experimental",
        lastValidatedWith: "0.1.0",
      },
      null,
      2,
    )}\n`,
  );

  for (const skill of DM_CARD_BASE_SKILLS) {
    const skillDir = join(sourceDir, "skills", skill);
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      `---\nname: ${skill}\ndescription: ${skill}\n---\n\n# ${skill}\n\nDeterministic dm-card-base fixture skill.\n`,
    );
  }
}

async function commitDmCardBaseVersion(options: {
  sourceDir: string;
  bareRepoPath: string;
  version: string;
}) {
  const tree = await git.writeTreeFromDir(options.bareRepoPath, options.sourceDir);
  const parent = await currentMain(options.bareRepoPath);
  const commit = await git.commitTree(
    options.bareRepoPath,
    tree,
    parent,
    `Publish ${DM_CARD_BASE_NAME}@${options.version}`,
  );
  await git.updateRef(options.bareRepoPath, "refs/heads/main", commit);
  await git.createAnnotatedTag(
    options.bareRepoPath,
    `v${options.version}`,
    commit,
    `Publish ${DM_CARD_BASE_NAME}@${options.version}`,
  );
  return commit;
}

async function currentMain(bareRepoPath: string): Promise<string | null> {
  try {
    return await git.revParse(bareRepoPath, "refs/heads/main");
  } catch {
    return null;
  }
}
