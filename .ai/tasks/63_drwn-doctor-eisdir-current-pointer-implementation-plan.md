# ABOUTME: Root-cause and fix plan for the drwn doctor EISDIR crash caused by reading an installed-skill-bundle `current` symlink as a file.
# ABOUTME: Makes listInstalledSkillBundles tolerate both `current` pointer conventions and stay resilient to a malformed bundle.

# Task 63: `drwn doctor` EISDIR — installed-skill `current` pointer convention mismatch

**Status**: Planning
**Created**: 2026-06-30
**Priority**: High (any global command that lists installed skill bundles crashes)
**Dependencies**: none
**References**: `cli/core/skill-packages.ts`, `cli/core/store-paths.ts`, `cli/core/paths.ts`, `cli/commands/doctor.ts`

---

## Objective

`drwn doctor` (and any command that enumerates installed skill bundles) crashes with an unhandled
`EISDIR` rejection when an installed skill package stores its `current` pointer as a **symlink to
the version directory** instead of a **file containing the version string**. Make the reader
tolerate both conventions and never crash the whole command on a single malformed bundle.

### Goal state

- `drwn doctor`, `drwn status`, and library listing succeed regardless of whether an installed
  skill bundle's `current` is a version-string file or a symlink to the version directory.
- A single malformed bundle entry degrades to a warning, not a process-killing rejection.

---

## Success Criteria

- [ ] `drwn doctor` exits 0 with the current on-disk store (which has a symlink-style `current`).
- [ ] `listInstalledSkillBundles` resolves the active version for both `current` conventions.
- [ ] A malformed/unreadable bundle entry yields a diagnostic warning, not an unhandled rejection.
- [ ] Regression test covers both conventions plus the malformed case.
- [ ] `bun test` and `bun run typecheck` green.

---

## Reproduction & Evidence

Symptom (from any directory):

```text
Internal Error: Execution failed with a non-error rejection
(rejected value: {"code":"EISDIR","fd":6,"syscall":"read","errno":-21})
```

Traced the offending read (preload wrapper over `fs/promises.readFile`):

```text
EISDIR readFile(async): ~/.agents/drwn/skills/@remyjkim/drwn-import-mcp-from-claude/current
```

On-disk layout of that installed bundle:

```text
@remyjkim/drwn-import-mcp-from-claude/
  1.0.0/            # version directory (bundle.json, package.json, skills/...)
  current -> 1.0.0  # symlink to the version directory
```

So `current` resolves to a **directory**; reading it as a file raises `EISDIR`.

---

## Root Cause

`cli/core/skill-packages.ts`, `listInstalledSkillBundles` → `walk()` (around line 168):

```ts
const currentPath = join(dirPath, "current");
if (existsSync(currentPath)) {
  const activeVersion = (await readFile(currentPath, "utf8")).trim(); // assumes a version-string FILE
  const versionRoot = join(dirPath, activeVersion);
  ...
}
```

`existsSync(currentPath)` is true for a symlink-to-dir, and `readFile` follows the symlink into the
`1.0.0/` directory → `EISDIR`. The reader assumes the **file convention** (`current` contains the
version string), but the bundle on disk uses the **symlink convention** (`current -> <version>`).
The two conventions disagree and the reader has no guard. The rejection is a plain object (no Error
stack), so clipanion reports an opaque "Internal Error".

Blast radius: every caller of `listInstalledSkillBundles` — `drwn doctor`, `drwn status`, and skill
library/inventory surfaces — crashes whenever such a bundle exists.

---

## Solutions Considered

### Solution A — tolerant reader (recommended)

Resolve the active version from whatever `current` is: a symlink to a version dir (take the link
target's basename), a directory (skip with a warning — ambiguous), or a file (read the version
string). Wrap each bundle in try/catch so one bad entry warns instead of killing the walk.

- Pros: fixes the live crash immediately, backward compatible with both conventions, resilient.
- Cons: the reader now understands two formats (acceptable; it is the integration point).

### Solution B — normalize the writer + migrate

Pick one canonical convention for `current`, change the installer to always write it that way, and
migrate existing stores (`drwn store migrate`) to convert symlink-style pointers to the canonical
form.

- Pros: a single on-disk convention long-term.
- Cons: does not by itself stop the crash for already-installed stores until migration runs;
  larger blast radius; needs a migration step. Does not remove the need for reader resilience.

### Decision

**Solution A now** (stops the crash, handles both formats, adds resilience). Optionally follow with
B as a separate normalization/migration task so the store standardizes over time. A must land
regardless because doctor should never hard-crash on a single malformed bundle.

---

## Implementation Plan (TDD)

### Phase 0 — failing test

- [ ] In a new `test/core-skill-packages.test.ts`, build a temp `agentsDir` skill-packages root with
      a bundle whose `current` is a **symlink** to a `1.0.0/` dir (plus a valid `bundle.json`).
- [ ] Assert `listInstalledSkillBundles` returns the bundle with `activeVersion === "1.0.0"`.
      Confirm it currently throws `EISDIR`.

### Phase 1 — tolerant resolution

- [ ] In `skill-packages.ts` `walk()`, replace the unconditional `readFile` with version resolution
      that branches on `lstat(currentPath)`:

```ts
import { lstat, readlink, readFile, readdir } from "node:fs/promises";
import { basename, join, relative } from "node:path";

async function resolveActiveVersion(currentPath: string): Promise<string> {
  const st = await lstat(currentPath);
  if (st.isSymbolicLink()) {
    // symlink convention: current -> <version> directory
    return basename(await readlink(currentPath)).trim();
  }
  if (st.isDirectory()) {
    // a real directory named "current" is unsupported; signal malformed
    throw new Error(`"current" is a directory, expected a version pointer`);
  }
  // file convention: current holds the version string
  return (await readFile(currentPath, "utf8")).trim();
}
```

- [ ] Use it in `walk()` and validate `versionRoot` exists before `loadBundleManifest`.

### Phase 2 — resilience

- [ ] Wrap each bundle's resolution in try/catch; on failure, push a structured warning (surfaced by
      doctor) and continue the walk instead of rejecting.
- [ ] Decide the warning channel: return a `{ bundles, warnings }` shape, or log via the existing
      diagnostics warning surface. Keep the public return type stable if other callers depend on it
      (check `getInstalledSkillBundle` and doctor usage).

### Phase 3 — verify

- [ ] Tests for all three cases: symlink `current`, version-string-file `current`, malformed
      (directory) `current` (warns, no throw).
- [ ] `drwn doctor` exits 0 against the real store. `bun test` and `bun run typecheck` green.

---

## Testing Strategy

- Unit: `listInstalledSkillBundles` across the three `current` shapes using a temp agentsDir.
- Integration: `drwn doctor` smoke against a temp store containing a symlink-style bundle.
- Manual: `drwn doctor` on this machine now exits 0.

---

## Risks & Mitigation

- **Return-type change for warnings** — if `listInstalledSkillBundles` callers expect an array,
  keep returning the array and route warnings through a side channel (diagnostics) to avoid a wide
  refactor. Confirm callers first.
- **`readlink` relative vs absolute targets** — `current -> 1.0.0` is relative; `basename` handles
  both, but assert the resolved `versionRoot` exists before loading the manifest.

---

## Notes / follow-ups (out of scope here)

- Solution B: standardize the installer's `current` convention and add a `drwn store migrate` step.
- Identify which installer wrote the symlink-style `current` (npm skill-bundle add path) so B targets
  the right writer.
