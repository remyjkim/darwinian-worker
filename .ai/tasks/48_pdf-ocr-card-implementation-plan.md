# ABOUTME: Plan for packaging the PDF->Markdown OCR workflow (marker-pdf + force_ocr) into a reusable drwn Harness Card (@remyjkim/pdf-ocr-card).
# ABOUTME: Captures target state, alternatives considered, the verified CLI authoring sequence, and a phased execution plan.

# Task 48 — Implementation Plan: `@remyjkim/pdf-ocr-card`

**Status**: Completed — published @remyjkim/pdf-ocr-card@1.0.0 (see 48_completion_pdf-ocr-card.md)
**Created**: 2026-06-18
**Updated**: 2026-06-18
**Assigned**: Remy + Claude
**Priority**: Medium
**Estimated Effort**: 0.5–1 day (skill + wrapper script authoring, probe, publish)
**Dependencies**: drwn `card new`, `card source add-skill --from`, `card source doctor`, `card apply file:`, `drwn write`; `uv` on PATH; `marker-pdf` (installed via uv at run time)
**References**: [.ai/knowledges/11_card-usage-guide.html, skills/shared/markitdown-document-conversion/SKILL.md, skills/shared/systematic-debugging/find-polluter.sh, skills/shared/writing-skills/SKILL.md, cli/commands/card/new.ts, cli/commands/card/source/add-skill.ts, cli/commands/card/source/doctor.ts, cli/commands/card/apply.ts, cli/commands/write.ts, registry/mcp-servers.json]

---

## Objective

Produce a single, publishable Harness Card — `@remyjkim/pdf-ocr-card` — that encapsulates the PDF→Markdown OCR workflow we just executed against the Ernest Ryu chapter decks, so any project can adopt it with one `drwn card apply` and reliably reproduce high-fidelity conversion (text **and** equations/figures OCR'd, minimal information loss). The card bundles one skill (`marker-pdf-conversion`) plus an executable wrapper script that self-installs `marker-pdf` and runs the verified `--force_ocr --redo_inline_math` recipe.

## Target State

- A card source at `~/.agents/drwn/sources/@remyjkim/pdf-ocr-card/` with `card.json` listing `marker-pdf-conversion` under `skills.include` and `card.json.servers` **empty** (no MCP — see Alternatives, Option C).
- The skill directory contains `SKILL.md` plus `scripts/convert-pdf.sh` (mode 755), where the script:
  - checks for `marker_single` on PATH and, if absent, runs `uv tool install --python 3.12 marker-pdf`;
  - converts a single PDF *or* every PDF in a directory via `marker_single … --force_ocr --redo_inline_math --output_dir <out>`;
  - leaves output as `<out>/<stem>/<stem>.md` plus extracted figure images.
- `drwn card source doctor @remyjkim/pdf-ocr-card --json` reports `ok: true`.
- In a scratch project: `drwn init --non-interactive` → `drwn card apply file:$HOME/.agents/drwn/sources/@remyjkim/pdf-ocr-card` → `drwn write --dry-run --json` shows the skill planned for materialization into `.claude/skills/marker-pdf-conversion/`, no manifest errors, and the bundled `scripts/convert-pdf.sh` reachable through the materialized symlink.
- A fresh Claude Code session in that project, asked to "convert these PDFs to markdown with equations", triggers the skill and runs the wrapper to produce LaTeX-bearing Markdown.

## Success Criteria

- [ ] `SKILL.md` is valid (frontmatter is **only** `name` + `description`; total frontmatter ≤ 1024 chars) and encodes the load-bearing knowledge: the uv/Python-3.12 install gotcha, the `--force_ocr --redo_inline_math` requirement, output layout, and the `--use_llm` escalation path.
- [ ] `scripts/convert-pdf.sh` is executable (755), has a `#!/usr/bin/env bash` shebang + usage header, runs `set -euo pipefail`, and works for both a single-file and a directory-of-PDFs argument.
- [ ] `drwn card source doctor` is green; no orphaned/missing skills, no manifest schema violations.
- [ ] Card applies cleanly to a fresh empty project; `drwn write --dry-run --json` includes `marker-pdf-conversion` in the planned skill set with zero warnings.
- [ ] End-to-end probe: running the materialized `scripts/convert-pdf.sh` on a real math-heavy PDF (reuse `rl-resources/ernestryu/pdfs/chapter3.pdf`) yields Markdown containing `$$…$$`/`$…$` LaTeX (e.g. the RLHF reward-model loss) and extracted figure images — matching the quality we got ad hoc.
- [ ] Card is published to the local store via `drwn card publish @remyjkim/pdf-ocr-card` (git-remote push is an optional follow-up).

## Alternatives Considered

### Option A — Skill + bundled wrapper script (CHOSEN)

Author `marker-pdf-conversion` as a self-contained skill whose `SKILL.md` describes *when* to convert and delegates the *how* to a bundled `scripts/convert-pdf.sh` that owns the install-check and the exact marker invocation.

- **Pro**: The hard-won recipe (uv/py3.12 install, `--force_ocr --redo_inline_math`, output layout) lives in one tested script, not re-typed by the model each time. Deterministic and reproducible.
- **Pro**: Mirrors the established repo pattern — `systematic-debugging` ships `find-polluter.sh` (755) alongside its `SKILL.md`; we copy that exactly.
- **Pro**: Pure skill packaging; no harness code changes, no MCP lifecycle.
- **Con**: A bundled script is one more file to maintain and keep executable through materialization. Mitigated by `card source doctor` validation + the probe.

### Option B — Skill-only, inline commands (no bundled script)

Encode the commands directly in `SKILL.md` (like `markitdown-document-conversion` does) and let the model type them each time.

- **Pro**: Simplest possible card; nothing to keep executable.
- **Con**: The model re-derives the multi-step install + flags every run; higher chance of dropping `--force_ocr`/`--redo_inline_math` (the exact regression we hit, where the default text-layer path silently loses math-font glyphs). Reproducibility depends on prose discipline, not a tested artifact.

### Option C — Wrap `marker_single` as an MCP server

Add a `marker` entry to the MCP library and `drwn card source add-mcp` it into the card.

- **Pro**: Uniform "tool surface" framing.
- **Con**: Rejected. Per `cli/core/mcp-library.ts` + `registry/mcp-servers.json`, an MCP entry registers a persistent server process or HTTP/SSE endpoint with transport/auth — for stateful remote tool surfaces (context7, slack). `marker_single` is a one-shot local CLI the model already invokes via Bash. Wrapping it in an MCP server adds a process + registry entry + lifecycle for zero new capability (YAGNI). `card.json.servers` stays empty.

### Option D — Register marker as a `drwn extension` (like markitdown)

The `markitdown` skill surfaces install via `drwn extensions setup markitdown --install`. We could add a `marker` extension so install is harness-managed instead of self-installed by the wrapper.

- **Pro**: Consistent install UX with the existing markitdown skill; centralizes the uv/py3.12 pin in the extension definition.
- **Con**: Touches harness extension code/registration — out of scope for *this* card task. Deferred to an Open Question; the wrapper's self-install is sufficient and self-contained for v1.0.0.

**Decision (2026-06-18):** Option A. Bundle a tested wrapper script (Option B's reproducibility gap is the precise failure mode we observed), no MCP (Option C), with the extension route (Option D) tracked as a follow-up.

## Approach

### Conversion recipe (the knowledge to encode)

This is the verified workflow, distilled from the Ernest Ryu run (412 pages across 3 decks):

```bash
# 1. marker-pdf needs torch; Python 3.14 has no compatible wheels. Pin 3.12.
uv tool install --python 3.12 marker-pdf      # one-time; installs marker_single on PATH

# 2. Convert. force_ocr + redo_inline_math are REQUIRED:
#    the default path trusts the PDF text layer and DROPS math-font glyphs
#    (italic variables, subscripts), which is worse than no conversion for math docs.
marker_single input.pdf \
  --force_ocr \           # re-OCR every page via surya instead of the broken text layer
  --redo_inline_math \    # emit inline math as LaTeX ($...$ / $$...$$)
  --output_dir out/       # -> out/input/input.md  + extracted figure images

# 3. Batch a directory of PDFs:
for f in pdfs/*.pdf; do
  marker_single "$f" --force_ocr --redo_inline_math --output_dir mds/
done
```

Notes baked into the skill body:
- **Output layout**: `marker_single foo.pdf --output_dir out/` writes `out/foo/foo.md` (a per-stem subdir) plus `_page_*_Figure_*.jpeg` figure images referenced inline as `![](…)`.
- **Performance**: force-OCR is ~6–7 s/page on Apple-Silicon CPU (surya). A `TableRecEncoderDecoderModel is not compatible with mps … Defaulting to cpu` warning is benign.
- **Escalation**: a handful of un-nameable glyphs (e.g. a custom terminal-state symbol) OCR to best-guess `\text{...}` placeholders. For maximum fidelity on critical equations, re-run affected pages with `--use_llm` (needs an LLM service / API key) — documented as an optional step, not the default.

### Card-source authoring mechanics (verified against CLI source)

The minimal, verified command sequence (flags confirmed in `cli/commands/…`):

```bash
# Create the editable source (no git working repo for a local-only card).
drwn card new @remyjkim/pdf-ocr-card --no-git

# Describe it (surfaces in `card show`).
drwn card source set @remyjkim/pdf-ocr-card \
  --description "PDF -> Markdown OCR with LaTeX equations and figures via marker-pdf (force_ocr)."

# Stage the skill (SKILL.md + scripts/convert-pdf.sh), then add it.
drwn card source add-skill @remyjkim/pdf-ocr-card marker-pdf-conversion \
  --from /tmp/pdf-ocr-staging/marker-pdf-conversion
# (re-add during iteration with --replace; preview with --dry-run --json)

# Validate.
drwn card source doctor @remyjkim/pdf-ocr-card --json   # expect ok: true
```

`add-skill` copies the whole staged dir into `sources/@remyjkim/pdf-ocr-card/skills/marker-pdf-conversion/` and appends the name to `card.json.skills.include`; auxiliary files (our `scripts/`) travel with it.

### Iteration workflow (no publish needed)

`file:` refs use range `*` and re-resolve on every `drwn write`, so the loop is tight:

```bash
mkdir -p /tmp/pdf-ocr-test && cd /tmp/pdf-ocr-test
drwn init --non-interactive
drwn card apply file:$HOME/.agents/drwn/sources/@remyjkim/pdf-ocr-card
drwn write --dry-run        # inspect the planned symlink
drwn write
# edit SKILL.md / convert-pdf.sh in the source (or re-stage + add-skill --replace), then `drwn write` again
```

Publish only when ready to pin/distribute (Scenario B): `drwn card source set … --version 1.0.0` → `drwn card publish @remyjkim/pdf-ocr-card`.

## Implementation Plan

### Phase 1: Author the skill + wrapper script

- [ ] Create staging dir `/tmp/pdf-ocr-staging/marker-pdf-conversion/{,scripts/}`.
- [ ] Write `SKILL.md` (frontmatter = name + description only) per the Appendix A scaffold.
- [ ] Write `scripts/convert-pdf.sh` per Appendix A; `chmod 755`.
- [ ] Lint the script: `bash -n scripts/convert-pdf.sh` and `shellcheck` if available.

### Phase 2: Build the card source

- [ ] `drwn card new @remyjkim/pdf-ocr-card --no-git`.
- [ ] `drwn card source set … --description "…"`.
- [ ] `drwn card source add-skill @remyjkim/pdf-ocr-card marker-pdf-conversion --from /tmp/pdf-ocr-staging/marker-pdf-conversion`.
- [ ] `drwn card source doctor @remyjkim/pdf-ocr-card --json` → confirm `ok: true`; confirm `card.json.servers` is empty.
- [ ] Verify the staged `scripts/convert-pdf.sh` retained mode 755 inside the source dir.

### Phase 3: Apply to a scratch project + dry-run

- [ ] `cd /tmp/pdf-ocr-test && drwn init --non-interactive`.
- [ ] `drwn card apply file:$HOME/.agents/drwn/sources/@remyjkim/pdf-ocr-card`.
- [ ] `drwn write --dry-run --json` → confirm `marker-pdf-conversion` planned, zero warnings.
- [ ] `drwn write` → confirm `.claude/skills/marker-pdf-conversion/` symlink resolves and `scripts/convert-pdf.sh` is reachable + executable through it.

### Phase 4: End-to-end conversion probe

- [ ] From the scratch project, run `.claude/skills/marker-pdf-conversion/scripts/convert-pdf.sh /Users/pureicis/dev/ai-narratives/rl-resources/ernestryu/pdfs/chapter3.pdf /tmp/pdf-ocr-probe-out`.
- [ ] Assert output `/tmp/pdf-ocr-probe-out/chapter3/chapter3.md` contains LaTeX (`grep -q '\$\$' …`) including the RLHF reward-model loss, and that figure images were extracted.
- [ ] Smoke test in a fresh Claude Code session: prose request "convert these PDFs to markdown, keep the equations" triggers the skill and runs the wrapper.

### Phase 5: Publish (optional, when stable)

- [ ] `drwn card source set @remyjkim/pdf-ocr-card --version 1.0.0`.
- [ ] `drwn card publish @remyjkim/pdf-ocr-card` (record the published hash).
- [ ] (Optional) `drwn card remote add` + `drwn card push`.

## Acceptance Criteria

- [ ] `drwn card source doctor` green; `card.json.skills.include` = `["marker-pdf-conversion"]`; `card.json.servers` empty.
- [ ] `drwn write --dry-run --json` in a fresh project lists the skill with no warnings.
- [ ] Probe Markdown contains `$…$`/`$$…$$` LaTeX and `![](…)` figure refs.
- [ ] Skill auto-triggers from a prose conversion request in Claude Code.
- [ ] Wrapper script self-installs marker on a machine where `marker_single` is absent (test by temporarily shadowing PATH, or document the manual check).

## Testing Strategy

- **Source validation**: `drwn card source doctor … --json` after every `add-skill` (catches manifest/orphan issues).
- **Materialization**: `drwn write --dry-run --json` asserts the plan before applying; `drwn write` then real symlink check.
- **Functional**: reuse `rl-resources/ernestryu/pdfs/chapter3.pdf` (known-good, math-heavy, 78 pp) as the golden input; assert LaTeX + figures in output. This is a real-data E2E test (no mocks), consistent with the repo's testing rules.
- **Trigger quality**: in-session prose + (if supported) `/marker-pdf-conversion` slash cue lands on the skill.

## Risks & Mitigation

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| `uv tool install` picks an incompatible Python (e.g. 3.14) and torch fails | Medium | Pin `--python 3.12` explicitly in the wrapper; document the gotcha in SKILL.md. |
| Model omits `--force_ocr`/`--redo_inline_math` and silently produces math-lossy output | Medium | Flags are hard-coded in the wrapper script, not left to the model (Option A's whole point). |
| Bundled script loses its executable bit through staging/materialization | Low | `chmod 755` before `add-skill`; verify in source + through the materialized symlink in Phase 2/3. |
| Frontmatter drift (extra keys) fails the spec / writing-skills lint | Low | Keep frontmatter to `name` + `description` only; doctor + manual check. |
| First-run latency surprises users (force-OCR ~7 s/page) | Low | Note expected timing + the benign MPS-fallback warning in SKILL.md. |
| `--use_llm` escalation needs an API key not present | Low | Documented as optional; default path is fully local. |

## Open Questions

- **Extension vs. self-install (Option D)**: should marker install be promoted to a `drwn extensions setup marker --install` flow to match `markitdown`, centralizing the uv/py3.12 pin? Recommend deferring to a follow-up task; v1.0.0 ships the self-installing wrapper.
- **Card scope**: keep this a single-skill card, or seed a broader `@remyjkim/doc-conversion-card` that also absorbs the existing `markitdown-document-conversion` skill? YAGNI → single skill now; revisit if a second converter skill appears.
- **Script default DPI / `--use_llm` toggle**: expose as wrapper flags now, or add only when needed? Default to no extra flags; add on demand.

## Notes

- No MCP server is involved; this is a skill + script card (verified against `cli/core/mcp-library.ts` and `registry/mcp-servers.json`).
- CLI flags in this plan were verified against the actual command sources, not just the usage guide. Minor guide discrepancies noted during research (e.g. `drwn write` also supports `--skills-only`/`--target`; `card apply` supports `--write` to chain a write; `drwn init` also takes `--minimal`) do not affect this plan's command sequence.
- A sibling `48_completion_pdf-ocr-card.md` should capture the published hash and probe output once executed.

## Appendix A — Skill scaffold

`SKILL.md`:

```markdown
---
name: marker-pdf-conversion
description: Use when converting PDFs (especially equation-heavy, scanned, or slide-deck PDFs) to Markdown with OCR'd text and LaTeX math via marker-pdf, to minimize information loss from figures and rendered equations.
---

# Marker PDF → Markdown (OCR + equations)

Use the bundled `scripts/convert-pdf.sh` to convert a PDF (or a directory of PDFs) to
Markdown with text **and** equations OCR'd into LaTeX, plus extracted figure images.
Prefer this over plain text extraction whenever math fidelity matters — the default PDF
text layer drops math-font glyphs.

## Workflow

1. Check availability:

   ```bash
   command -v marker_single && marker_single --help >/dev/null && echo ok
   ```

2. Convert (the script self-installs marker-pdf via uv on first run):

   ```bash
   # single file -> OUTDIR/<stem>/<stem>.md (+ figure images)
   ./scripts/convert-pdf.sh input.pdf out/

   # every *.pdf in a directory
   ./scripts/convert-pdf.sh pdfs/ mds/
   ```

3. Output layout: `out/<stem>/<stem>.md` with inline `![](…)` figure refs and
   `$…$` / `$$…$$` LaTeX equations.

## Notes

- marker-pdf needs torch; install pins Python 3.12 (3.14 has no compatible wheels).
- The script always passes `--force_ocr --redo_inline_math` — required for faithful math.
- force-OCR runs ~6–7 s/page on CPU; a `TableRec… not compatible with mps` warning is benign.
- For critical equations OCR'd as `\text{...}` placeholders, re-run affected pages with
  `--use_llm` (needs an LLM service / API key). Not the default.

## Safety

- Do not run with sudo. Treat untrusted PDFs as unsafe input; convert in a controlled dir.
```

`scripts/convert-pdf.sh` (chmod 755):

```bash
#!/usr/bin/env bash
# Convert a PDF (or every *.pdf in a directory) to Markdown with OCR'd text + LaTeX math.
# Usage: ./convert-pdf.sh <input.pdf | input-dir> <output-dir>
set -euo pipefail

INPUT="${1:?usage: convert-pdf.sh <input.pdf|input-dir> <output-dir>}"
OUTDIR="${2:?usage: convert-pdf.sh <input.pdf|input-dir> <output-dir>}"

if ! command -v marker_single >/dev/null 2>&1; then
  echo "marker_single not found; installing marker-pdf via uv (Python 3.12)..." >&2
  command -v uv >/dev/null 2>&1 || { echo "error: uv is required but not on PATH" >&2; exit 1; }
  uv tool install --python 3.12 marker-pdf
fi

mkdir -p "$OUTDIR"
convert() { marker_single "$1" --force_ocr --redo_inline_math --output_dir "$OUTDIR"; }

if [ -d "$INPUT" ]; then
  shopt -s nullglob
  pdfs=("$INPUT"/*.pdf)
  [ ${#pdfs[@]} -gt 0 ] || { echo "error: no *.pdf in $INPUT" >&2; exit 1; }
  for f in "${pdfs[@]}"; do echo "converting: $f" >&2; convert "$f"; done
else
  convert "$INPUT"
fi
echo "done -> $OUTDIR" >&2
```

## Appendix B — Command sequence (copy-paste-able)

```bash
# --- author ---
mkdir -p /tmp/pdf-ocr-staging/marker-pdf-conversion/scripts
$EDITOR /tmp/pdf-ocr-staging/marker-pdf-conversion/SKILL.md            # Appendix A
$EDITOR /tmp/pdf-ocr-staging/marker-pdf-conversion/scripts/convert-pdf.sh
chmod 755 /tmp/pdf-ocr-staging/marker-pdf-conversion/scripts/convert-pdf.sh

# --- card source ---
drwn card new @remyjkim/pdf-ocr-card --no-git
drwn card source set @remyjkim/pdf-ocr-card \
  --description "PDF -> Markdown OCR with LaTeX equations and figures via marker-pdf (force_ocr)."
drwn card source add-skill @remyjkim/pdf-ocr-card marker-pdf-conversion \
  --from /tmp/pdf-ocr-staging/marker-pdf-conversion
drwn card source doctor @remyjkim/pdf-ocr-card --json

# --- scratch project test ---
mkdir -p /tmp/pdf-ocr-test && cd /tmp/pdf-ocr-test
drwn init --non-interactive
drwn card apply file:$HOME/.agents/drwn/sources/@remyjkim/pdf-ocr-card
drwn write --dry-run --json
drwn write

# --- probe ---
.claude/skills/marker-pdf-conversion/scripts/convert-pdf.sh \
  /Users/pureicis/dev/ai-narratives/rl-resources/ernestryu/pdfs/chapter3.pdf /tmp/pdf-ocr-probe-out
grep -q '\$\$' /tmp/pdf-ocr-probe-out/chapter3/chapter3.md && echo "LaTeX present"

# --- publish (optional) ---
drwn card source set @remyjkim/pdf-ocr-card --version 1.0.0
drwn card publish @remyjkim/pdf-ocr-card
```
