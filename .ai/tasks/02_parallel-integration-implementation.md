# Parallel Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Parallel to the canonical config repo with CLI-backed shared skills as the default local integration and globally opt-in MCP support through the existing sync pipeline.

**Architecture:** Parallel will be represented in two layers. Shared skills will provide the default local coding-agent path through `parallel-cli --json`, while `parallel-search` and `parallel-task` MCP entries will live in the canonical registry behind a single global `parallel.mcp.enabled` switch in `config.json`. The sync script will continue to be the only place that decides what gets written into local tool configs.

**Tech Stack:** Bun, TypeScript, `smol-toml`, local skill directories, JSON registry/config files

---

### Task 1: Extend the canonical config model for Parallel

**Files:**
- Modify: `config.json`
- Modify: `sync-mcp.ts`
- Test: `test/sync-mcp.test.ts`

**Step 1: Write the failing tests**

Add tests that prove:

- `parallel.mcp.enabled = false` excludes Parallel MCP entries
- `parallel.mcp.enabled = true` includes Parallel MCP entries

Example test shape:

```ts
test("excludes Parallel MCP by default", () => {
  const active = buildActiveServers(registryWithParallel, configWithParallelMcp(false));
  expect(Object.keys(active)).not.toContain("parallel-search");
  expect(Object.keys(active)).not.toContain("parallel-task");
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
bun test test/sync-mcp.test.ts
```

Expected:

- FAIL because the current config types and filtering logic do not understand the new `parallel` block

**Step 3: Write minimal implementation**

Update:

- `config.json` to add:

```json
"parallel": {
  "cli": { "enabled": true },
  "mcp": { "enabled": false }
}
```

- `sync-mcp.ts` types so `CanonicalConfig` includes the new Parallel block
- filtering logic so `parallel-search` and `parallel-task` are excluded unless `parallel.mcp.enabled === true`

**Step 4: Run test to verify it passes**

Run:

```bash
bun test test/sync-mcp.test.ts
```

Expected:

- PASS for the new filtering tests

**Step 5: Commit**

Do not commit unless explicitly instructed by the user.

---

### Task 2: Add Parallel MCP entries to the canonical registry

**Files:**
- Modify: `mcp-servers.json`
- Test: `test/sync-mcp.test.ts`

**Step 1: Write the failing test**

Add a registry-backed test that expects `parallel-search` and `parallel-task` to exist as normal syncable entries when MCP is enabled.

Example:

```ts
test("includes Parallel MCP entries when globally enabled", () => {
  const active = buildActiveServers(realisticRegistry, configWithParallelMcp(true));
  expect(active["parallel-search"]).toBeDefined();
  expect(active["parallel-task"]).toBeDefined();
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
bun test test/sync-mcp.test.ts
```

Expected:

- FAIL because `mcp-servers.json` does not yet contain those registry entries

**Step 3: Write minimal implementation**

Add to `mcp-servers.json`:

- `parallel-search` with the hosted Search MCP URL
- `parallel-task` with the hosted Task MCP URL
- descriptions and notes that reflect their intended use

Use the current documented URLs from Parallel docs.

**Step 4: Run test to verify it passes**

Run:

```bash
bun test test/sync-mcp.test.ts
```

Expected:

- PASS for registry inclusion

**Step 5: Commit**

Do not commit unless explicitly instructed by the user.

---

### Task 3: Add shared Parallel skills for CLI-backed local use

**Files:**
- Create: `skills/shared/parallel-web-search/SKILL.md`
- Create: `skills/shared/parallel-web-extract/SKILL.md`
- Create: `skills/shared/parallel-deep-research/SKILL.md`
- Create: `skills/shared/parallel-data-enrichment/SKILL.md`
- Modify: `README.md`

**Step 1: Write the failing test**

Add a skill sync test that expects curated Parallel skills to be propagated to Claude and Codex when present in `~/.agents/skills/`.

Example:

```ts
expect(await realpath(join(homeDir, ".claude", "skills", "parallel-web-search"))).toBe(
  await realpath(join(agentsDir, "skills", "parallel-web-search")),
);
```

**Step 2: Run test to verify it fails**

Run:

```bash
bun test test/sync-mcp.test.ts
```

Expected:

- FAIL because the test fixtures or expectations reference skills not yet modeled

**Step 3: Write minimal implementation**

Create the four skill directories and write `SKILL.md` files that:

- state the purpose clearly
- instruct the agent to use `parallel-cli ... --json`
- include prerequisite checks
- tell the agent how to recover if the CLI is missing or unauthenticated
- keep behavior narrow to the specific skill

Update `README.md` to document:

- CLI install command
- authentication command
- default Parallel behavior via skills

**Step 4: Run test to verify it passes**

Run:

```bash
bun test test/sync-mcp.test.ts
```

Expected:

- PASS for the new skill-sync expectations

**Step 5: Commit**

Do not commit unless explicitly instructed by the user.

---

### Task 4: Curate Parallel shared skills into the aggregation layer

**Files:**
- Modify: `README.md`
- Runtime wiring: `~/.agents/skills/parallel-web-search`
- Runtime wiring: `~/.agents/skills/parallel-web-extract`
- Runtime wiring: `~/.agents/skills/parallel-deep-research`
- Runtime wiring: `~/.agents/skills/parallel-data-enrichment`

**Step 1: Write the failing test**

Use or extend the existing symlink-chain test to require that curated Parallel skill symlinks resolve through `~/.agents/skills/` into downstream tool skill directories.

**Step 2: Run test to verify it fails**

Run:

```bash
bun test test/sync-mcp.test.ts
```

Expected:

- FAIL before the real curated symlinks exist in the machine-level aggregation layer

**Step 3: Write minimal implementation**

Create curated symlinks:

```bash
ln -sfn /Users/pureicis/dev/agents-config-saam/skills/shared/parallel-web-search ~/.agents/skills/parallel-web-search
ln -sfn /Users/pureicis/dev/agents-config-saam/skills/shared/parallel-web-extract ~/.agents/skills/parallel-web-extract
ln -sfn /Users/pureicis/dev/agents-config-saam/skills/shared/parallel-deep-research ~/.agents/skills/parallel-deep-research
ln -sfn /Users/pureicis/dev/agents-config-saam/skills/shared/parallel-data-enrichment ~/.agents/skills/parallel-data-enrichment
```

Then run skill sync through the existing script.

**Step 4: Run test to verify it passes**

Run:

```bash
bun test test/sync-mcp.test.ts
bun run sync-mcp.ts --skills-only --dry-run
bun run sync-mcp.ts --skills-only
```

Expected:

- Tests pass
- dry-run shows the new skill symlinks
- real sync installs them into `~/.claude/skills/` and `~/.codex/skills/`

**Step 5: Commit**

Do not commit unless explicitly instructed by the user.

---

### Task 5: Verify MCP rendering behavior with Parallel disabled and enabled

**Files:**
- Test: `test/sync-mcp.test.ts`
- Modify: `sync-mcp.ts`

**Step 1: Write the failing test**

Add integration-style tests that prove:

- default rendered Claude/Cursor/Codex config excludes Parallel MCP
- toggled rendered config includes `parallel-search` and `parallel-task`

Example:

```ts
const merged = mergeClaudeSettingsText(current, activeWithParallel);
expect(JSON.parse(merged).mcpServers["parallel-search"]).toBeDefined();
```

**Step 2: Run test to verify it fails**

Run:

```bash
bun test test/sync-mcp.test.ts
```

Expected:

- FAIL until the rendering path is exercised with the new registry entries

**Step 3: Write minimal implementation**

Adjust test fixtures and any needed implementation details so the sync path handles the new MCP entries exactly like other `http` MCP servers.

**Step 4: Run test to verify it passes**

Run:

```bash
bun test
```

Expected:

- Full suite PASS

**Step 5: Commit**

Do not commit unless explicitly instructed by the user.

---

### Task 6: Update docs and architecture notes

**Files:**
- Modify: `README.md`
- Modify: `/Users/pureicis/dev/.agents/ARCHITECTURE.md`
- Modify: `docs/plans/2026-04-23-parallel-integration-design.md`

**Step 1: Write the failing test**

Use a manual documentation checklist rather than an automated test:

- README documents CLI-first default
- README documents global MCP opt-in
- architecture doc reflects the distinction accurately

**Step 2: Run the check to verify it fails**

Run:

```bash
rg -n "Parallel" README.md /Users/pureicis/dev/.agents/ARCHITECTURE.md docs/plans/2026-04-23-parallel-integration-design.md
```

Expected:

- Missing or incomplete references before doc updates

**Step 3: Write minimal implementation**

Update docs to explain:

- default CLI+skill workflow
- optional MCP overlay
- setup commands
- no automatic CLI install by sync

**Step 4: Run the check to verify it passes**

Run:

```bash
rg -n "Parallel|parallel-cli|parallel.mcp.enabled" README.md /Users/pureicis/dev/.agents/ARCHITECTURE.md docs/plans/2026-04-23-parallel-integration-design.md
```

Expected:

- Relevant documentation lines present in all intended docs

**Step 5: Commit**

Do not commit unless explicitly instructed by the user.

---

### Task 7: Run real-machine verification

**Files:**
- Runtime verification only

**Step 1: Write the failing test**

Use a concrete verification checklist:

- `parallel-cli` installed or clearly absent
- skills synced into `~/.claude/skills/` and `~/.codex/skills/`
- default local MCP excludes Parallel
- opt-in config would include Parallel

**Step 2: Run verification to establish baseline**

Run:

```bash
command -v parallel-cli || true
find ~/.agents/skills -maxdepth 1 -mindepth 1 | sort
jq '.mcpServers | keys' ~/.claude/settings.json
bun -e "import { parse } from 'smol-toml'; import { readFileSync } from 'node:fs'; console.log(JSON.stringify(parse(readFileSync(process.env.HOME + '/.codex/config.toml', 'utf8')).mcp_servers, null, 2));"
```

Expected:

- Baseline state captured clearly

**Step 3: Perform the real sync verification**

Run:

```bash
bun run sync-mcp.ts --dry-run
bun run sync-mcp.ts
```

Then verify with:

```bash
jq '.mcpServers | keys' ~/.claude/settings.json
readlink ~/.cursor/mcp.json
find ~/.claude/skills -maxdepth 1 -type l | sort
find ~/.codex/skills -maxdepth 1 -type l | sort
```

**Step 4: Verify it passes**

Expected:

- Default sync excludes Parallel MCP unless explicitly enabled
- Parallel skills are present downstream
- Dry-run is idempotent after sync

**Step 5: Commit**

Do not commit unless explicitly instructed by the user.
