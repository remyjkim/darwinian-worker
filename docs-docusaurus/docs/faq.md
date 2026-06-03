---
sidebar_position: 7
---

# FAQ

## What is the difference between `darwinian-harness` and the agent itself (Claude, Codex)?

`darwinian-harness` (the `drwn` CLI) is a control plane around the agent tools you already have installed. The agents — Claude Code, Codex, Cursor — execute the tasks. `drwn` decides which skills, MCP servers, and extensions each agent has access to, then writes that decision into `~/.claude`, `~/.codex`, and `~/.cursor` so the agents can find it. `drwn` does not run agents and does not call models.

See [Concepts overview](./concepts/layered-model) for the layered model.

## Why is `drwn` conservative by default?

Because the things `drwn` touches — agent settings files, skill directories, MCP server lists — are shared with other tools and with humans. Silent overwrites would lose user-authored content. So `drwn` previews every change (`--dry-run`), records what it wrote (write record), refuses to overwrite content it did not write (managed-field hashing), and reports problems rather than fixing them silently (`doctor`).

See [Ownership and Write Records](./concepts/ownership-and-write-records).

## Why does `drwn doctor` not auto-fix?

Because the right fix depends on intent that `drwn` does not have. A stale skill symlink might mean "remove this skill from defaults" or "the underlying bundle moved, point me at the new path." A managed-field hash mismatch might mean "publish over the drift" or "migrate the manual edit into config." `doctor` enumerates the conditions and lets the operator (or an agent following a skill) decide. The write pipeline and doctor share the same engine — see [Diagnostics Model](./concepts/diagnostics-model).

## Why are bundle update and remove not implemented?

The first wave of package-backed skill bundles intentionally ships `add`, `list`, `show`, curate, and downstream-write only. Update and remove were left out because their semantics (in-place upgrade vs reinstall, dangling references when a bundle is removed) need more design before they ship. For now, remove a bundle by deleting the directory under `~/.agents/drwn/skills/` and re-running `drwn write`; upgrade by re-adding the new version.

See the [extension skill bundles section](./reference/cli/library) and [npm skill bundles guide](https://github.com/remyjkim/darwinian-harness/blob/main/.ai/knowledges/03_npm-skill-bundles-guide.md) for the current surface.

## Can I run `drwn` without writing anything?

Yes. Every write command supports `--dry-run` and prints the exact planned changes. Inspection commands (`status`, `doctor`, `library list`, `mcp list`, `skills list`, `card show`) never write. For a stricter guarantee against any store mutation, set `DRWN_STORE_READONLY=1`.

## What does `DRWN_STORE_READONLY=1` actually block?

It blocks every write under `~/.agents/drwn/` — published card mutations, source mutations, machine-config edits, catalog updates, URL-card-map updates, and store migration. Inspection, dry runs, and source `doctor` continue to work. The check is enforced at the resolver boundary (`assertStoreWritable` in `cli/core/store-paths.ts`), so individual commands cannot bypass it. The downstream tool config (`~/.claude`, `~/.codex`, `~/.cursor`) is not under the store and is governed separately.

See [Local Store](./concepts/local-store) for the store boundary.

## How does the URL-to-card-name cache work?

When `drwn` resolves a card by Git URL for the first time, it records the URL-to-name mapping at `~/.agents/drwn/url-card-map.json`. Subsequent fetches of the same URL skip the discovery step and reuse the cached name. The cache is treated as an optimization — a missing or corrupt file is ignored and rebuilt on the next successful resolution. Writes go through the atomic-rename path like every other store mutation.

## Can I version-control `<project>/.agents/drwn/`?

Yes — that is the recommended setup for shared projects. `config.json` and `card.lock` are the contract a teammate needs to reproduce the harness; check them in. The generated `write-record.json`, the downstream `<project>/.claude`, `<project>/.codex`, and `<project>/.cursor` directories, and the `<project>/.agents/drwn/generated/` cache are local artifacts — gitignore them. `drwn init` warns if your `.gitignore` appears to exclude the whole `.agents` directory, which would hide the parts you want to commit.

## What does `drwn scan` do today vs in the future?

Today `drwn scan` is a verified placeholder. It emits a fixed JSON payload describing its planned role and exits without touching disk. The planned role is to inspect existing local agent tool config, report which entries could be lifted into the local library, defaults, or project config, and stop short of any write. Until that is implemented, the command is safe to run but has no effect.

## How is this different from Docker, Flox, or Nix?

`drwn` pins **harness state** — skills, MCP servers, extensions, and downstream targets. It does not pin runtimes, system libraries, services, or shell environment. Docker pins service stacks (Postgres, Redis). Flox and Nix pin the runtime layer (Node, Python, system libs). asdf and mise pin toolchain versions. These tools compose: use `drwn card apply` for the harness, pair with Flox or Nix for the runtime layer, and Docker Compose for the service layer. Each tool pins what it owns. See the layered reproducibility section of [the CLI quick reference](https://github.com/remyjkim/darwinian-harness/blob/main/docs/cli-quickref.md#layered-reproducibility) for the composition.
