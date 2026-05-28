# Guidebook: Install Microsoft MarkItDown as a global CLI using `uv`

The cleanest `uv` equivalent of:

```bash
pip install 'markitdown[all]'
```

is:

```bash
uv tool install --python 3.12 'markitdown[all]'
```

That installs `markitdown` as a **user-wide CLI tool** in an isolated `uv` tool environment, then exposes the `markitdown` executable on your shell `PATH`. This is the right `uv` pattern because `uv tool install` is designed for persistent command-line tools, while `uvx` / `uv tool run` is for one-off execution. uv’s docs describe this as installing a tool to a persistent environment and adding its executable to `PATH`; installed tools remain isolated from your projects and system Python. ([GitHub][1])

---

## 1. What you are installing

MarkItDown is Microsoft’s Python package and command-line utility for converting files to Markdown, especially for indexing, text analysis, and LLM workflows. It supports formats including PDF, PowerPoint, Word, Excel, images, audio, HTML, CSV/JSON/XML, ZIP, YouTube URLs, EPUB, and more. The project explicitly says the output is often human-friendly but is primarily intended for text-analysis pipelines, not high-fidelity document publishing. ([GitHub][2])

Current package metadata on PyPI lists:

```text
Package: markitdown
Latest observed version: 0.1.5
Requires: Python >=3.10
```

PyPI also lists optional extras including `all`, `docx`, `pptx`, `xlsx`, `pdf`, `outlook`, `az-doc-intel`, `audio-transcription`, and `youtube-transcription`. ([PyPI][3])

---

# 2. Recommended installation path

## Step 1 — Install `uv`

On macOS, I would use Homebrew:

```bash
brew install uv
```

uv’s official installation docs list Homebrew as a supported macOS installation method. ([Astral Docs][4])

Alternatively, use uv’s standalone installer:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

The standalone installer is also official, and uv’s docs note that you can inspect the script before running it. ([Astral Docs][4])

Verify:

```bash
uv --version
uvx --version
```

---

## Step 2 — Make sure uv’s tool bin directory is on `PATH`

Run:

```bash
uv tool update-shell
```

Then restart your terminal, or reload your shell config:

```bash
exec zsh
```

For Bash:

```bash
exec bash
```

uv’s docs state that tool executables must be in the shell `PATH`, and that `uv tool update-shell` can add the executable directory to common shell config files. ([Astral Docs][5])

You can inspect where uv will place tool executables:

```bash
uv tool dir --bin
```

And inspect where tool environments live:

```bash
uv tool dir
```

uv’s storage docs say tool environments live under uv’s tool directory, while executables are stored in the tool executable directory. ([GitHub][6])

---

## Step 3 — Install MarkItDown globally as a CLI

### Best all-purpose install

```bash
uv tool install --python 3.12 'markitdown[all]'
```

Use quotes around `'markitdown[all]'`. Shells such as `zsh` can treat square brackets as glob patterns, so quoting avoids confusing shell expansion. The MarkItDown README itself quotes the extras form when showing installation with all optional dependencies. ([GitHub][2])

Why `--python 3.12`?

MarkItDown requires Python 3.10 or higher, and its own README shows a uv example using Python 3.12 for a virtual environment. ([GitHub][2]) uv also supports selecting a Python version for tool installation with `--python`. ([GitHub][1])

---

# 3. Lean install options

The `[all]` extra is convenient, but it installs every optional dependency. If your main target is Office documents, install only DOCX/PPTX support:

```bash
uv tool install --python 3.12 'markitdown[docx,pptx]'
```

For DOCX, PPTX, XLSX, and PDF:

```bash
uv tool install --python 3.12 'markitdown[docx,pptx,xlsx,pdf]'
```

MarkItDown’s README says optional dependencies can be installed individually, and specifically gives `docx` and `pptx` as available extras. ([GitHub][2])

My recommendation:

```bash
uv tool install --python 3.12 'markitdown[docx,pptx,xlsx,pdf]'
```

Use `[all]` only when you also want audio transcription, YouTube transcript support, Outlook messages, Azure Document Intelligence integrations, and other extras.

---

# 4. Verify the global command

After installation:

```bash
which markitdown
markitdown --help
uv tool list
```

`uv tool list` shows installed uv-managed tools. uv’s docs describe it as the command for listing tools installed with `uv tool install`. ([Mintlify][7])

You should be able to run:

```bash
markitdown path/to/file.docx -o output.md
```

or:

```bash
markitdown path/to/file.pptx > output.md
```

The MarkItDown README documents both output styles: redirecting stdout and using `-o` for an output file. ([GitHub][2])

---

# 5. Quick smoke test

Create a test directory:

```bash
mkdir -p ~/markitdown-test
cd ~/markitdown-test
```

Convert a file:

```bash
markitdown ~/Desktop/example.docx -o example.md
```

Open the result:

```bash
code example.md
```

or:

```bash
open -a "Visual Studio Code" example.md
```

For PowerPoint:

```bash
markitdown ~/Desktop/deck.pptx -o deck.md
```

For stdout:

```bash
markitdown ~/Desktop/deck.pptx | less
```

For piped input, MarkItDown also documents this pattern:

```bash
cat path-to-file.pdf | markitdown
```

([GitHub][2])

---

# 6. One-off usage without installing globally

Use this when you only want to test MarkItDown:

```bash
uvx --from 'markitdown[docx,pptx]' markitdown path/to/file.docx -o output.md
```

or:

```bash
uvx --from 'markitdown[all]' markitdown path/to/file.pdf -o output.md
```

`uvx` is an alias for `uv tool run`, and uv’s docs describe it as running tools in temporary, isolated environments. ([Astral Docs][8])

Use this for testing. Use `uv tool install` for a command you want available permanently.

---

# 7. Upgrade MarkItDown later

Upgrade only MarkItDown:

```bash
uv tool upgrade markitdown
```

Upgrade all uv-installed tools:

```bash
uv tool upgrade --all
```

uv’s docs say `uv tool upgrade` upgrades a tool and respects the version constraints used during installation. ([GitHub][1])

If you want to change extras or Python version, reinstall with `--force`:

```bash
uv tool install --force --python 3.12 'markitdown[all]'
```

That is useful if you originally installed:

```bash
uv tool install 'markitdown[docx,pptx]'
```

and later decide you want every optional dependency.

---

# 8. Pin a specific MarkItDown version

To install a known version:

```bash
uv tool install --python 3.12 'markitdown[all]==0.1.5'
```

To constrain to a version range:

```bash
uv tool install --python 3.12 'markitdown[all]>=0.1,<0.2'
```

uv’s tools guide says package versions and constraints can be included directly when installing a tool. ([GitHub][1])

This is useful for reproducible workflows or if a later release changes conversion behavior.

---

# 9. Install from GitHub source using uv

For the latest GitHub version rather than the PyPI release:

```bash
uv tool install --python 3.12 'git+https://github.com/microsoft/markitdown.git#subdirectory=packages/markitdown'
```

For extras from the source subdirectory, try:

```bash
uv tool install --python 3.12 'markitdown[all] @ git+https://github.com/microsoft/markitdown.git#subdirectory=packages/markitdown'
```

Use the PyPI install unless you specifically need unreleased changes. The MarkItDown repo is a monorepo, and its README shows the Python package living under `packages/markitdown`. ([GitHub][2]) uv’s tools guide supports installing tools from package sources such as Git repositories. ([GitHub][1])

---

# 10. Add plugins or companion dependencies

MarkItDown supports third-party plugins, but they are disabled by default. The CLI can list installed plugins:

```bash
markitdown --list-plugins
```

and enable plugins during conversion:

```bash
markitdown --use-plugins path/to/file.pdf -o output.md
```

The README documents both plugin commands. ([GitHub][2])

To install a plugin into the same uv tool environment, use uv’s `--with` option:

```bash
uv tool install --force --python 3.12 \
  --with markitdown-ocr \
  --with openai \
  'markitdown[all]'
```

uv’s tools docs say additional packages can be included during tool installation with `--with`, and the option can be provided multiple times. ([Astral Docs][5])

For OCR-like plugin workflows, note that MarkItDown’s README describes `markitdown-ocr` as a plugin that can add OCR support for embedded images in PDF, DOCX, PPTX, and XLSX converters using an LLM Vision client. ([GitHub][2])

---

# 11. Uninstall MarkItDown

```bash
uv tool uninstall markitdown
```

This removes the isolated tool environment and unlinks the executable. uv’s command docs describe `uv tool uninstall` as removing installed tools and their isolated environments. ([Mintlify][9])

Check:

```bash
uv tool list
which markitdown
```

---

# 12. Troubleshooting

## Problem: `markitdown: command not found`

Run:

```bash
uv tool update-shell
exec zsh
```

Then:

```bash
which markitdown
```

If still broken:

```bash
uv tool dir --bin
echo $PATH
```

The executable directory must be on `PATH`; uv warns about this and provides `uv tool update-shell` to fix common shell configs. ([Astral Docs][5])

---

## Problem: `zsh: no matches found: markitdown[all]`

You forgot quotes.

Use:

```bash
uv tool install --python 3.12 'markitdown[all]'
```

Not:

```bash
uv tool install --python 3.12 markitdown[all]
```

---

## Problem: `uv tool install` refuses to overwrite an existing command

Check what already owns the command:

```bash
which markitdown
uv tool list
```

Then either uninstall the existing install, or force uv to overwrite:

```bash
uv tool install --force --python 3.12 'markitdown[all]'
```

uv’s docs say `uv tool install` will not overwrite executables it did not previously install, and that `--force` can override this behavior. ([Astral Docs][5])

---

## Problem: Missing support for a file type

You probably installed a lean extra set.

Reinstall with `[all]`:

```bash
uv tool install --force --python 3.12 'markitdown[all]'
```

Or install the relevant extras:

```bash
uv tool install --force --python 3.12 'markitdown[docx,pptx,xlsx,pdf]'
```

MarkItDown exposes file-format support through optional extras such as `docx`, `pptx`, `xlsx`, and `pdf`. ([GitHub][2])

---

## Problem: Installed tool uses the wrong Python

Inspect:

```bash
uv tool list
```

Then reinstall with an explicit Python:

```bash
uv tool install --force --python 3.12 'markitdown[all]'
```

uv’s docs say each tool environment is linked to a specific Python version and that `--python` can request a specific version. ([Astral Docs][5])

---

# 13. Security notes

Do not feed untrusted files, URLs, or paths into MarkItDown in privileged contexts.

The MarkItDown README warns that MarkItDown performs I/O with the privileges of the current process, can access resources the process can access, and recommends sanitizing inputs in untrusted environments. It also recommends using the narrowest conversion API possible when embedding MarkItDown in applications. ([GitHub][2])

For local CLI usage, practical precautions are:

```bash
mkdir -p ~/safe-convert
cp ~/Downloads/suspicious.docx ~/safe-convert/
cd ~/safe-convert
markitdown suspicious.docx -o suspicious.md
```

Avoid running conversion commands with `sudo`.

---

# 14. Recommended final setup

For your earlier DOCX/PPTX-to-Markdown workflow, install this:

```bash
brew install uv
uv tool update-shell
exec zsh
uv tool install --python 3.12 'markitdown[docx,pptx,xlsx,pdf]'
```

Verify:

```bash
markitdown --help
uv tool list
```

Use:

```bash
markitdown input.docx -o output.md
markitdown input.pptx -o output.md
```

For maximum format coverage:

```bash
uv tool install --force --python 3.12 'markitdown[all]'
```

My default recommendation is:

```bash
uv tool install --python 3.12 'markitdown[docx,pptx,xlsx,pdf]'
```

It gives you the most relevant Office/PDF coverage without pulling in every optional MarkItDown integration.

[1]: https://github.com/astral-sh/uv/blob/main/docs/guides/tools.md "uv/docs/guides/tools.md at main · astral-sh/uv · GitHub"
[2]: https://github.com/microsoft/markitdown "GitHub - microsoft/markitdown: Python tool for converting files and office documents to Markdown. · GitHub"
[3]: https://pypi.org/project/markitdown/ "markitdown · PyPI"
[4]: https://docs.astral.sh/uv/getting-started/installation/ "Installation | uv"
[5]: https://docs.astral.sh/uv/concepts/tools/ "Tools | uv"
[6]: https://github.com/astral-sh/uv/blob/main/docs/reference/storage.md?utm_source=chatgpt.com "uv/docs/reference/storage.md at main · astral-sh/uv"
[7]: https://mintlify.com/astral-sh/uv/cli/tool-list?utm_source=chatgpt.com "uv tool list"
[8]: https://docs.astral.sh/uv/guides/tools/?utm_source=chatgpt.com "Using tools | uv"
[9]: https://mintlify.com/astral-sh/uv/cli/tool-uninstall?utm_source=chatgpt.com "uv tool uninstall"
