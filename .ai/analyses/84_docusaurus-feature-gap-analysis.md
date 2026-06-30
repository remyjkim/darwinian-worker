<!-- ABOUTME: Comprehensive gap analysis comparing the Docusaurus docs surface against the drwn CLI. -->
<!-- ABOUTME: Identifies every missing reference page, concept doc, guide, schema field, and flag. -->

# Docusaurus Feature Gap Analysis

**Date:** 2026-06-29
**Scope:** All Docusaurus pages under `docs-docusaurus/docs/` vs. the live `drwn` CLI at `darwinian-minds@0.5.0`
**Method:** 10-agent, 3-phase workflow reading every CLI command file and cross-referencing against every documentation page.

---

## Summary

| Category | Gaps Found | Severity |
|---|---|---|
| A — Missing CLI namespaces | 3 | HIGH |
| B — Partially documented commands | 10 | HIGH / MEDIUM |
| C — Missing concept pages | 6 | HIGH |
| D — Missing or incomplete schema docs | 5 | HIGH / MEDIUM |
| E — Missing guides | 6 | HIGH / MEDIUM |
| F — Platform / Windows support | 4 | HIGH |
| **Total** | **34** | |

**New reference pages required:** 12
**Existing pages requiring updates:** 8

---

## Category A: Missing CLI Namespaces

These namespaces exist in the CLI and are user-facing but have zero documentation in Docusaurus.

### A1 — `drwn mind` namespace (HIGH)

Three subcommands, all undocumented:

- `drwn mind list` — prints the active mind stack (names + order)
- `drwn mind use <name>` — pushes a mind card onto the active stack for the current project
- `drwn mind clear` — removes all minds from the active stack

`activeMinds` was added to `project-config-json.md` in the previous audit, but there is no concept explanation and no reference page for the `mind` command itself. Users have no path to discover how to activate a mind card after installing it.

**Files to read:** `cli/commands/mind/list.ts`, `mind/use.ts`, `mind/clear.ts`

**Docs gap:** No `reference/cli/mind.md`; no `concepts/minds.md`.

---

### A2 — `drwn catalog validate` (HIGH)

`drwn catalog validate <ref>` validates a catalog manifest against the schema before publishing. No `reference/cli/catalog.md` exists. The command appears in no guide or troubleshooting page.

**Files to read:** `cli/commands/catalog/validate.ts`

---

### A3 — `drwn install` (HIGH)

`drwn install` hydrates cards from `card.lock` into the store. It is the primary CI bootstrapping command. It appears once, in passing, in `guides/doctor-in-ci.md` with only an inline comment, but has no dedicated reference page explaining flags (`--frozen`, `--no-apply`, `--json`), exit-code semantics, or the distinction between `drwn install` (resolves + applies) and `drwn write` (applies only).

**Files to read:** `cli/commands/install.ts`

**Docs gap:** No `reference/cli/install.md`.

---

## Category B: Partially Documented Commands

These commands have existing pages but are missing flags, subcommands, or corrections.

### B1 — `drwn card source` subcommands (HIGH)

`card.md` documents `add-skill` and `add-mcp` only. Missing entirely:

| Subcommand | Purpose |
|---|---|
| `add-belief` | Adds a `BELIEF.md` to the card source |
| `add-persona` | Adds a `PERSONA.md` to the card source |
| `add-memory` | Adds a memory layer file (`l4`/`l5`/`l6`, `md`/`jsonl`/`mixed` format) |
| `add-hook` | Adds a `policy.ts` hook policy to the card source |
| `remove-skill` | Removes a skill from the card source |
| `remove-mcp` | Removes an MCP server from the card source |
| `remove-belief` | Removes the belief file |
| `remove-persona` | Removes the persona file |
| `remove-memory` | Removes a memory layer |
| `remove-hook` | Removes the hook policy |

These are the primary content-authoring commands for mind cards. Without this documentation, the mind card authoring workflow is unreachable.

---

### B2 — `drwn card remote` subcommands (HIGH)

No `card remote` coverage in `card.md`. Missing:

- `drwn card remote set <name> <url>` — registers a remote Git source for a card
- `drwn card remote remove <name>` — removes a remote registration
- `drwn card remote list` — lists registered remotes

---

### B3 — `drwn card clone` and `drwn card fetch` (HIGH)

Both commands are undocumented. `drwn card clone <ref>` creates a local card source from an existing registry card. `drwn card fetch <name>` pulls updates from the remote for a locally cloned card.

---

### B4 — `drwn card push` visibility flags (MEDIUM)

`card.md` documents `drwn card push` but omits:

- `--remote-visibility <public|private>` — sets the catalog visibility on push
- `--unsafe-push-public` — required confirmation gate when pushing to a public-visibility remote

These flags are the publication safety surface. Omitting them leaves the door open for accidental public publishing.

---

### B5 — `drwn write` scope and enforcement flags (HIGH)

`write.md` documents `--dry-run` and `--json` but omits:

- `--root` — writes to the machine root scope (global `~/.agents/drwn/`) rather than the project scope
- `--user` — alias for `--root`
- `--strict-hooks` — fails if any hook policy file cannot be materialized
- `--strict` — treats all warnings as errors

The `--root`/`--user` distinction is architecturally important: it controls whether write-record ownership lives at project or machine scope. The `--strict-hooks` flag is security-relevant.

---

### B6 — `drwn card add` missing `--allow-untrusted-source` flag (MEDIUM)

`card.md` documents `drwn card add <ref>` but not the `--allow-untrusted-source` flag, which is required to install a card from a source that does not satisfy the current `TrustedSourcesPolicy`. Without documentation of this flag and when to use it, users get an opaque error with no resolution path.

---

### B7 — `drwn card source set` missing flags (LOW)

`drwn card source set` is documented but missing:

- `--harness-min-version <semver>` — declares the minimum `darwinian-minds` version required
- `--license <spdx>` — sets the SPDX license identifier in the card manifest

---

### B8 — `drwn card add-skill` / `drwn card add-mcp` missing `--replace` flag (LOW)

The `--replace` flag allows overwriting an existing skill or MCP server entry in the card source without an error. Currently undocumented.

---

### B9 — `drwn catalog publish` missing flags (MEDIUM)

`catalog.md` (when it exists) will need to cover: `--visibility`, `--tag`, `--dry-run`. Currently there is no catalog reference page at all.

---

### B10 — `drwn card untrust` example missing `--hooks` (MEDIUM)

The existing `card.md` Hook Consent section shows:

```bash
drwn card untrust @your-handle/backend
```

This is incorrect — `drwn card untrust` requires `--hooks` to specify what trust to revoke. The command exits with an error without it. The correct form is:

```bash
drwn card untrust @your-handle/backend --hooks
```

**This is a bug in the existing docs, not just a gap — it actively misleads users.**

---

## Category C: Missing Concept Pages

### C1 — Minds and the active mind stack (HIGH)

No concept page explains:

- What a mind card is and how it differs from a harness card
- The active mind stack: ordered composition, how `activeMinds` in `config.json` controls it
- How beliefs, personas, and memories compose into the final Claude system prompt
- Why `drwn mind use` order matters
- The relationship between mind cards and hook policies

**Docs gap:** No `concepts/minds.md`.

---

### C2 — Hook policies and the `ToolPolicy` interface (HIGH)

No documentation explains the hook policy system beyond the `drwn card trust` consent flow added in the previous audit. Missing:

- The `ToolPolicy` TypeScript interface (`policyKind`, `matcher`, `timeoutMs`, `beforeToolCall`, `afterToolCall`)
- Decision values: `allow`, `deny`, `ask`, `log-only`
- `enforcement` vs. `observer` policy kinds
- How hook signals (`UserPromptSubmit`, `PreToolUse`, `PostToolUse`, etc.) map to policy callbacks
- The `drwn hook card-usage` and `drwn hook skill-marker` internal hooks (these are invoked by Claude as infrastructure; operators need to understand the signal chain to author policy)
- How to wire `policy.ts` into a card source via `drwn card source add-hook`

**Docs gap:** No `concepts/hook-policies.md`.

---

### C3 — Beliefs, personas, and memory layers (HIGH)

Mind cards contribute three content categories that are entirely undocumented as concepts:

| Type | File | Description |
|---|---|---|
| Beliefs | `BELIEF.md` | Domain truths authored into the system prompt |
| Persona | `PERSONA.md` | Behavioral and stylistic identity layer |
| Memory (L4) | `l4/` | Short-term project memory (markdown) |
| Memory (L5) | `l5/` | Mid-term accumulated knowledge (jsonl or mixed) |
| Memory (L6) | `l6/` | Long-term durable facts (structured) |

Without this page, the `drwn card source add-belief` / `add-memory` commands are meaningless to users.

**Docs gap:** No `concepts/beliefs-memories-personas.md`.

---

### C4 — Trusted sources policy (MEDIUM)

`trustedSources` was added to `project-config-json.md` in the previous audit but there is no concept page explaining the policy model:

- `TrustedSourcesPolicy` structure: `strict`, `gitHosts`, `gitOwners`, `catalogScopes`, `refs`
- `DRWN_TRUSTED_SOURCES_STRICT` env var and what it does
- How `--allow-untrusted-source` interacts with policy
- Recommended team configuration

**Docs gap:** No `concepts/trusted-sources.md`.

---

### C5 — Secret store and credential encryption (MEDIUM)

The `store.md` reference page exists but says nothing about the encryption model:

- AES-256-GCM encryption
- Platform key storage backends: macOS Keychain, Linux `secret-tool`, Windows DPAPI
- `DRWN_STORE_SEED_PATH` for supply-chain-safe credential seeding
- `DRWN_TEST_KEYCHAIN_DIR` for isolated testing

Users encountering `drwn store verify` failures have no documentation about how credentials are encrypted or how to recover.

---

### C6 — Machine-scope write mode (MEDIUM)

`drwn write --root` / `drwn write --user` applies changes at machine scope rather than project scope. This is architecturally distinct from per-project write runs. No documentation explains:

- When to use machine-scope vs. project-scope
- How the write record is stored at machine scope
- How project config overlays onto machine defaults when both exist

---

## Category D: Missing or Incomplete Schema Documentation

### D1 — `card-manifest.md` missing v4 lockfile fields (HIGH)

The card manifest reference documents the v2 lockfile structure. The v4 additions (`persona`, `beliefs`, `memory`, `hooks`) are undocumented. These are the content contracts that mind card consumers depend on.

Fields to add:

| Field | Lockfile version | Type | Purpose |
|---|---|---|---|
| `persona` | v4+ | `string` (path) | PERSONA.md relative path |
| `beliefs` | v4+ | `string` (path) | BELIEF.md relative path |
| `memory` | v4+ | `object` | Memory layer config (l4/l5/l6 paths and formats) |
| `hooks` | v3+ | `string` (path) | policy.ts relative path |

---

### D2 — `card-spec.md` v4 lockfile fields incomplete (MEDIUM)

`card-spec.md` was updated to show v3/v4 lockfile version gates but does not enumerate the actual field additions beyond `hooks`. The v4 fields (`persona`, `beliefs`, `memory`) need to appear in the CardLockEntry table.

---

### D3 — `machine-json.md` missing `communityCatalogUrl` (LOW)

`machine.json` supports a `communityCatalogUrl` field that overrides the default community catalog endpoint. It is absent from the fields table.

---

### D4 — Environment variables reference page (HIGH)

No `reference/env-vars.md` page exists. Seven environment variables are referenced in code with no documentation surface:

| Variable | Effect |
|---|---|
| `AGENTS_HOME_DIR` | Overrides the default store root (`~/.agents`) |
| `DRWN_TRUSTED_SOURCES_STRICT` | Activates strict trust policy regardless of project config |
| `DRWN_FETCH_CONCURRENCY` | Max parallel card fetch operations |
| `DRWN_GIT_TIMEOUT_MS` | Timeout for Git clone/fetch operations |
| `DRWN_STORE_SEED_PATH` | Path to a pre-seeded credential archive for CI |
| `DRWN_VERSION` | Locks the CLI to report a specific version (testing) |
| `DRWN_TEST_KEYCHAIN_DIR` | Redirects keychain reads to a test directory |
| `DRWN_STORE_READONLY` | Prevents any store mutation (documented in doctor-in-ci guide but not on a reference page) |

---

### D5 — `stale-symlinks.md` terminology not updated (LOW)

`troubleshooting/stale-symlinks.md` still refers to "stale symlinks" throughout and uses `staleSkillSymlinks` as the doctor field name. This was carried over from the previous symlink era; if the doctor report field has been renamed, this page is incorrect.

**Action required:** Verify current field name in `cli/core/doctor.ts` and update if needed.

---

## Category E: Missing Guides

### E1 — Authoring mind cards with beliefs, personas, and memory (HIGH)

No guide walks users through creating a mind card with content layers. This is the primary mind card authoring workflow:

1. `drwn card source init <name>`
2. `drwn card source add-belief`, `add-persona`, `add-memory --layer l4 --format md`
3. `drwn card push`
4. `drwn mind use <name>` in a project

**Docs gap:** No `guides/authoring-mind-cards.md`.

---

### E2 — Writing and deploying hook policies (HIGH)

No guide walks users through creating a `policy.ts` and deploying it via a card:

1. Scaffold a `policy.ts` with a `ToolPolicy` export
2. `drwn card source add-hook --from ./policy.ts`
3. How to test the policy locally
4. How trust/consent interacts with policy enforcement at runtime

**Docs gap:** No `guides/authoring-hook-policies.md`.

---

### E3 — Managing the active mind stack (HIGH)

No guide explains the day-to-day workflow with minds:

- `drwn mind use <name>` to activate
- `drwn mind list` to inspect
- `drwn mind clear` to reset
- How `activeMinds` in `config.json` persists the stack
- Team-shared mind configurations

**Docs gap:** No `guides/managing-minds.md`.

---

### E4 — Using `drwn install` (HIGH)

`drwn install` is the first command run in every CI and onboarding flow, but there is no reference page or guide explaining:

- Difference between `drwn install` and `drwn write`
- The `--frozen` flag and when it is required
- The `--no-apply` flag (resolves lock without materializing)
- The `--json` output schema
- Error codes and resolution paths

The single mention in `doctor-in-ci.md` is insufficient.

**Docs gap:** No `reference/cli/install.md`.

---

### E5 — Publishing a card via Git remote (MEDIUM)

No end-to-end guide covers the publishing workflow for self-hosted card authors:

- `drwn card source init` → `drwn card source set --license MIT` → `drwn card remote set` → `drwn card push`

The existing `guides/publish-card.md` (if it exists) covers the catalog flow, not the Git remote flow.

---

### E6 — Configuring `TrustedSourcesPolicy` for a team (MEDIUM)

No guide explains how a team should configure `trustedSources` in `config.json` to enforce a trust boundary across all developers:

- Use `gitOwners` to allow only your org's cards
- Use `catalogScopes` to restrict to a private catalog
- Use `DRWN_TRUSTED_SOURCES_STRICT` as a CI enforcement mechanism

---

## Category F: Platform and Windows Support Gaps

### F1 — Windows not mentioned anywhere in Docusaurus (HIGH)

The Docusaurus site contains zero mentions of Windows. The codebase already has:

- DPAPI credential backend (`cli/core/store/dpapi-backend.ts` or equivalent)
- `win32` branches in `cli/core/process.ts` and `cli/core/managed-file.ts`
- `platformChecks` field in `DoctorReport` (populated with platform-specific issues)

The Analysis 81 document (`81_drwn-cli-windows-portability-investigation.md`) identified 4 remaining blockers before Windows can be fully supported, but the docs should at minimum:

1. Acknowledge that Windows is not yet officially supported
2. Recommend WSL2 as the current path (per INSTALL.md)
3. Note that Windows DPAPI support is in development

**Docs gap:** No mention in any Docusaurus page; INSTALL.md at repo root covers this but it is not linked.

---

### F2 — WSL2 recommendation absent from docs site (HIGH)

INSTALL.md (repo root, not Docusaurus) contains the WSL2 guidance for Windows users. The `getting-started/installation.md` Docusaurus page has no equivalent. Windows users landing on the docs site via search have no guidance.

---

### F3 — `platformChecks` field not explained in doctor docs (MEDIUM)

The `troubleshooting/reading-doctor.md` page was updated to include `platformChecks` in the JSON example but provides no explanation of what it contains, what values mean, or how to resolve platform issues it surfaces.

---

### F4 — Credential backend selection not documented (MEDIUM)

The secret store uses different backends per OS (Keychain on macOS, `secret-tool` on Linux, DPAPI on Windows). No documentation explains:

- How the backend is selected
- What to do when the backend is unavailable
- How to verify backend health (`drwn store verify` output interpretation)

---

## New Pages Required

The following Docusaurus pages need to be created (none exist today):

| File | Category | Priority |
|---|---|---|
| `reference/cli/mind.md` | Reference | HIGH |
| `reference/cli/install.md` | Reference | HIGH |
| `reference/cli/catalog.md` | Reference | HIGH |
| `reference/env-vars.md` | Reference | HIGH |
| `concepts/minds.md` | Concept | HIGH |
| `concepts/hook-policies.md` | Concept | HIGH |
| `concepts/beliefs-memories-personas.md` | Concept | HIGH |
| `concepts/trusted-sources.md` | Concept | MEDIUM |
| `guides/authoring-mind-cards.md` | Guide | HIGH |
| `guides/authoring-hook-policies.md` | Guide | HIGH |
| `guides/managing-minds.md` | Guide | HIGH |
| `troubleshooting/credential-errors.md` | Troubleshooting | MEDIUM |

---

## Existing Pages Requiring Updates

| File | Issues | Priority |
|---|---|---|
| `reference/cli/card.md` | B1–B4, B6–B10 | HIGH |
| `reference/cli/write.md` | B5 | HIGH |
| `reference/schemas/card-manifest.md` | D1 | HIGH |
| `reference/schemas/card-spec.md` | D2 | MEDIUM |
| `reference/schemas/machine-json.md` | D3 | LOW |
| `troubleshooting/reading-doctor.md` | F3 | MEDIUM |
| `troubleshooting/stale-symlinks.md` | D5 | LOW |
| `getting-started/installation.md` | F1, F2 | HIGH |

---

## Implementation Order (Recommended)

**Phase 1 — Critical reference surface (users blocked without this)**

1. Create `reference/cli/install.md` — affects every CI integration and onboarding
2. Create `reference/cli/mind.md` — affects every mind card user
3. Create `concepts/minds.md` — prerequisite for phases 2 and 3
4. Create `concepts/beliefs-memories-personas.md` — prerequisite for card authoring guide
5. Fix `card.md` B10 bug (`drwn card untrust` missing `--hooks`) — active misinformation

**Phase 2 — Concept documentation (users can use features but don't understand them)**

6. Create `concepts/hook-policies.md`
7. Create `concepts/trusted-sources.md`
8. Create `reference/env-vars.md`
9. Update `reference/schemas/card-manifest.md` (D1 — v4 fields)
10. Add Windows / WSL2 note to `getting-started/installation.md`

**Phase 3 — Authoring and publishing workflows**

11. Create `guides/authoring-mind-cards.md`
12. Create `guides/authoring-hook-policies.md`
13. Create `guides/managing-minds.md`
14. Update `reference/cli/card.md` (B1–B9 — card source subcommands and remote)
15. Update `reference/cli/write.md` (B5 — scope flags)
16. Create `reference/cli/catalog.md`

**Phase 4 — Lower-priority fill**

17. Create `troubleshooting/credential-errors.md`
18. Update `troubleshooting/reading-doctor.md` (F3 — platformChecks explanation)
19. Update `reference/schemas/machine-json.md` (D3)
20. Update `reference/schemas/card-spec.md` (D2)
21. Verify and update `troubleshooting/stale-symlinks.md` (D5)
