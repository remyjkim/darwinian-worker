# Harness Cards: Comparison to Flox, Anaconda, and Adjacent Prior Art

**Date**: 2026-05-20
**Status**: In Review (updated to incorporate `docs/presentations/reproducible_envs.md` framing)
**References**: [analyses/29_harness-cards-target-architecture-v1_1.md, analyses/28_harness-cards-architecture-assessment.md, analyses/26_harness-cards-target-architecture.md, tasks/14_harness-cards-implementation-plan.md, knowledges/02_per-project-config-guide.md, docs/presentations/reproducible_envs.md]

---

## Executive Summary

The Harness Cards architecture (`29_harness-cards-target-architecture-v1_1.md`) is most accurately described as **"Flox's package-manager-with-store-and-lockfile model" composed with **"stow/chezmoi's symlink-and-merge materialization layer."** The combination is what makes it distinct from each prior art alone.

Comparison summary:

- **Flox is the closest single match.** Per-directory environments, a local-authoritative content-addressed store, lockfile-pinned reproducibility, composable bundles, and a planned push/pull-to-remote model all carry over directly. The divergence is in the **materialization mechanism**: Flox activates via PATH and environment variables; harness cards writes into the consumer tools' own config conventions because the consumers — Claude Code, Codex, Cursor — don't speak PATH.
- **Anaconda/conda is a weaker match.** The dependency-solver + channels + environments framing rhymes, but conda's environment is a heavyweight installation root activated via PATH manipulation; cards' environment is the project itself, materialized into tool-specific dirs via symlinks and managed-field rewrites. Conda's heavy ABI-aware solver is also a different weight class from cards' npm-style semver resolver.
- **The genuinely novel piece is the materialization layer.** Most environment managers can rely on one universal activation primitive (PATH manipulation). Cards lands in a niche where the consumer tools each have their own multi-format config conventions, so a single primitive does not suffice. The result is three distinct materialization mechanisms (directory symlinks, `_bgng` meta-block, generated-file-plus-symlink) each chosen to match a specific consumer's read contract. **No single prior-art tool in the package-manager category has analogous complexity here.** The closest parallels are dotfile managers — GNU Stow (symlinks-only), chezmoi (templating + merging) — but those are *only* materializers; they have no solver, no lockfile, no versioned content store.

Net positioning: cards is **a hybrid of two well-trodden patterns** (package-manager-with-store + dotfile-style materialization) combined to address a problem space — AI-coding-tool harness management — that neither pattern alone solves. The hybrid is the contribution; both ingredients are well-grounded prior art.

A companion survey of the broader reproducible-environments landscape (`docs/presentations/reproducible_envs.md`) frames reproducibility as a **stack of layers** (source → dependency → runtime → shell → build → service → machine). Reading cards through that lens yields one more positioning insight that complements the materialization framing above: **cards introduces an 8th layer — agent harness state — that the existing prior art does not enumerate.** Cards is a layer-specific tool that composes with Flox/Nix at the shell layer, with pnpm/Cargo at the app-dependency layer, with Docker at the service layer, rather than replacing any of them. Section §6 develops this positioning, applies the companion report's 17-axis evaluation framework to cards, and surfaces two honesty calls the broader framing forces — **partial-pinning surface** (what cards pins vs. doesn't) and the **provenance gap** (integrity hashes are not SLSA-style attestations) — both of which the v1.1 doc currently understates.

The marketing analogy for cards — **"uv/pnpm for harnesses"** — is the right user-facing entry point and stays unchanged. The Flox + Stow framing and the 8th-layer positioning are *architectural* descriptions for design docs, code review, and internal communication; they are not headline taglines.

---

## Context

The question came up after the implementation plan landed (`tasks/14_harness-cards-implementation-plan.md`): *is this model comparable to Anaconda or Flox?* The short-form answer (sent in chat) compared at three levels — per-directory environments, store layout, materialization. This longer-form document captures the analysis behind that answer, with particular attention to the materialization mechanism (where the cards design diverges most sharply from environment-manager prior art).

The document is intentionally diagnostic: it asks "where does the analogy hold, where does it break, what should we borrow vs. keep unique." It is not a redesign — the cards architecture has shipped (cards v1.1 completed via tasks 16–19) and is not under reconsideration. The §32 recommendations are post-implementation enhancements (see §A5 for codebase impact).

---

## Background

Short primers on each tool, focused on the dimensions relevant to cards.

### 3.1 Anaconda / conda

- **Domain.** Cross-language package manager originally focused on Python's scientific stack; also distributes R, C/C++ libs, CUDA toolchains, etc.
- **Environments.** Named, isolated installation roots at `~/anaconda3/envs/<name>/` (or `~/miniconda3/envs/<name>/`). Each environment is a full directory tree containing its own `bin/`, `lib/`, `include/`, `python`, `site-packages/`, etc.
- **Activation.** `conda activate <env>` runs shell-init machinery (functions in `.bashrc` / `.zshrc`) that prepends `<env>/bin` to `PATH`, sets `CONDA_PREFIX`, `CONDA_DEFAULT_ENV`, and (on Windows) manipulates `PATH` more aggressively.
- **Manifest.** `environment.yml` declares the env: name, channels, dependencies. Imported via `conda env create -f environment.yml`.
- **Lockfile.** Optional via `conda lock` (a separate tool) or `conda env export`. Not a first-class part of the workflow until recent versions.
- **Channels.** Sources of packages: `defaults`, `conda-forge`, `bioconda`, custom. Solver picks across channels based on priority.
- **Solver.** SAT-style, ABI-aware. Famously slow on large environments; the recent `libmamba` solver is faster but still heavyweight because it tracks cross-language ABI compatibility.
- **Store.** Each env is its own directory; there is some package cache at `~/anaconda3/pkgs/` but the activation root is the env directory itself.

### 3.2 Flox

- **Domain.** General-purpose package and environment manager built on Nix.
- **Environments.** Per-directory via `.flox/env/` (the project's declaration) plus named "default" environments at `~/.local/share/flox/environments/`. Multiple environments can be active concurrently.
- **Activation.** `flox activate` (or implicit activation via shell hooks) injects `PATH` plus other vars (`LD_LIBRARY_PATH`, `NIX_PROFILES`, `XDG_DATA_DIRS`, etc.). Activation is reversible — `exit` the subshell, the env is gone.
- **Manifest.** `manifest.toml` declares the env: `[install]` blocks list packages by name + version-or-attribute; `[vars]` declares env vars; `[hook]` declares activation hooks; `[profile]` declares shell-specific behavior.
- **Lockfile.** `manifest.lock` carries resolved package versions, store paths, content hashes. First-class.
- **Store.** Nix store at `/nix/store/<hash>-<name>/` — content-addressable, deduplicated across all envs on the machine, immutable.
- **Composability.** Flox compositions allow merging multiple environments declaratively (per the `compose` system); each composition produces one effective env.
- **Distribution.** FloxHub (a cloud service) or any git remote — `flox push`, `flox pull`. The local store is authoritative; remotes are sync targets.
- **Solver.** Resolves package names against the FloxHub catalog (or configured catalogs); pin resolution per `manifest.lock`.

### 3.3 Dotfile managers (GNU Stow, chezmoi)

Not environment managers, but relevant because they handle the **materialization** problem in isolation.

- **GNU Stow.** A "symlink farm" manager: you organize your dotfiles into a directory tree under `~/dotfiles/`, then `stow <package>` creates symlinks from `~/` to the relevant files in `~/dotfiles/<package>/`. Pure symlink deployment; no solver, no versioning, no templating.
- **chezmoi.** A more sophisticated dotfile manager: keeps a content store at `~/.local/share/chezmoi/`, supports templating (per-machine variations), encrypted secrets, scripts run on apply. Materialization is a mix of "copy with template substitution" and "symlink." Still no solver, no lockfile, no versioned content store in the package-manager sense.

These tools materialize content into specific paths in the user's filesystem because that's where the *consuming* programs (shell, editor, terminal) look for their config. They cannot use `PATH` to inject config — the consumers wouldn't honor it.

### 3.4 Other adjacent prior art (brief)

- **pnpm.** Per-project `node_modules/` materialized via hardlinks from a content-addressable store at `~/.pnpm-store/`. Lockfile-pinned, npm-distributed. Cards' v1.1 architecture explicitly calls this out as a model (`29_…` §4.2).
- **uv.** Python package management with a content-addressable cache at `~/.cache/uv/`. Virtual envs are interpreter copies with `bin/` on PATH. Lockfile-pinned. Also explicitly modeled by cards' v1.1 architecture.
- **pyenv / asdf / mise.** Multi-language version managers. Activate via PATH manipulation; install runtimes under per-user roots. Pure PATH-activation model.
- **direnv.** Per-directory env-var loader; on `cd` into a directory, loads `.envrc` and adjusts shell environment. Pure env-var activation model.
- **Terraform / OpenTofu, Argo CD, Flux.** Closer analogs in a different domain: declare desired state, materialize into an external system (cloud provider, k8s cluster), reconcile drift. The "materialize into someone else's state" framing is structurally what cards does for AI coding tools.

---

## Comparison Axes

The table below compares cards against conda and Flox across the dimensions that matter for the architecture. The "dotfile manager" column references Stow + chezmoi together where they agree.

| Axis | Anaconda/conda | Flox | Dotfile mgrs (Stow/chezmoi) | Harness Cards |
|---|---|---|---|---|
| **Primary unit** | Package | Package | File/directory | Card (bundle of harness intent) |
| **Composition unit** | Environment (one env = one composition) | Environment (compositions merge envs) | Package (Stow) / scope (chezmoi) | `cards: []` array in project config |
| **Per-directory env discovery** | No (named envs only) | **Yes** (`.flox/env/`) | Yes (cwd-rooted) | **Yes** (`<project>/.agents/bgng/`) |
| **Content store** | Per-env tree + `pkgs/` cache | `/nix/store/` (content-addressed, shared) | `~/.local/share/<tool>/` or `~/dotfiles/` | `~/.agents/bgng/cards/` + `bundles/` + `mcp-servers/` |
| **Store is local-authoritative** | No (download cache only) | **Yes** (Nix store holds user's own derivations too) | Yes (the user's dotfiles are the source) | **Yes** (user-authored cards live in `sources/` and publish into `cards/`) |
| **Lockfile** | Optional (`conda lock`) | First-class (`manifest.lock`) | None | First-class (`card.lock`) |
| **Distribution channels** | conda channels (conda-forge, defaults, ...) | FloxHub or git remotes | Manual / git | npm (v1), git (v2) |
| **Dep solver weight** | Heavy (ABI-aware SAT) | Medium (Nix derivations resolved via catalog queries) | None | Light (npm-style semver intersect-and-pick-highest) |
| **Push/pull to remote** | No (re-publish to channel) | Yes (`flox push`/`pull` to FloxHub or git) | Yes (push to git) | Planned v2 (`bgng store push`/`pull`) |
| **Multi-env on one project** | No (one env active at a time) | Yes (multiple active envs) | Yes (multiple packages stowed) | **Yes** (`cards: [a, b, c]` declared-order, last-wins) |
| **Per-project overrides on top of dependencies** | Limited (env vars, conda-build pinning) | Limited (manifest edits) | N/A | **Yes** (`servers`/`skills`/`extensions`/`targets` overlay in `config.json`) |
| **Materialization mechanism** | **PATH activation** + env vars | **PATH + env vars + symlink profiles** | **Symlinks** (Stow) or **copy+templating** (chezmoi) | **Three mechanisms** (§5 of this doc) |
| **Materialization scope** | Shell session (activate/deactivate) | Shell session (activate/deactivate) | Filesystem (persistent until restow) | **Filesystem (persistent until next `bgng write`)** |
| **Drift detection** | None | None (envs are reproducible from manifest) | chezmoi: yes; Stow: no | Yes (`_bgng` meta-block hashes; v1.1 §8.4) |
| **Cleanup on removal** | Yes (env deletion is dir removal) | Yes (Nix GC) | Stow: `stow -D`; chezmoi: `chezmoi forget` | Yes (write-record-backed; v1.1 §8.5) |
| **Idempotency invariant** | Implicit | Yes (reproducible builds) | Stow: yes (re-stow is no-op); chezmoi: yes | Yes (v1.1 §8.7, tested in M2) |

Reading the table: the cards design **inherits Flox's pattern in nearly every row except the materialization mechanism**, and it borrows the materialization mechanism's spirit from the dotfile-manager column (symlinks + merge), with the additional twist of supporting *three* concurrent mechanisms.

---

## 5. Deep Dive: The Materialization Mechanism

This is where the design diverges most sharply, and it's also the section worth dwelling on because the divergence is *forced by the problem space*, not by aesthetic choice.

### 5.1 The fundamental question: who controls execution?

Every "environment manager" makes its content visible to runtime processes through *some* primitive. The choice of primitive is determined by **who controls the process that consumes the content**:

| Who controls execution? | Primitive | Examples |
|---|---|---|
| The user (via shell) — content is binaries / libs that the runtime finds via the shell's lookup rules | **PATH manipulation** + env vars | conda, Flox, pyenv, asdf, mise, direnv |
| The runtime (already-running tool) — content is files at runtime-conventional paths | **File-tree convention** (write into a known directory the runtime walks) | pnpm `node_modules/`, uv `venv/`, Python `site-packages/` |
| **An external tool that the user runs directly, with its own config-discovery convention** | **Config-file injection** (write into the external tool's expected paths) | **Harness cards**, dotfile managers (`.zshrc`, `.gitconfig`), GitOps tools (write into k8s state), Terraform (write into cloud provider state) |

Conda and Flox both sit in row 1: the user activates an env, and subsequent commands (`python`, `node`, `gcc`) find their binaries via PATH. PATH manipulation is **universal** — it works for every executable, regardless of language or vendor.

Harness cards sits in row 3. The consumers — Claude Code, Codex, Cursor — are tools the user runs directly. They don't go through a bgng-controlled wrapper. They look for their config in tool-specific places:

- Claude Code reads `~/.claude/settings.json` (machine scope) and `<project>/.claude/settings.json` (project scope) for MCP server definitions, and `~/.claude/skills/` and `<project>/.claude/skills/` for skill directories.
- Codex reads `~/.codex/config.toml` and `<project>/.codex/config.toml` for MCP server definitions and `<project>/.codex/skills/` for skills.
- Cursor reads `~/.cursor/mcp.json` and `<project>/.cursor/mcp.json` for MCP server definitions.

Each consumer has its own format (Claude/Cursor: JSON; Codex: TOML), its own file shape (Claude/Codex: settings file that mixes bgng-managed and user-managed keys; Cursor: standalone JSON the user typically doesn't edit), and its own discovery convention (project paths take precedence over home paths). **There is no PATH-equivalent that all three honor.**

This is the design constraint that forces cards into row 3. Even if cards could activate an env (it can't, because the consumers don't read activation hooks), the consumers wouldn't observe the activation.

### 5.2 What cards has to do, mechanically

The materialization step must produce, on disk, files that the consumers will find via their own discovery:

```text
<scope>/.claude/skills/<skill-name>/       # directory of SKILL.md + assets
<scope>/.claude/settings.json              # JSON merged with user content
<scope>/.codex/skills/<skill-name>/        # directory of SKILL.md + assets
<scope>/.codex/config.toml                 # TOML merged with user content
<scope>/.cursor/mcp.json                   # standalone JSON
```

Where `<scope>` is either `<project>` (when run from a configured project) or `~` (the user's home, when run outside any project).

Three different file shapes, two different formats, two different "what does this file look like to the user" expectations. A single materialization primitive cannot serve all three:

- **Skills** are directory trees containing `SKILL.md` + assets. The consumer expects to read directory contents from a known path. Symlinks are the natural choice: the directory tree lives once in the store (`~/.agents/bgng/cards/.../skills/<name>/`), and `<scope>/.claude/skills/<name>` is a symlink to it. Cheap, idempotent, and lets multiple consumers (Claude, Codex) share the same store tree.
- **Settings files** (Claude `settings.json`, Codex `config.toml`) mix user-owned and bgng-owned content. The user has their own `model`, `editor`, `personality`, etc. in `settings.json` / `config.toml`. bgng owns the `mcpServers` key (Claude) or `[mcp_servers]` table (Codex). A symlink can't be used because it would overwrite the user's content; a full-file rewrite can't be used because it would lose the user's content (today's `mergeClaudeSettingsText` in `cli/core/mcp.ts:72-79` re-serializes the full JSON, which round-trips most user keys but doesn't detect or prevent user edits within the bgng-managed key).
- **Cursor `mcp.json`** is a standalone file the user typically doesn't edit. It's pure bgng output. A full-file write would work but provides no drift detection; the generated-file-plus-symlink pattern (write the file into the bgng-owned `generated/` directory, symlink `.cursor/mcp.json` to it) cleanly separates the bgng-owned generated artifact from the symlink that Cursor reads, and lets bgng detect "user replaced the symlink with a real file" as drift.

### 5.3 The three mechanisms in detail

#### Mechanism 1: Directory symlinks (skills)

```text
~/.agents/bgng/cards/@me/baseline/1.2.0/skills/parallel-web-search/
  SKILL.md
  examples/
  ...

<scope>/.claude/skills/parallel-web-search → ~/.agents/bgng/cards/@me/baseline/1.2.0/skills/parallel-web-search
<scope>/.codex/skills/parallel-web-search  → ~/.agents/bgng/cards/@me/baseline/1.2.0/skills/parallel-web-search
```

- **Idempotency check.** `realpath(linkPath) === realpath(targetPath)` ⇒ no-op. Already exists in `cli/core/skills.ts:50` for current materialization; carries over unchanged.
- **Broken-link detection.** `readlink` + `stat`. `bgng doctor` reports broken links.
- **Cleanup.** Per `write-record.json`, a symlink listed as previously materialized but not in the new desired set is removed *only if it still resolves to the recorded target* (otherwise the user replaced it with their own content, which is preserved).
- **Why this works for skills:** the consumer reads the directory's *contents*; a symlink to an immutable card-version directory is indistinguishable from a real directory tree to the reader.
- **Why Flox and conda don't need this:** their content is binaries, not directory trees of markdown + assets. A binary on PATH is sufficient; you don't need to convince a runtime that a specific directory exists at a specific path.

#### Mechanism 2: `_bgng` meta-block for managed-field rewrites (Claude settings, Codex config)

```jsonc
// <scope>/.claude/settings.json
{
  "_bgng": {
    "version": 1,
    "managedKeys": ["mcpServers"],
    "fieldHashes": { "mcpServers": "sha256-abc123..." },
    "lastWriteAt": "2026-05-20T10:00:00Z"
  },
  "mcpServers": {
    "context7": { "command": "npx", "args": [...] }
  },
  "model": "claude-opus-4-7",            // user-owned
  "anyOtherUserKey": "preserved verbatim" // user-owned
}
```

```toml
# <scope>/.codex/config.toml
[_bgng]
version = 1
managedSections = ["mcp_servers"]
sectionHashes = { mcp_servers = "sha256-xyz..." }
lastWriteAt = "2026-05-20T10:00:00Z"

[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp"]

[user_personality]    # user-owned
style = "pragmatic"
```

Write algorithm (per v1.1 §8.3.2):

1. Read existing file; parse; extract the `_bgng` block (or empty for first write).
2. For each managed key/section, compute its current hash (canonical-form hash to ignore key reordering and whitespace).
3. **Hash mismatch ⇒ drift.** The user (or another tool) edited the bgng-managed region. Refuse the write; offer `--force` to overwrite, or hint at promoting the change into the project config to keep it.
4. Compute new values from the effective state; hash them.
5. If new hashes match recorded hashes (no source change) **and** on-disk hashes match recorded hashes (no drift), **skip the write entirely.** This is the idempotency invariant (v1.1 §8.7).
6. Otherwise, write: managed keys/sections + non-managed keys/sections preserved verbatim + updated `_bgng` block.

- **Why this works for settings:** field-level ownership. bgng owns specific keys; the user owns the rest. The `_bgng` meta-block is bgng's bookkeeping; from the consumer's perspective, it's just another top-level key (Claude and Codex both ignore unknown keys gracefully).
- **Why a symlink doesn't work here:** a symlink replaces the entire file. The user's keys would be lost.
- **Why a full-file rewrite (today's behavior) is insufficient:** today's code re-serializes the whole JSON, which preserves user keys *but* (a) reformats them (whitespace, key order — annoying for diff review), and (b) provides no detection of user edits to the bgng-managed key (silent overwrite on next write).
- **Why hash-based drift detection over content-based:** canonical hashing means an editor that reformats the file (Prettier, etc.) doesn't trigger false drift; a true edit (different values) does.
- **Why conda/Flox don't need this:** they don't write into files that the user also writes into. Their content lives in isolated env directories. No coexistence problem.

#### Mechanism 3: Generated-file-plus-symlink (Cursor)

```text
<scope>/.agents/bgng/generated/cursor-mcp.json   # bgng renders this
<scope>/.cursor/mcp.json → ../.agents/bgng/generated/cursor-mcp.json
```

- The generated file contains the rendered JSON Cursor expects. No `_bgng` block in this file — Cursor's UI might surface it as an unknown key, and the file is fully bgng-owned anyway.
- `.cursor/mcp.json` is a symlink to the generated file. Cursor reads it transparently.
- **Drift detection** for this mechanism: "is `.cursor/mcp.json` still a symlink to the recorded path?" If the user replaced it with a real file, treat as drift; `--force` restores the symlink (and accepts that the user's replacement is discarded — they were warned).
- **Idempotency.** The symlink is idempotent (already checked via realpath); the generated file content is hash-compared.
- **Why this is the right pattern here:** Cursor reads a standalone file. bgng can produce that file deterministically and leave it in a bgng-owned location, then use a symlink to satisfy Cursor's discovery convention. The user never has to look at the generated file; if they do, the `_bgng`-free format is what Cursor expects.
- **Why not the `_bgng` meta-block here:** Cursor's `mcp.json` is not a mixed-ownership file (user typically doesn't edit it). Adding `_bgng` would put a key Cursor's UI doesn't know about into a file it surfaces to the user. The current pattern is cleaner.
- **Why not a symlink directly into a card?** Because Cursor doesn't read directory contents; it reads a single file whose content is the merged state across cards + overlay. That content has to be computed and materialized somewhere; the `generated/` directory is the natural place.

### 5.4 The three-mechanism trade-off

A reviewer might reasonably ask: *why three mechanisms? Couldn't one suffice?* The answer is: **the file shapes the consumers expect differ**, and each shape's natural materialization differs. Forcing a single mechanism would either:

- Sacrifice user content (symlinks for `settings.json`)
- Sacrifice drift detection (full-file rewrite for `settings.json`)
- Add bookkeeping noise to bgng-only files (`_bgng` in `cursor/mcp.json`)
- Force the user to read a file they shouldn't need to (raw `generated/cursor-mcp.json` instead of `.cursor/mcp.json`)

The three-mechanism design is the result of asking each shape: *what's the least-invasive way to put bgng-owned content here while preserving the consumer's read contract and the user's edit rights?* The answers happened to be three different mechanisms.

There is also a **uniformity cost** to the three-mechanism design: implementation complexity is higher than a single-mechanism alternative, and the test surface is correspondingly larger. The v1.1 architecture and the shipped M3 work (per `tasks/17_completion_harness-cards-m2-m3-materialization-safety.md`) accepted this trade-off explicitly. The alternative — a single mechanism applied uniformly — would either be a regression for one of the file shapes (most concerning: the symlink-for-settings case, which would lose user content) or be more elaborate than the three-mechanism design (a meta-block in cursor's `mcp.json` would surface bgng bookkeeping in Cursor's UI, an avoidable cost).

### 5.5 What conda and Flox cannot do here

If you tried to manage harness state with conda or Flox today, you'd hit the following walls:

- **Activation isn't observed by the consumers.** `conda activate bgng-env` or `flox activate` sets `PATH`, but Claude Code doesn't consult `PATH` for its skill discovery — it reads `~/.claude/skills/` and `<project>/.claude/skills/` regardless of what shell session you're in.
- **You'd have to write a "translator" anyway.** Even if you used conda to install a Python package that contained your skills, you'd still need an additional tool to symlink the skills into `~/.claude/skills/`. That translator *is* the cards materialization layer. The fact that you'd need to write it confirms the materialization layer is the genuinely novel work.
- **No mixed-ownership file primitive.** Neither conda nor Flox has a "managed field within a user-owned file" concept. Their packages own the files they install entirely. Cards' `_bgng` meta-block is structurally closer to chezmoi's templating + merge than to anything in conda/Flox.
- **No drift detection on already-materialized state.** Conda/Flox check whether the env matches the manifest, but they don't go look at `~/.zshrc` to see if the user edited it. Cards' drift detection on `.claude/settings.json` is a closer analog to chezmoi's "is the deployed file still what I wrote?" check.

### 5.6 What cards could borrow from the materialization side of the comparison

Even though the design constraints are different, some patterns from these tools are worth considering as future enhancements:

1. **Flox's content-addressable store deduplication.** Cards' store is versioned-immutable but not content-addressed (cards at different versions don't share unchanged blobs). For cards with large inline content, future work could content-address the inline files (`<store>/blobs/<sha256>/`) and reference them from each card version. v2+ feature; not needed for v1.
2. **chezmoi's templating.** Cards inline content is pure-text today (a SKILL.md is a SKILL.md). If users want per-machine variations (e.g., a skill that references a path that differs across machines), templating would let one card serve multiple machines without forking. v2+ feature; the v1 design's principle of "cards are immutable, machine-specific deviation is the overlay" suggests templating belongs to the bundle layer, not cards.
3. **Stow's "package conflict" detection.** When two stowed packages would write the same symlink, Stow refuses. Cards' multi-card conflict warning (v1.1 §7.6) is structurally similar but currently warns rather than refuses; matching Stow's strictness would be a behavior change worth considering for v2.

---

## 6. Cards in the Broader Reproducibility Landscape

A companion document, `docs/presentations/reproducible_envs.md`, surveys the full reproducible-environments tooling space — Nix, Flox, Conda, Docker/OCI, Bazel, npm/pnpm/Yarn, Cargo, asdf/Volta/rustup, VMs, direnv, system package managers. The survey is broader than this analysis (all polyglot dev environments, not just AI-harness state) and provides three insights that sharpen cards' positioning beyond what §3–§5 of this document already say.

### 6.1 The Layered Reproducibility Stack

The companion report's central insight is that reproducibility is a **stack of layers**, with different tools controlling different layers, and many disappointments come from expecting a tool that controls one layer to control all the others:

| Layer | What lives here | Representative tools |
|---|---|---|
| 1. Source tree | Project source code, configs, asset files | Git |
| 2. Dependency graph | Application-level deps + lockfile | npm/pnpm/Yarn, Cargo, pip, Go modules |
| 3. Runtime / toolchain | Interpreter, compiler, package-manager version | asdf, mise, nvm, Volta, rustup, pyenv |
| 4. Interactive shell / dev environment | Composed shell with packages, env vars, hooks | Nix, Flox, Conda, venv, direnv |
| 5. Build execution | Hermetic action graph + remote cache/execution | Bazel, Buck2, Pants |
| 6. Service topology | Containerized services + runtime packaging | Docker/OCI, Compose, k8s |
| 7. Whole machine | Full OS + kernel parity | VMs (Vagrant, Multipass), bare-metal images |

The companion report's practical principle: **"Choose the smallest layer that solves the problem, then add outer layers only where drift still occurs."** Healthy production setups blend layers — *language lockfile inside a higher-order shell*, *environment for development with container for deployment* — rather than picking one tool to do everything.

### 6.2 Cards' Place: A New 8th Layer for Agent Harness State

The seven layers above do not enumerate **AI-assistant configuration**. That's because the layered framing was articulated before agent tooling (Claude Code, Codex, Cursor, Aider, Continue, Zed, and successors) became a first-class part of developer environments. Today, *which agent extensions and skills and MCP servers are active, with what versions* is as much a part of "the development environment" as the compiler or shell, and it has the same drift symptom: "works on my machine" because my Claude Code has skill X enabled and yours doesn't.

Harness Cards adds an **8th layer** to the stack:

| Layer | What lives here | Representative tools |
|---|---|---|
| 8. **Agent harness state** | **Per-project agent extensions, skills, MCP servers, downstream-tool config** | **bgng + Harness Cards** |

Two consequences flow from this assignment:

1. **Cards is a layer-specific tool, not a general environment manager.** It is to Layer 8 what npm is to Layer 2, what Cargo is to Layer 2 for Rust, what asdf is to Layer 3, what Flox is to Layer 4. Each operates within its layer and composes with tools at other layers; cards does the same.
2. **Cards composes with — does not replace — the other layers.** A user might run Flox for Layer 4, pnpm at Layer 2, Docker at Layer 6, and cards at Layer 8. None conflict; each operates on its own concerns.

This is the strongest single positioning aid for cards. It answers "where does this fit?" precisely: at a layer no existing tool addresses, alongside tools that handle the other layers well.

### 6.3 Hybrid Composition Patterns

The companion report identifies two hybrid patterns recurring in healthy teams:

- **"Language lockfile inside a higher-order shell."** App lockfile (pnpm/Cargo/etc.) pins app deps; Flox/Nix/Conda supplies runtime + tools + shell.
- **"Environment for development, container for deployment."** Developers use a fast shell-first workflow; CI builds OCI images from the same description.

Cards extends both with a third, **agent-aware pattern**:

- **"Harness pinned via cards, inside reproducible shell, with containerized services."**

  ```text
  Layer 8: Cards            (skills, MCP servers, extensions, downstream targets)
  Layer 6: Docker / Compose (service stack — Postgres, Redis, etc.)
  Layer 4: Flox or Nix      (Node, Python, system libs, shell hooks)
  Layer 3: implicit via Flox / asdf (runtime versions)
  Layer 2: pnpm or Cargo    (app dependencies + lockfile)
  ```

  Each layer's tool pins what it owns; together they remove "works on my machine" friction across every typical dimension. **This pattern should be the recommended way to use cards alongside existing reproducibility infrastructure**, surfaced in user-facing docs (bgng's README, `02_per-project-config-guide.md`).

### 6.4 The 17-Axis Evaluation Framework Applied to Cards

The companion report enumerates 17 evaluation dimensions for reproducibility tooling. Cards on each:

| Axis | Cards' position | Notes |
|---|---|---|
| Isolation | Filesystem-level (store paths immutable; project-scoped writes); not process isolation. | Cards doesn't sandbox the agents themselves; that's not its layer. |
| Immutability | Strong — store paths immutable, published cards never overwritten. | Per v1.1 §11.4 invariant. |
| Reproducibility | Strong for cards' own state; **partial** for the broader harness. | See §6.5 partial-pinning analysis. |
| Determinism | Strong — same lockfile + same store ⇒ byte-identical effective state. | Per v1.1 §11.4. |
| Dependency pinning | Strong for card + bundle versions; **not** for the consumers (Claude Code, Codex, Cursor) themselves. | See §6.5. |
| Provenance | **Absent in v1.** Integrity hashes ≠ provenance attestations. | See §6.6 and R7. |
| Activation model | Filesystem materialization (no PATH activation). | This document's §5. |
| Portability | Strong — cards are cross-platform by construction (markdown + JSON/TOML). | Unlike Conda, no per-platform lock split. |
| Performance | Fast — npm-style semver resolver; no SAT solving. | Per `tasks/14_…` A5. |
| UX | Single command (`bgng card apply @scope/name`). | Vs. Flox's manifest-then-activate, Nix's flake-then-develop. |
| Security | Standard supply-chain (npm + integrity hashes); **no provenance attestation**. | See §6.6. |
| Caching | npm registry cache + local store; **no binary cache** of materialized state. | Less aggressive than Flox/Nix substituters. |
| Binary vs source | Source-only (no compilation; cards are config + content). | Trivial dimension for cards. |
| Hermeticity | **Weak at the runtime boundary** — skills can invoke MCP servers that `npx -y <pkg>` at runtime, which is ambient. | See §6.5 + R8. |
| Side-effects | Declared via write-record; reversible via cleanup. | Per v1.1 §8.5. |
| Multi-language | N/A (cards are language-agnostic config). | Cards is a meta-tool. |
| CI/CD parity | Lockfile + integrity hashes give CI the same state as dev. | Same model as pnpm/uv. |

Two axes deserve highlighting because cards underperforms on them: **provenance** (absent in v1 — see §6.6 and R7) and **hermeticity** at the runtime boundary (weak — see §6.5 and R8).

### 6.5 Partial Pinning: What Cards Pins and What It Doesn't

The companion report names **partial pinning** as the most common failure mode in reproducibility setups: teams commit a lockfile but leave the runtime, package-manager version, base image tag, or channel selection floating, producing the illusion of reproducibility without the substance.

Cards is honest about what it pins:

| Pinned in v1 | Not pinned today |
|---|---|
| Card versions in `card.lock` | The bgng harness version itself (only enforced loosely via `harness.minVersion`) |
| Card content integrity (sha256) | Claude Code / Codex / Cursor versions (the consumers) |
| Bundle versions in `card.lock` | MCP server runtime resolution (e.g., `npx -y <pkg>` pulls "latest" by default) |
| Inline MCP server definitions | Skill execution surface (skills may invoke external CLIs that aren't pinned) |
| Project overlay's declared servers | Operating-system-level dependencies of MCP servers and runtimes |

This is roughly the same gap a JavaScript team gets from committing `pnpm-lock.yaml` without pinning the Node version or the host system libs. **Cards is in good company on this gap; it is the right v1 boundary** because closing it requires coordination outside cards' scope — each consumer (e.g., Claude Code lacks a version-pinning mechanism today), the MCP ecosystem (no standard exists for pinning `npx -y` resolution), and the shell/system layers (which is exactly what Flox/Nix were designed for).

**Recommendation (see R8)**: surface this gap explicitly in user-facing docs. Tell users *cards pins your harness state; for full reproducibility, pair cards with Flox/Nix at the shell layer (which pins Node/Python) and document the agent tool versions in the project README.* That is the third hybrid pattern from §6.3.

### 6.6 Provenance: The Frontier Beyond Reproducibility

The companion report emphasizes that **immutability is not provenance**. OCI images are immutable once pushed; Nix store paths are immutable once realized; cards' integrity hashes pin content. But none of those records *who* built the artifact, *when*, *from what source*, *with what builder identity*. SLSA (Supply-chain Levels for Software Artifacts) defines provenance attestations that complement reproducibility:

- Builder identity (which CI workflow ran the build, which signing key was used).
- Source reference (git URL + revision of the input source).
- Build process (the commands run).
- Inputs (everything the build consumed, with content hashes).
- Output digests.

Cards has none of this in v1. The `origin` field in the lockfile records *where* a card came from (npm URL, local store, file path), but not the SLSA-style trail. For v2+, a `bgng card publish --with-provenance` could emit a SLSA in-toto attestation alongside the card tarball (published to the registry next to the package, per the SLSA spec); a future `bgng card apply --verify-provenance` could check attestations during resolution. This is a real v2 enhancement worth adding to v1.1 §13 v2 Roadmap (see R7).

### 6.7 What Flox Integration Would and Wouldn't Fix

The companion report's framing prompts a natural follow-up: **if we integrate Flox as a core tool, do cards' partial-pinning gaps (§6.5) go away?** The honest answer is "the runtime/toolchain ones do; the AI-tool-vendor ones and the cards-feature ones don't."

| Gap from §6.5 | Flox closes it? | Mechanism, or why not |
|---|---|---|
| Node / Python / Bun / Rust toolchain versions | **Yes** | `flox install nodejs_24` etc.; pinned via the Nix store. |
| System libs (OpenSSL, libssh, etc.) | **Yes** | Nix store transitive deps; pinned. |
| CLI dependencies of skills (`bd`, `markitdown`, `git`, etc.) | **Yes** | `flox install` whatever's in nixpkgs. |
| Cross-machine inner-loop drift | **Yes** | Flox's core feature. |
| Shell env determinism (PATH, env vars) | **Yes** | Flox's activation model. |
| MCP server runtime (`npx -y <pkg>` pulls "latest") | **Partial** | Flox cannot intercept `npx -y` itself; it resolves to "latest" regardless. The robust fix is cards-side: change the MCP server's `command`/`args` to invoke a Flox-installed binary (`command: "context7-mcp"`), or to pin the version in args (`args: ["-y", "@upstash/context7-mcp@1.2.3"]`). |
| bgng's own version | **Partial** | Only if bgng publishes to a Flox catalog (it doesn't today). Even with Flox installed, users typically install bgng outside Flox. |
| Claude Code / Codex / Cursor versions | **No** | Vendor-controlled distribution. None of these tools ship via Nix/Flox today. Flox can't pin what it doesn't package, and users install these via official channels (brew, npm, vendor installer). |
| Cards' SLSA provenance attestation | **No** | Cards-feature concern (R7). Flox has its own publish trust model (FloxHub), but that doesn't give cards a SLSA in-toto attestation chain. |
| Skill *execution* side effects | **No** | If a skill invokes a network API or writes files outside `.claude/`, Flox can't sandbox that. Flox is *reproducibility*, not *sandboxing*. |

**Summary.** Flox closes the **runtime/toolchain half** of cards' partial-pinning surface (Layers 3–4 of the stack from §6.1). That is genuinely significant. It does *not* close the agent-tool-version half (Layer 8 vendors don't ship via Nix), the cards-specific concerns (provenance, npx-at-runtime, skill execution surface), or replace any of the cards-side mechanisms.

**The architectural implication is composition, not integration:**

- **What R9 already says — recommend the layered pattern** (cards at Layer 8, Flox at Layer 4) **— is the right answer for v1.** Most runtime gaps close automatically when users follow it.
- **What we should NOT do** is bake Flox into bgng as a hard dependency. That couples cards to Nix-based tooling, adds a learning curve, and excludes Windows users (Flox has no native Windows support today).
- **What we COULD do for v2** is an optional **Flox bridge** that makes the composition pattern CLI-supported without forcing Flox on anyone. See R10 below.

There is also one **cards-content best practice** this analysis surfaces, independent of Flox: **MCP server definitions** (in cards and in bgng's built-in `registry/mcp-servers.json`) **should pin versions in `args` rather than rely on `npx -y <pkg>`'s "latest" resolution.** Pinned form: `args: ["-y", "@upstash/context7-mcp@1.2.3"]`. This is a content-side improvement that addresses F9 at the MCP runtime boundary with or without Flox; see R11.

---

## 7. Findings

The investigation yields the following findings, numbered for reference in the recommendations.

| # | Finding |
|---|---|
| F1 | Flox is the closest single-tool analog to the cards model: per-directory environments, local-authoritative store, lockfile-pinned reproducibility, composable bundles, planned push/pull all map directly. |
| F2 | Conda is a weaker analog because (a) its environments are heavyweight installation roots not project-local declarations, (b) its activation is PATH-based and incompatible with cards' consumer tools, (c) its solver is in a heavier weight class than cards needs. |
| F3 | The materialization mechanism is the genuinely novel piece of cards. No environment-manager tool in the surveyed prior art faces the cards constraint (multiple external consumers, each with their own config-discovery convention). |
| F4 | The closest materialization analog is dotfile managers — Stow (symlinks) and chezmoi (templating + merge) — but those are only materializers; they have no solver, lockfile, versioned content store, or compositional bundles. |
| F5 | The three-mechanism materialization design (directory symlinks, `_bgng` meta-block, generated-file-plus-symlink) is **forced by the problem space**, not by aesthetic choice. A single-mechanism alternative would regress in at least one dimension. |
| F6 | The cards architecture is most accurately described as **"Flox-style package management composed with dotfile-style materialization."** Both ingredients are well-trodden prior art; the combination is the contribution. |
| F7 | Some patterns from prior art are worth considering as future enhancements (Flox content-addressing for deduplication, chezmoi templating, Stow's package-conflict refusal). None is on the v1 critical path. |
| F8 | Cards addresses an **8th layer** of the reproducibility stack — agent harness state — that the existing prior art (conda, Flox, Docker, npm, etc.) does not enumerate. The layer is real (agents are first-class development-environment components in 2026+) and currently unaddressed; cards is the first layer-specific tool for it. |
| F9 | Cards' pinning surface is intentionally narrow: card + bundle versions and integrity hashes, but **not** the consuming agent tool versions, MCP server runtime resolution (`npx -y` pulls "latest"), or system libs. This matches the "partial pinning" failure pattern the companion report warns about — but in cards' case, the boundary is the right v1 boundary because closing the gap requires coordination outside cards' scope. The honest fix is to *document* the gap and recommend layered composition (R8) rather than try to close it inside cards. |
| F10 | Cards lacks **provenance attestation** (SLSA in-toto style) in v1. The lockfile records *where* a card came from (npm URL, store, file path) but not *who* built it, *when*, *with what builder identity*. The companion report makes the distinction explicit: integrity hashes pin *content*; provenance pins *origin process*. This is a real v2+ enhancement worth adding to the roadmap. |

---

## 8. Recommendations

### R1. Keep "uv/pnpm for harnesses" as the marketing analogy; use "Flox + Stow" as the architectural framing

The marketing analogy for cards stays **"uv/pnpm for harnesses"** — that framing is the right entry point for users familiar with npm/Cargo-style lockfiles and resolves correctly for the dependency-resolution and lockfile aspects. **Do not change the user-facing tagline.**

The architectural-detail framing — for design docs, code review, internal communication, and anyone digging into "why three materialization mechanisms" — is **"Flox-style package management composed with dotfile-style materialization."** This framing captures both the package-manager half and the dotfile-materializer half precisely. It belongs in the architecture doc's §4.2 (the model section), not the introduction.

**Do not collapse the two.** Marketing audiences need the familiar uv/pnpm analogy; engineering audiences benefit from the Flox + Stow framing for the materialization layer and from the 8th-layer positioning (§6 of this document) for the broader landscape question. Both stay; be clear about which context each is for.

Suggested addition to v1.1 §4.2 (after the existing uv/pnpm comparison table):

> "Internally, the model is more precisely described as **Flox-style package management composed with dotfile-style materialization**. The Flox half — per-directory environments, local-authoritative content store, lockfile-pinned reproducibility, composable bundles — covers everything except how the resolved state reaches the consumer tools. The dotfile-manager half — symlinks, managed-field rewrites in mixed-ownership files, generated-file-plus-symlink — handles the materialization, which is fragmented across three mechanisms because the consumers (Claude Code, Codex, Cursor) don't share a single config convention. See `analyses/32_harness-cards-vs-flox-and-conda.md` §5 for the deep dive."

### R2. Preserve the three-mechanism design; resist consolidation pressure during review

When reviewers ask "why three mechanisms?" — and they will, for any future refactor — the answer is in §5.3 above. Each mechanism is the minimal-invasion choice for its consumer's file shape. Reducing to one mechanism would force a regression. **Any future PR that proposes consolidation** should pre-empt this question with a paragraph quoting the §5.3 trade-off; this analysis serves as the canonical reference for that argument.

### R3. Borrow content-addressing from Flox as a v2 enhancement

The cards store at `~/.agents/bgng/cards/<scope>/<name>/<version>/` keeps full directory trees per version. Two versions of the same card that share unchanged inline files duplicate those files on disk. For small cards this is a non-issue; for cards with substantial inline content (multiple SKILL.md + assets), content-addressing would deduplicate.

**Implementation sketch (v2):**

```text
~/.agents/bgng/
├── cards/<scope>/<name>/<version>/        # manifest + symlinks to store/blobs
└── blobs/<sha256[:2]>/<sha256[2:]>        # content-addressed blobs
```

Defer to v2; not on v1's critical path. Add to `29_…` §13 v2 Roadmap.

### R4. Borrow Stow-style conflict refusal as a v2 strictness toggle

v1.1 §7.6 warns on multi-card same-server-different-definition. Stow refuses. **A `--strict` flag on `bgng card apply` / `add` could escalate the warning to a refusal** for users who want hard guarantees. Defer to v2; not on v1's critical path.

### R5. Do not borrow conda's solver

The conda solver (and `libmamba`) is heavyweight because it tracks cross-language ABI. Cards' resolver is npm-style semver intersect-and-pick-highest (v1.1 §7.7), which is sufficient for the harness intent domain. **Do not introduce SAT-style solving;** it's overkill and would regress build/install latency for no win.

### R6. Marketing analogy stays "uv/pnpm for harnesses"; avoid the bare "package manager" framing

The marketing analogy **"uv/pnpm for harnesses"** is the right user-facing framing because uv and pnpm are the closest familiar models for "lockfile + immutable store + npm-style solver" — most users will mentally model cards as that, and the model resolves correctly. **Keep this tagline.**

What to avoid: the *unqualified* "cards is a package manager" framing. Without the uv/pnpm qualifier, "package manager" invites conda-like expectations (activation semantics, heavyweight environments) that cards intentionally doesn't have. The qualifier is doing real work — drop it and the analogy over-extends. Internally, cards is more precisely "a config-bundle manager at Layer 8 with a package-manager-shaped solver and a dotfile-manager-shaped materializer," but that's an internal description, not a tagline.

### R7. Plan SLSA-style provenance attestation for v2

The companion report's distinction between *immutability* (content pinned) and *provenance* (origin process attested) maps onto a real gap in cards. v1's `card.lock` records origin URLs and integrity hashes but no SLSA in-toto trail. For v2:

- `bgng card publish --with-provenance` emits an in-toto attestation alongside the card tarball, capturing: builder identity (CI workflow + signing key), source reference (git URL + revision of the source directory), inputs (manifest + inline content hashes), output digest.
- The attestation is published next to the package (per the SLSA spec — same registry, conventional naming).
- `bgng card apply --verify-provenance` (also v2) verifies attestations during resolution; failure modes are an explicit policy decision (refuse vs. warn).

**Add to v1.1 §13 v2 Roadmap** as a deferred deliverable. Trigger to revisit: any consumer of cards needing supply-chain assurance beyond what `npm + sha256` provides.

### R8. Document the partial-pinning surface explicitly in user-facing docs

In `02_per-project-config-guide.md` (and bgng's README when it gets a reproducibility section), add a **"What cards pins vs. what it doesn't"** subsection that mirrors the table in §6.5 above. The key user-facing message:

> "Cards pins your harness state: which cards apply, which bundles they depend on, which inline content they ship, with byte-identical reproducibility via `card.lock` + integrity hashes.
>
> Cards does *not* pin: the agent tool versions (Claude Code, Codex, Cursor — these tools don't yet expose a version-pinning interface), MCP server runtime resolution (e.g., `npx -y <pkg>` pulls 'latest' by default), or system libraries.
>
> For full environmental reproducibility, layer cards with Flox/Nix at the shell/toolchain layer (which pins Node, Python, system libs) and document the agent tool versions in your project README. See `analyses/32_harness-cards-vs-flox-and-conda.md` §6.3 for the recommended layered composition pattern."

Being honest about the gap is the right call. Users coming from Conda/Flox already understand the layered-composition idea; cards just needs to name where it sits.

### R9. Surface the layered-composition pattern in user-facing docs

The companion report's two hybrid patterns (language lockfile inside higher-order shell; dev shell + container for deploy) extend with cards as the third pattern (§6.3): *harness pinned via cards, inside reproducible shell, with containerized services.*

Add this pattern to:

- bgng's README under a section titled "Layered reproducibility" or similar, with the diagram from §6.3.
- `02_per-project-config-guide.md` as the recommended approach when the user already uses Flox/Nix/asdf.
- The CHANGELOG or release notes for the cards v1 release.

This is the conceptual companion to R8: R8 names the gap, R9 names how to close it.

### R10. Add an optional Flox bridge in v2+ — `runtime.flox` manifest field and `--emit-flox`

The composition pattern from §6.3 is currently a documentation recommendation. For v2+, make it CLI-supported via an **optional, non-blocking bridge** that captures runtime expectations alongside cards without bundling Flox into bgng.

**Card manifest extension.** A card declares its runtime/toolchain expectations:

```json
{
  "name": "@me/backend-service",
  "version": "1.2.0",
  "runtime": {
    "flox": {
      "install": ["nodejs_24", "postgresql_16", "just"],
      "vars": { "DATABASE_URL": "postgres://localhost:5432/app" }
    }
  },
  "skills":   { "include": [...] },
  "servers":  { ... },
  "extensions": { ... },
  "targets":  { ... }
}
```

**CLI surface:**

- `bgng card apply <ref> --emit-flox` — applies the card *and* writes a Flox manifest fragment to `<project>/.flox/env/manifest.toml` (merging into an existing one if present, preserving user-owned sections).
- `bgng doctor` — gains a check: if `runtime.flox` is declared on any applied card and Flox is installed, verify the active env contains the declared packages; if Flox is not installed, surface this as informational rather than an error.

**What this does *not* do:**

- Does **not** bundle Flox with bgng. Users without Flox installed see the `runtime.flox` field and use other tools (asdf, brew, manual install) to get equivalent runtime state.
- Does **not** run `flox install` or `flox activate` automatically. Those remain explicit user actions.
- Does **not** couple cards to Nix at install time. The Flox bridge is a *publishing* feature on cards' side, *consumed* by users who already use Flox.
- Does **not** prevent cards from being used on Windows or other platforms without Flox.

**Sequencing.** v2 enhancement, after v1 ships and we observe whether users actually layer Flox alongside cards. If adoption is low, the bridge isn't worth building. If adoption is moderate-to-high, the bridge eliminates manual sync between a card's runtime expectations and the user's `manifest.toml`.

**Adds to v1.1 §13 v2 Roadmap.**

### R11. Pin MCP server versions in `args` rather than relying on `npx -y <pkg>` latest resolution

Independent of Flox, **MCP server definitions should pin versions in `args`** to close the partial-pinning gap at the MCP runtime boundary. Today's built-in `registry/mcp-servers.json` uses the unpinned form:

```jsonc
"context7": {
  "command": "npx",
  "args": ["-y", "@upstash/context7-mcp"]   // "latest" at every invocation
}
```

Recommended pinned form:

```jsonc
"context7": {
  "command": "npx",
  "args": ["-y", "@upstash/context7-mcp@1.2.3"]   // pinned
}
```

This applies to:

- Cards' inline `mcp-servers/<id>.json` definitions (a content best practice for card authors).
- The built-in `registry/mcp-servers.json` shipped with bgng (a low-priority content tightening; see §10 codebase-impact summary).
- User-library `~/.agents/bgng/mcp-servers/<id>.json` definitions (documented as user guidance).

**Trade-off:** pinned versions need periodic updates as upstream MCP servers release fixes. The build-in registry can adopt a "minor-version-pinned" middle ground (e.g., `@upstash/context7-mcp@^1.2.0`) that allows patch updates while preventing breaking-change drift. Card authors choose how strictly to pin in their own cards.

**Sequencing.** Cards v1.1 has already shipped (tasks 16–19 completion docs). This recommendation is **post-implementation content tightening** — land in a standalone PR whenever convenient. Low risk, low priority, ~6–8 line edits to `registry/mcp-servers.json`. Cards-content guidance for card authors can be added to `knowledges/03_npm-skill-bundles-guide.md` (or a new cards-authoring guide) at the same time.

---

## 9. Open Questions

1. **Is there a fourth materialization mechanism we're missing?** The three documented (directory symlinks, `_bgng` meta-block, generated-file-plus-symlink) cover the current consumer set (Claude Code, Codex, Cursor). Future consumers — e.g., a hypothetical Aider, Continue, Zed — might have their own file shapes. The architecture's extensibility for adding a fourth mechanism is currently underspecified; it lives in `cli/core/sync.ts`'s switch-on-target-name pattern. Should the materialization layer adopt a registry of mechanisms keyed by target?
2. **Does Flox's compositions model suggest improvements to cards?** Flox compositions are first-class declarative merging of multiple environments. Cards' `cards: []` is structurally similar but simpler. Worth a follow-up review of Flox's compositions documentation to see if there are patterns (named composition profiles, conditional composition) cards should adopt.
3. **Should cards' machine-scope writes be a "machine card" instead of `machine.json`?** Today, machine.json is an overlay applied outside-any-project. Conceptually, it could be modeled as a card whose name is `@machine/default` and whose `version` is mutable (or always `1.0.0` and updated in place). This would unify the merge stack to "always cards + overlay" rather than "cards + overlay OR machine + overlay." Probably v2+, but the unification is appealing.
4. **Should cards integrate with Flox as a publishable mechanism?** Flox supports publishing environments to FloxHub. A user might want their card to be discoverable as a Flox env too — installing the Flox env would install the bgng card and apply it. This is closer to the layered-stack vision (§6.2) but adds a Flox dependency on the publish side. Worth revisiting once Flox adoption is established in the target user base; v2+.
5. **Does the 8th-layer framing (§6.2) suggest a meta-tool above bgng?** If cards is the Layer-8 tool, who is the Layer-8 *manager* in the way that asdf manages multiple Layer-3 tools? Today, bgng is the only Layer-8 tool, and the question is premature. If Aider, Continue, Zed, or other AI tools eventually publish their own harness-config formats, a meta-tool might want to unify them. Out of scope for cards v1 but worth tracking.

---

## 10. Appendix

### A1. Tool-to-mechanism mapping cheat sheet

For future readers looking up "how does $TOOL handle materialization":

| Tool | Activation primitive | Per-directory? | Mixed-ownership files? |
|---|---|---|---|
| conda | PATH + env vars (shell init) | No (named envs only) | No |
| Flox | PATH + env vars + symlink profiles | Yes (`.flox/env/`) | No |
| pnpm | File-tree convention (`node_modules/` walked by Node) | Yes (per-project node_modules) | No |
| uv | PATH (venv `bin/`) + file-tree (`site-packages/`) | Yes (per-project venv) | No |
| pyenv/asdf/mise | PATH (shim) | Yes (`.tool-versions`) | No |
| direnv | env vars (shell hook) | Yes (`.envrc`) | No |
| GNU Stow | Symlinks | Yes (cwd-rooted) | No |
| chezmoi | Copy + templating + symlinks | Yes (per-machine via cwd) | Yes (templating + merging) |
| Terraform | Write into external system (cloud API) | Yes (`.tf` files) | Yes (drift detection) |
| Argo CD / Flux | Write into external system (k8s API) | Yes (Git repo path) | Yes (drift detection) |
| **Harness Cards** | **Directory symlinks + `_bgng` meta-block + generated-file-plus-symlink** | **Yes (`.agents/bgng/`)** | **Yes (Claude/Codex settings)** |

### A2. The "row 3" club (config-file injection materializers)

The third row of §5.1's table — tools that inject content into externally-controlled config locations — is a small club:

- **Dotfile managers** (Stow, chezmoi, dotbot, yadm).
- **GitOps / declarative state tools** (Terraform, Argo CD, Flux, Crossplane, OpenTofu).
- **Some configuration management** (Ansible's file/template modules in declarative mode; not Puppet/Chef's agent-pull model).
- **Harness Cards** (this design).

The common pattern: the *consumer* of the materialized content is a separate, external system the tool doesn't control (your shell; the cloud provider; the k8s cluster; the AI coding assistant). The tool's job is to converge a known target on-disk state and detect drift when the target diverges. Cards' design borrows the structural pattern from this family.

### A3. Document lifecycle

- This document is a comparison analysis, not an architecture revision. The v1.1 architecture (`29_…`) is unaffected by this analysis except for the recommended additions: the §4.2 internal-framing paragraph (R1), the partial-pinning user-facing guidance (R8), and the layered-composition pattern (R9).
- If R1, R8, R9 are accepted and v1.1 / user-facing docs are revised, this document continues to be a useful "why this design" companion to the architecture and can stay as-is.
- If new prior art emerges (a comparable tool surfaces, or one of the surveyed tools changes materially), revise this document rather than archiving it.
- This document was updated to incorporate the layered-reproducibility framing from `docs/presentations/reproducible_envs.md` after the initial draft. Further companion surveys should be similarly folded in via revision rather than supersession.

### A4. Cross-reference to the companion reproducibility survey

`docs/presentations/reproducible_envs.md` is the broader survey of reproducible-environment tooling (authored separately, surveying Nix, Flox, Conda, Docker/OCI, Bazel, npm/pnpm/Yarn, Cargo, asdf/Volta, VMs, direnv, system package managers). The companion report contributes four framings that this document carries forward:

1. **The 7-layer reproducibility stack** (§6.1) — adopted, with cards added as the 8th layer (§6.2).
2. **The 17-axis evaluation framework** for reproducibility tooling — applied to cards in §6.4.
3. **Two hybrid patterns of healthy teams** — extended with a third agent-aware pattern in §6.3.
4. **Partial pinning failure mode + provenance-vs-reproducibility distinction** — carried into §6.5 and §6.6 as honesty calls cards needs to make.

For anyone unfamiliar with the broader reproducible-environments landscape, the companion report is the authoritative primer; this document (§32) is the cards-specific extension that sits on top of it.

### A5. Codebase impact of the §32 recommendations

**Important context:** Harness Cards v1.1 has already shipped. The implementation rolled out across tasks 16–19 (see `tasks/16_completion_harness-cards-m0-m1-foundation.md`, `tasks/17_completion_harness-cards-m2-m3-materialization-safety.md`, `tasks/18_completion_harness-cards-m4-m5-card-lifecycle.md`, `tasks/19_completion_harness-cards-m6-m7-scope-diagnostics.md`) and verified at task 19 (319 tests passing, type-check clean, release-readiness clean, real-terminal smoke clean). **The §32 recommendations are therefore post-implementation enhancements, not pre-implementation requirements.** This subsection summarizes what each recommendation still implies as actionable work.

**No behavior code changes required — doc updates only:**

| Recommendation | What changes |
|---|---|
| R1 — keep marketing analogy; use "Flox + Stow" architectural framing | Add the suggested one-paragraph to `analyses/29_harness-cards-target-architecture-v1_1.md` §4.2. Pure architecture-doc edit. |
| R2 — preserve three-mechanism design under future review pressure | Process guidance for future PRs touching the materialization layer; nothing to change today. |
| R5 — do not borrow conda's solver | Anti-recommendation; nothing to change. |
| R6 — keep "uv/pnpm for harnesses"; avoid bare "package manager" framing | Audit of user-facing language in `README.md`, `knowledges/01_…`, `knowledges/02_…` returns **clean today** (no unqualified "package manager" hits). No edits required unless new language is added later. |
| R8 — document partial-pinning surface | Add a "What cards pins vs. what it doesn't" subsection to `knowledges/02_per-project-config-guide.md` and the `README.md` reproducibility section if one exists; otherwise add the section. |
| R9 — surface layered-composition pattern | Add a "Layered reproducibility" subsection to the same docs, with the §6.3 diagram. |

**v2+ deferred (add to `analyses/29_…` §13 v2 Roadmap; no code work today):**

| Recommendation | Future code work it implies |
|---|---|
| R3 — content-addressing store | Refactor store to add `~/.agents/bgng/blobs/<sha256>/` and reference blobs from card versions. |
| R4 — Stow-style strict mode | Add `--strict` flag to `bgng card apply` / `add`; escalate the §7.6 multi-card warning to a refusal when set. |
| R7 — SLSA provenance | Add `--with-provenance` to `bgng card publish` (emits in-toto attestation alongside tarball); add `--verify-provenance` to `bgng card apply` (verifies attestations during resolution). |
| R10 — Flox bridge | Add `runtime.flox` to the card manifest schema; add `--emit-flox` to `bgng card apply` (writes `<project>/.flox/env/manifest.toml` fragments); extend `bgng doctor` to check declared Flox runtime when Flox is installed. |

**Optional content tightening (a small but real code/content change, post-implementation):**

| Recommendation | Code/content change |
|---|---|
| R11 — pin MCP server versions in `args` | Update `registry/mcp-servers.json`. Today's state at the time of writing: `context7` uses `args: ["-y", "@upstash/context7-mcp"]` (unpinned ⇒ "latest" at every invocation); `chrome-devtools` uses `["-y", "chrome-devtools-mcp@latest"]` (explicitly "latest"). Both should pin to a known-good range (e.g., `@^1.0.0`) or exact version. ~6–8 line edits; no behavior change beyond version stability. Document the practice as guidance for card authors at the same time. |

**Net assessment.** Of the eleven recommendations:

- **6 are doc-only** (R1, R2, R5, R6, R8, R9): one paragraph to `analyses/29_…`, two new subsections to `knowledges/02_…` and the README, no code work.
- **4 are v2+ deferrals** (R3, R4, R7, R10): roadmap entries in `analyses/29_…` §13; substantive code work *when* v2 is on the table.
- **1 is a small content tightening** (R11): ~6–8 line edits to `registry/mcp-servers.json` plus author guidance.

The §32 recommendations imply **no architecture-level code change** to the shipped cards v1.1. R11 is the only thing in the codebase itself that warrants an edit. Everything else is doc work or future-looking roadmap. This makes the §32 work pleasantly small to land — one PR for the doc updates + R11 content tightening would close out all v1-actionable §32 recommendations in a single review cycle.
