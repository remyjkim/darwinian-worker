# ABOUTME: Approved design for retiring "Darwinian Harness" terminology — renaming the primary card to @darwinian/operator and the seven harness-named skills to mind vocabulary.
# ABOUTME: Covers the darwinian-minds-skills v0.4.0 release scope, hard-cut deprecation policy, local store/project migration, and stale checkout cleanup.

# Analysis 89 — @darwinian/operator Card Migration: Design

**Date**: 2026-07-02
**Author**: Claude + Remy
**Status**: Approved — ready for implementation planning

## Problem

The project no longer uses the term "Darwinian Harness", but the terminology
survives across the skills repo: the compatibility card
`@darwinian/harness-skills`, seven primary skills with `harness` in their
names, three `*-harness-card` alias skills, and roughly 62 markdown/JSON files
of prose. The primary card name `@darwinian/mind-skills` also undersells what
a card is: a card can bundle skills, MCP server definitions, and hooks — not
just skills.

Separately, a stale local checkout at `~/dev/darwinian-harness-skills` (same
remote as the canonical submodule, pre-scrub history) carries uncommitted
`sync-card-skills/SKILL.md` edits, and the standalone library package
`@remyjkim/drwn-import-mcp-from-claude@1.0.0` holds skill improvements that
never made it back into the canonical repo.

## Decisions

1. **Card name**: `@darwinian/operator`, starting at **1.0.0**, living at
   `cards/operator/` inside darwinian-minds-skills. The name says what the
   card does — it makes an agent an operator of Darwinian Minds — and is
   agnostic to card contents (skills, MCPs, hooks).
2. **Skill renames** ship in the same release:

   | Current | New |
   |---|---|
   | `inspect-harness` | `inspect-minds` |
   | `materialize-harness` | `materialize-minds` |
   | `repair-harness` | `repair-minds` |
   | `recommend-harness` | `recommend-minds` |
   | `support-harness` | `support-minds` |
   | `manage-harness-library` | `manage-library` |
   | `install-harness-project` | `install-project` |

   The other ten primary skills already use mind vocabulary and keep their
   names. The `organize-workspace` stub stays.
3. **Hard cut, no new aliases**: the three `apply/author/share-harness-card`
   alias skills are deleted as scheduled (they were promised one release).
   The renamed skills get no compatibility aliases. Old card names are
   deprecated with pointer messages, not aliased.
4. **Card home**: subdirectory of darwinian-minds-skills, synced from the
   canonical `skills/` tree by the existing `sync:cards` flow. A standalone
   one-repo-per-card layout (the @community catalog pattern) was considered
   and rejected to avoid a second repo with a permanent sync obligation.

## Release scope: darwinian-minds-skills v0.4.0

One branch, one release:

- Rename the seven skill directories; update SKILL.md frontmatter, titles,
  and every cross-reference (Related Skills lists, redirect instructions).
- Delete `skills/apply-harness-card`, `skills/author-harness-card`,
  `skills/share-harness-card`.
- Replace `cards/harness-skills` and `cards/mind-skills` with
  `cards/operator` (card.json `@darwinian/operator@1.0.0`, all 17 primary
  skills plus `organize-workspace` excluded — stub stays out of the card).
- Update `bundle.json`, `README.md`, and `.claude-plugin` manifest to 0.4.0
  with the new skill list.
- Prose sweep of remaining "harness" mentions. Exception: the `card.json`
  schema field `harness.minVersion` belongs to the drwn CLI schema and is out
  of scope; CLI vocabulary (three `drwn --help` mentions, the schema field)
  is follow-up work in the darwinian-minds repo.
- Port the standalone `@remyjkim/drwn-import-mcp-from-claude@1.0.0` package's
  improvements into the canonical `import-mcp-from-claude` skill: the
  `claude mcp list`/`get` no-`--json` workarounds, authoritative config-file
  inspection, and the stdio-spawn trust caveat.
- Run `npm run sync:cards`, then the full validator suite: `validate:cards`,
  `validate:skills`, `check:identity`, `check:paths`, `lint:md`, `smoke:cli`.

## Deprecation and machine migration

After the release is tagged and pushed:

1. Publish `@darwinian/operator@1.0.0` into the local store from the new card
   source; verify with `drwn card list`.
2. `drwn card deprecate @darwinian/harness-skills --message "Renamed to
   @darwinian/operator"`.
3. In `~/dev/darwinian-cards`: `drwn card remove @darwinian/harness-skills`
   then `drwn card add "@darwinian/operator@^1.0.0" --write`; verify all
   skills materialize.
4. Remove the working copy at `~/.agents/drwn/sources/@darwinian/harness-skills`.
5. With explicit approval (no CLI removal command exists): delete
   `~/.agents/drwn/skills/@remyjkim/drwn-import-mcp-from-claude`, then
   `drwn library add skill <darwinian-minds-skills>` and
   `drwn library defaults add skill <name>` for the 17 primary skills.

## Stale checkout cleanup

Diff the uncommitted `sync-card-skills/SKILL.md` edits in
`~/dev/darwinian-harness-skills` against canonical; port anything newer, then
delete the directory.

## Verification

- All repo validators green on the release branch.
- `drwn card source doctor` clean; publish succeeds.
- `@darwinian/operator` applies to darwinian-cards and every bundled skill
  materializes; `drwn card list` shows operator present and harness-skills
  deprecated.
