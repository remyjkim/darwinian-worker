// ABOUTME: Exercises dm-card-base catalog collaboration through real Bash CLI workflows.
// ABOUTME: Covers producer publish, consumer follow/search/install, refresh, outdated, and update.

import { afterEach, expect, test as baseTest } from "bun:test";
import { fileURLToPath } from "node:url";
const test = baseTest.skipIf(process.platform === "win32");
import { cleanupTempRoots, envFor, scaffoldCliFixture } from "./helpers";
import {
  createDmCardBaseCatalogRemote,
  createDmCardBaseRemote,
  DM_CARD_BASE_NAME,
  tagDmCardBaseVersion,
} from "./fixtures/dm-card-base-fixture";

const tempRoots: string[] = [];

afterEach(async () => {
  await cleanupTempRoots(tempRoots);
});

test("bash workflow covers team catalog follow, install bootstrap, refresh, and range update", async () => {
  const producer = await scaffoldCliFixture();
  const consumer = await scaffoldCliFixture();
  const freshConsumer = await scaffoldCliFixture();
  const cardRemote = await createDmCardBaseRemote();
  const catalog = await createDmCardBaseCatalogRemote("@remyjkim");
  tempRoots.push(producer.root, consumer.root, freshConsumer.root, cardRemote.tempDir, catalog.tempDir);

  await runBash(
    `
set -euo pipefail

drwn_producer() {
  AGENTS_REPO_ROOT="$PRODUCER_REPO_ROOT" AGENTS_HOME_DIR="$PRODUCER_HOME_DIR" AGENTS_DIR="$PRODUCER_AGENTS_DIR" "$BUN_BIN" run "$DRWN_ENTRYPOINT" "$@"
}
drwn_consumer() {
  AGENTS_REPO_ROOT="$CONSUMER_REPO_ROOT" AGENTS_HOME_DIR="$CONSUMER_HOME_DIR" AGENTS_DIR="$CONSUMER_AGENTS_DIR" "$BUN_BIN" run "$DRWN_ENTRYPOINT" "$@"
}
drwn_fresh() {
  AGENTS_REPO_ROOT="$FRESH_REPO_ROOT" AGENTS_HOME_DIR="$FRESH_HOME_DIR" AGENTS_DIR="$FRESH_AGENTS_DIR" "$BUN_BIN" run "$DRWN_ENTRYPOINT" "$@"
}
assert_lock_version() {
  node - "$1" "$2" <<'NODE'
const fs = require('fs');
const path = require('path');
const projectDir = process.argv[2];
const expected = process.argv[3];
const lock = JSON.parse(fs.readFileSync(path.join(projectDir, '.agents/drwn/card.lock'), 'utf8'));
if (lock.cards.length !== 1 || lock.cards[0].name !== process.env.DM_CARD_BASE_NAME || lock.cards[0].version !== expected) {
  throw new Error('unexpected lock: ' + JSON.stringify(lock));
}
NODE
}
assert_skill() {
  test -e "$1/.claude/skills/$2/SKILL.md"
}
force_missing_locked_path() {
  node - "$1" <<'NODE'
const fs = require('fs');
const path = require('path');
const projectDir = process.argv[2];
const lockPath = path.join(projectDir, '.agents/drwn/card.lock');
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
fs.rmSync(lock.cards[0].path, { recursive: true, force: true });
NODE
}

PINNED_PROJECT="$CONSUMER_ROOT/bash-pinned-project"
RANGE_PROJECT="$CONSUMER_ROOT/bash-range-project"
mkdir -p "$PINNED_PROJECT" "$RANGE_PROJECT"

drwn_producer card catalog publish "git+$CARD_REMOTE_URL#v0.1.0" --catalog "$CATALOG_URL" --mode direct --name dm-card-base --tag bash --tag team --json > "$PUBLISH_INITIAL_JSON"
node - "$PUBLISH_INITIAL_JSON" <<'NODE'
const fs = require('fs');
const payload = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (!payload.ok || payload.entry.url !== 'git+' + process.env.CARD_REMOTE_URL + '#v0.1.0') {
  throw new Error('unexpected initial publish: ' + JSON.stringify(payload));
}
NODE

drwn_consumer library catalog add "$CATALOG_URL"
drwn_consumer search card dm-card-base --scope @remyjkim --json > "$SEARCH_INITIAL_JSON"
node - "$SEARCH_INITIAL_JSON" <<'NODE'
const fs = require('fs');
const payload = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (payload.results.length !== 1 || payload.results[0].url !== 'git+' + process.env.CARD_REMOTE_URL + '#v0.1.0') {
  throw new Error('unexpected initial search: ' + JSON.stringify(payload));
}
NODE

(cd "$PINNED_PROJECT" && drwn_consumer init --non-interactive --no-default-catalogs && drwn_consumer card apply "git+$CARD_REMOTE_URL#v0.1.0" --write && drwn_consumer worker stack use "$DM_CARD_BASE_NAME" && drwn_consumer write)
assert_lock_version "$PINNED_PROJECT" 0.1.0
assert_skill "$PINNED_PROJECT" bootstrap-project

rm -rf "$PINNED_PROJECT/.claude" "$PINNED_PROJECT/.codex" "$PINNED_PROJECT/.cursor"
force_missing_locked_path "$PINNED_PROJECT"
drwn_fresh library catalog list --json > "$FRESH_CATALOGS_JSON"
node - "$FRESH_CATALOGS_JSON" <<'NODE'
const fs = require('fs');
const payload = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (payload.catalogs.length !== 0) {
  throw new Error('fresh consumer unexpectedly has catalogs: ' + JSON.stringify(payload));
}
NODE
(cd "$PINNED_PROJECT" && drwn_fresh install --no-apply --json > "$FRESH_NO_APPLY_JSON")
test ! -e "$PINNED_PROJECT/.claude/skills/bootstrap-project/SKILL.md"
(cd "$PINNED_PROJECT" && drwn_fresh install --json > "$FRESH_INSTALL_JSON")
assert_lock_version "$PINNED_PROJECT" 0.1.0
assert_skill "$PINNED_PROJECT" bootstrap-project

(cd "$RANGE_PROJECT" && drwn_consumer init --non-interactive --no-default-catalogs && drwn_consumer card apply "git+$CARD_REMOTE_URL@^0.1.0" --write && drwn_consumer worker stack use "$DM_CARD_BASE_NAME" && drwn_consumer write)
assert_lock_version "$RANGE_PROJECT" 0.1.0
`,
    {
      ...prefixedFixtureEnv("PRODUCER", producer),
      ...prefixedFixtureEnv("CONSUMER", consumer),
      ...prefixedFixtureEnv("FRESH", freshConsumer),
      CONSUMER_ROOT: consumer.root,
      CARD_REMOTE_URL: cardRemote.url,
      CATALOG_URL: catalog.url,
      DM_CARD_BASE_NAME,
      PUBLISH_INITIAL_JSON: `${consumer.root}/publish-initial.json`,
      SEARCH_INITIAL_JSON: `${consumer.root}/search-initial.json`,
      FRESH_CATALOGS_JSON: `${consumer.root}/fresh-catalogs.json`,
      FRESH_NO_APPLY_JSON: `${consumer.root}/fresh-no-apply.json`,
      FRESH_INSTALL_JSON: `${consumer.root}/fresh-install.json`,
    },
  );

  await tagDmCardBaseVersion(cardRemote, "0.1.1");

  await runBash(
    `
set -euo pipefail

drwn_producer() {
  AGENTS_REPO_ROOT="$PRODUCER_REPO_ROOT" AGENTS_HOME_DIR="$PRODUCER_HOME_DIR" AGENTS_DIR="$PRODUCER_AGENTS_DIR" "$BUN_BIN" run "$DRWN_ENTRYPOINT" "$@"
}
drwn_consumer() {
  AGENTS_REPO_ROOT="$CONSUMER_REPO_ROOT" AGENTS_HOME_DIR="$CONSUMER_HOME_DIR" AGENTS_DIR="$CONSUMER_AGENTS_DIR" "$BUN_BIN" run "$DRWN_ENTRYPOINT" "$@"
}
drwn_fresh() {
  AGENTS_REPO_ROOT="$FRESH_REPO_ROOT" AGENTS_HOME_DIR="$FRESH_HOME_DIR" AGENTS_DIR="$FRESH_AGENTS_DIR" "$BUN_BIN" run "$DRWN_ENTRYPOINT" "$@"
}
assert_lock_version() {
  node - "$1" "$2" <<'NODE'
const fs = require('fs');
const path = require('path');
const projectDir = process.argv[2];
const expected = process.argv[3];
const lock = JSON.parse(fs.readFileSync(path.join(projectDir, '.agents/drwn/card.lock'), 'utf8'));
if (lock.cards.length !== 1 || lock.cards[0].name !== process.env.DM_CARD_BASE_NAME || lock.cards[0].version !== expected) {
  throw new Error('unexpected lock: ' + JSON.stringify(lock));
}
NODE
}
assert_skill() {
  test -e "$1/.claude/skills/$2/SKILL.md"
}

PINNED_PROJECT="$CONSUMER_ROOT/bash-pinned-project"
RANGE_PROJECT="$CONSUMER_ROOT/bash-range-project"

drwn_producer card catalog publish "git+$CARD_REMOTE_URL#v0.1.1" --catalog "$CATALOG_URL" --mode direct --name dm-card-base --replace --json > "$PUBLISH_UPDATE_JSON"

drwn_consumer search card dm-card-base --scope @remyjkim --json > "$SEARCH_STALE_JSON"
node - "$SEARCH_STALE_JSON" <<'NODE'
const fs = require('fs');
const payload = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (payload.results.length !== 1 || payload.results[0].url !== 'git+' + process.env.CARD_REMOTE_URL + '#v0.1.0') {
  throw new Error('catalog cache was not stale before refresh: ' + JSON.stringify(payload));
}
NODE

drwn_consumer library catalog refresh @remyjkim
drwn_consumer search card dm-card-base --scope @remyjkim --json > "$SEARCH_REFRESHED_JSON"
node - "$SEARCH_REFRESHED_JSON" <<'NODE'
const fs = require('fs');
const payload = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (payload.results.length !== 1 || payload.results[0].url !== 'git+' + process.env.CARD_REMOTE_URL + '#v0.1.1') {
  throw new Error('catalog cache did not refresh: ' + JSON.stringify(payload));
}
NODE

(cd "$RANGE_PROJECT" && drwn_consumer card outdated --fetch --json > "$OUTDATED_JSON")
node - "$OUTDATED_JSON" <<'NODE'
const fs = require('fs');
const payload = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const expected = [{ name: process.env.DM_CARD_BASE_NAME, current: '0.1.0', latest: '0.1.1' }];
if (JSON.stringify(payload.outdated) !== JSON.stringify(expected)) {
  throw new Error('unexpected outdated payload: ' + JSON.stringify(payload));
}
NODE
(cd "$RANGE_PROJECT" && ! drwn_consumer card outdated --fetch --check >/dev/null)
(cd "$RANGE_PROJECT" && drwn_consumer card update --write)
assert_lock_version "$RANGE_PROJECT" 0.1.1
assert_skill "$RANGE_PROJECT" support-harness
(cd "$RANGE_PROJECT" && drwn_consumer card outdated --fetch --check >/dev/null)

(cd "$PINNED_PROJECT" && drwn_fresh card update --write)
assert_lock_version "$PINNED_PROJECT" 0.1.0
assert_skill "$PINNED_PROJECT" bootstrap-project
`,
    {
      ...prefixedFixtureEnv("PRODUCER", producer),
      ...prefixedFixtureEnv("CONSUMER", consumer),
      ...prefixedFixtureEnv("FRESH", freshConsumer),
      CONSUMER_ROOT: consumer.root,
      CARD_REMOTE_URL: cardRemote.url,
      CATALOG_URL: catalog.url,
      DM_CARD_BASE_NAME,
      PUBLISH_UPDATE_JSON: `${consumer.root}/publish-update.json`,
      SEARCH_STALE_JSON: `${consumer.root}/search-stale.json`,
      SEARCH_REFRESHED_JSON: `${consumer.root}/search-refreshed.json`,
      OUTDATED_JSON: `${consumer.root}/outdated.json`,
    },
  );
}, 15000);

function prefixedFixtureEnv(prefix: string, fixture: Awaited<ReturnType<typeof scaffoldCliFixture>>) {
  const env = envFor(fixture);
  return {
    [`${prefix}_REPO_ROOT`]: env.AGENTS_REPO_ROOT,
    [`${prefix}_HOME_DIR`]: env.AGENTS_HOME_DIR,
    [`${prefix}_AGENTS_DIR`]: env.AGENTS_DIR,
  };
}

async function runBash(script: string, env: Record<string, string>) {
  const proc = Bun.spawn(["bash", "-lc", script], {
      stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      ...env,
      BUN_BIN: (Bun.which("bun") ?? process.execPath),
      DRWN_ENTRYPOINT: fileURLToPath(new URL("../cli/index.ts", import.meta.url)),
    },
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`bash workflow failed\nstdout:\n${stdout}\nstderr:\n${stderr}`);
  }
  expect(stdout).toBeDefined();
  return { stdout, stderr, exitCode: exitCode ?? -1 };
}
