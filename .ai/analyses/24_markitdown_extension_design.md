# MarkItDown Extension Design

## Status

Approved direction: CLI-first MarkItDown extension with guarded install.

Date: 2026-05-03

## Goal

Add Microsoft MarkItDown to the bgng extension ecosystem as a CLI-first document conversion capability that can be enabled per project and can install the global `markitdown` command through `uv` after explicit user consent.

The extension should make document-to-Markdown conversion available to agents without conflating it with the existing `markdownify-mcp` optional MCP entry.

## Investigation Summary

### Current Local State

The global command has already been installed on this machine with:

```bash
uv tool install --python 3.12 'markitdown[all]'
```

Verified local state:

- `uv --version`: `uv 0.9.12`
- `markitdown --version`: `markitdown 0.1.5`
- `command -v markitdown`: `/Users/pureicis/.local/bin/markitdown`
- `uv tool list --show-extras --show-python --show-paths` reports `markitdown v0.1.5 [extras: all] [CPython 3.12.9]`
- `markitdown README.md` streams Markdown successfully
- `printf '# Smoke\n\nhello\n' | markitdown -x md` succeeds
- `markitdown --list-plugins` reports no third-party plugins installed

One useful local finding: `uv tool list` does not support `--json` in the installed uv version. Any implementation that inspects uv tool metadata should treat the human output as advisory only, not as a stable machine-readable API.

### External Source Findings

Microsoft MarkItDown is a Python package and CLI for converting files to Markdown for LLM and text-analysis workflows. The upstream README describes support for PDF, PowerPoint, Word, Excel, images, audio, HTML, CSV/JSON/XML, ZIP files, YouTube URLs, EPUB, and more. It also states that the output is useful for text analysis and not intended as high-fidelity publishing output.

As of the 2026-05-03 investigation, PyPI lists `markitdown 0.1.5`, released February 20, 2026. PyPI lists `Requires: Python >=3.10` and optional extras including `all`, `docx`, `pptx`, `xlsx`, `xls`, `pdf`, `outlook`, `az-doc-intel`, `audio-transcription`, and `youtube-transcription`.

The MarkItDown README documents:

- install with `pip install 'markitdown[all]'`
- command-line conversion with `markitdown path-to-file.pdf > document.md`
- `-o` output files
- piped stdin conversion
- optional dependencies through extras such as `[all]`, `[pptx]`, `[docx]`, `[xlsx]`, `[xls]`, and `[pdf]`
- plugins disabled by default, with `--list-plugins` and `--use-plugins`
- security guidance: MarkItDown performs I/O with current process privileges, so untrusted files, paths, and URLs must be handled carefully

The uv docs confirm that `uv tool install` creates a persistent isolated tool environment and exposes tool executables on PATH. The docs also confirm that `--python` can request a Python version, tool executables must be in PATH, `uv tool update-shell` can add the bin directory to common shell configs, and `uv tool install` will not overwrite executables not previously installed by uv unless `--force` is used.

Primary sources:

- Microsoft MarkItDown README: https://github.com/microsoft/markitdown
- MarkItDown PyPI: https://pypi.org/project/markitdown/
- uv tools docs: https://docs.astral.sh/uv/concepts/tools/
- uv CLI reference: https://docs.astral.sh/uv/reference/cli/
- Mentor guide: `.ai/analyses/23_markitdown_global_install_guide.md`

## Existing bgng Extension Architecture

The current extension architecture is typed in code under `cli/core/extensions/`. It already supports:

- built-in extension definitions in `cli/core/extensions/registry.ts`
- command discovery and external command execution in `cli/core/extensions/commands.ts`
- status reporting in `cli/core/extensions/status.ts`
- doctor reporting in `cli/core/extensions/doctor.ts`
- project config translation in `cli/core/extensions/project-config.ts`
- setup adapters for Beads and Parallel
- project-first activation through `bgng add extension`
- explicit setup through `bgng extensions setup`

The model is intentionally semantic:

```json
{
  "version": 1,
  "extensions": {
    "parallel": {
      "enabled": true,
      "skills": true,
      "mcp": false
    }
  }
}
```

Project extension config translates into derived skills and MCP behavior at merge time. Lower-level `skills.exclude` remains authoritative when it conflicts with extension-derived includes.

This model is a good fit for MarkItDown. MarkItDown should not be represented as a raw MCP server, and agents should not need to manually include a low-level skill name when a project wants document conversion support.

## Decision

Represent MarkItDown as a built-in `markitdown` extension.

Default mode:

- CLI-first
- project-selectable
- optional repo-native skill
- no MCP server
- guarded uv installation when the CLI is missing

This makes MarkItDown closer to Parallel than Beads. It is a global command used by project-level agent workflows. Unlike Parallel, setup may install the external command because the installation path is deterministic and self-contained through `uv tool install`. Unlike Beads, MarkItDown does not own project state such as `.beads/` and does not need project-native setup recipes.

## Extension Definition

Add a third built-in extension:

```ts
{
  id: "markitdown",
  displayName: "MarkItDown",
  description: "Document-to-Markdown conversion through Microsoft's markitdown CLI.",
  scopes: ["global", "project"],
  defaultModes: ["cli", "skills"],
  commands: [
    {
      name: "markitdown",
      required: true,
      purpose: "runtime",
      installHints: [
        "uv tool install --python 3.12 'markitdown[all]'"
      ]
    },
    {
      name: "uv",
      required: false,
      purpose: "installer",
      installHints: [
        "brew install uv",
        "curl -LsSf https://astral.sh/uv/install.sh | sh"
      ]
    }
  ],
  skills: [
    {
      name: "markitdown-document-conversion",
      source: "repo",
      defaultIncluded: true
    }
  ],
  mcpServers: [],
  docs: [
    {
      label: "MarkItDown README",
      url: "https://github.com/microsoft/markitdown"
    },
    {
      label: "MarkItDown PyPI",
      url: "https://pypi.org/project/markitdown/"
    },
    {
      label: "uv tools",
      url: "https://docs.astral.sh/uv/concepts/tools/"
    }
  ]
}
```

The `purpose` field is the only proposed type extension. Existing commands default to `purpose: "runtime"` when omitted. This lets status and doctor answer a sharper question:

- runtime availability depends on required runtime commands
- installer availability matters only when setup needs to install or repair the runtime

Without this distinction, a machine with `markitdown` installed but no `uv` would look unavailable even though document conversion works.

## Project Config Model

Project config should use:

```json
{
  "version": 1,
  "extensions": {
    "markitdown": {
      "enabled": true,
      "skills": true
    }
  }
}
```

Semantics:

- `enabled: true` means this project intends to expose MarkItDown support to agents.
- `skills: true` means derive the repo-native `markitdown-document-conversion` skill.
- `skills: false` means configure the extension without deriving the skill.
- `enabled: false` excludes the derived skill.
- `skills.exclude` still wins over extension-derived includes.

No MarkItDown-specific global config block should be added in v1. The existing `defaults.extensions` shape can support future machine-wide defaults without adding a top-level `markitdown` config namespace now.

## Command Surface

### Discovery

```bash
bgng extensions list
bgng extensions show markitdown
bgng extensions status markitdown
bgng extensions doctor markitdown
```

Status should report:

- `markitdown` command availability and path
- `uv` command availability and path as installer support
- repo skill presence and curation
- project config state when a project config is discovered
- warnings for missing runtime command or missing skill

Doctor should report:

- missing `markitdown` runtime as an issue
- missing `uv` as an issue only when `markitdown` is missing or setup installation is requested
- failed `markitdown --version` as an issue
- failed stdin smoke conversion as an issue
- missing repo skill as an issue
- uv tool metadata as informational when available, but not required

### Project Activation

```bash
bgng add extension markitdown
bgng add extension markitdown --skip-skills
```

This should write semantic project config only. It should not install the CLI. The next-step hints should point to:

```bash
bgng extensions setup markitdown
bgng write --dry-run
```

### Setup

```bash
bgng extensions setup markitdown
bgng extensions setup markitdown --dry-run
bgng extensions setup markitdown --install
bgng extensions setup markitdown --no-install
bgng extensions setup markitdown --skip-skills
```

Setup responsibilities:

1. Build a plan.
2. If `markitdown` is already available, do not prompt and do not reinstall.
3. If `markitdown` is missing and `--install` is provided, run:

   ```bash
   uv tool install --python 3.12 'markitdown[all]'
   ```

   The implementation must spawn this as an argv array, not through a shell:

   ```ts
   ["uv", "tool", "install", "--python", "3.12", "markitdown[all]"]
   ```

   That avoids zsh globbing problems without relying on quotes.

4. If `markitdown` is missing and `--no-install` is provided, do not install.
5. If `markitdown` is missing and neither flag is provided:
   - in a TTY, ask once: `Install MarkItDown with uv now? [y/N]`
   - default is no
   - in non-TTY mode, fail with a usage error asking for `--install` or `--no-install`
6. Write semantic project config unless `--dry-run` is set.
7. After attempted install, re-check `markitdown` on PATH.
8. If uv installed the tool but the command is still not on PATH, report `uv tool update-shell` and the output of `uv tool dir --bin` if available.

This preserves bgng's safety model:

- dry-run previews commands
- scripts must opt in with `--install`
- interactive terminals get one explicit decision
- no hidden global package mutation happens just because an extension exists in the registry

## Skill Strategy

Create:

```text
skills/shared/markitdown-document-conversion/SKILL.md
```

The skill should teach agents:

- when to use MarkItDown
- how to check availability with `command -v markitdown`
- how to convert files:

  ```bash
  markitdown input.pdf -o output.md
  markitdown input.docx -o output.md
  markitdown input.pptx -o output.md
  cat input.pdf | markitdown -x pdf > output.md
  ```

- how to preserve safety:
  - do not run with `sudo`
  - use a controlled working directory for untrusted files
  - do not pass untrusted URLs without explicit user approval
  - do not enable plugins unless the user asks
- how to surface missing install:

  ```bash
  bgng extensions setup markitdown --install
  ```

The skill should stay short. It is an operating guide for agents, not a full MarkItDown manual.

## Relationship To markdownify-mcp

The existing `markdownify` registry entry refers to `markdownify-mcp`, a local MCP server with:

```json
"command": "node",
"args": ["markdownify-mcp/dist/index.js"]
```

MarkItDown should not replace or rename this entry in v1.

Keep the distinction clear:

- `markitdown`: CLI extension for broad file-to-Markdown conversion
- `markdownify`: optional local MCP dependency, currently documented as `markdownify-mcp`

Future work can decide whether `markdownify-mcp` should become an extension or be deprecated. That is outside this slice.

## Error Handling

Use `UsageError` for invalid command usage:

- unknown extension
- conflicting `--install` and `--no-install`
- missing `uv` when installation was requested
- missing `markitdown` in non-TTY setup without an explicit install decision

Use normal command output with warnings when the operation is valid but incomplete:

- user declined install
- `--no-install` selected while runtime is missing
- project config was written but runtime remains unavailable
- uv installed successfully but PATH does not expose `markitdown`

Do not parse uv's human output as authoritative. Use `findCommand("markitdown")` after install as the source of truth for whether the current process can execute it.

## Testing Strategy

Use fake executables. Automated tests must not depend on real `uv` or real `markitdown`.

Important tests:

- registry lists `beads`, `parallel`, `markitdown`
- MarkItDown definition includes runtime command, installer command, skill, docs, and no MCP servers
- project config merge derives `markitdown-document-conversion`
- explicit project skill excludes win
- `add extension markitdown` writes `{ enabled: true, skills: true }`
- `add extension markitdown --skip-skills` writes `{ enabled: true, skills: false }`
- setup dry-run does not execute fake uv
- setup with runtime already installed does not prompt and does not execute uv
- setup with missing runtime and `--install` executes fake uv install command
- setup with missing runtime and `--no-install` does not execute fake uv
- setup with missing runtime in non-TTY and no explicit flag exits non-zero
- prompt accepted path installs
- prompt declined path does not install
- missing uv with `--install` exits non-zero
- doctor reports missing runtime
- doctor passes fake version and stdin smoke conversion
- docs readiness covers MarkItDown extension docs
- full suite and typecheck pass

Interactive prompt tests can be handled either by extracting pure mode resolution into `cli/core/interactivity.ts` or by spawning the CLI with a TTY-capable test helper. Prefer pure resolution tests plus command tests for explicit `--install` and `--no-install`; add one interactive smoke test only if it remains stable in Bun.

## Non-Goals

Do not implement these in the first slice:

- MarkItDown MCP server support
- plugin management
- `markitdown-ocr` installation
- Azure Document Intelligence configuration
- version pinning UI
- automatic upgrades
- uninstall command
- guided `bgng init` prompt for MarkItDown
- replacing `markdownify-mcp`
- converting files through bgng itself

## Verification

After implementation, run:

```bash
bun test test/core-extensions.test.ts test/core-project.test.ts test/commands-add-extension.test.ts test/commands-extensions.test.ts
bun test test/docs-readiness.test.ts
bun test
bun run typecheck
bun run verify:release --json
```

Manual local checks after the code lands:

```bash
bgng extensions show markitdown
bgng extensions status markitdown
bgng extensions doctor markitdown
bgng extensions setup markitdown --dry-run
bgng add extension markitdown --dry-run
markitdown --version
printf '# Smoke\n\nhello\n' | markitdown -x md
```
