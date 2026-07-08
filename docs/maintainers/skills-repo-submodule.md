# Skills Repo Submodule

This repo embeds `darwinian-worker-skills` as a shallow git submodule at `darwinian-worker-skills/`. This page is the contributor-side reference for that relationship.

## Why it exists

The skills repo at [`github.com/remyjkim/darwinian-worker-skills`](https://github.com/remyjkim/darwinian-worker-skills) is the canonical authoring source for the broader skill catalog and mind cards that the `drwn` CLI consumes (`drwn library add skill`, `drwn add card`, the package-backed bundle flow). It is a separately published artifact — distributed via the Claude Code plugin marketplace, Codex, Vercel `npx skills add`, and as a `drwn` bundle — but lives in lockstep with this CLI repo.

Adding it as a submodule means a contributor's `git clone --recurse-submodules` of `darwinian-minds` gives them both checkouts in one tree, with no separate sibling-repo setup required. It also makes the skill content discoverable from inside this repo without forcing every contributor to remember a second URL.

The in-tree `skills/shared/` directory in this repo holds the small set of skills published with the CLI itself (e.g. `frontend-design`). The submodule is the broader catalog. They do not overlap by design.

## On-disk layout

- `.gitmodules` — repo-root config registering the submodule (path, URL, `shallow = true`)
- `darwinian-worker-skills/` — submodule working tree (a Git gitlink in the parent repo's index)
- The parent repo's index records a pinned commit SHA, not a branch reference

`git status` in the parent repo shows the submodule path with `(commits)` markers if the working tree diverges from the recorded pin.

## Cloning

For new contributors:

```bash
git clone --recurse-submodules https://github.com/remyjkim/darwinian-worker.git
```

For existing clones (after the submodule was added or a pull brought in a pin bump):

```bash
git submodule update --init --recursive
```

For routine `git pull` operations that include a pin bump in the parent:

```bash
git pull
git submodule update --init --recursive
```

`git submodule update` without `--init` is sufficient when the submodule already exists locally; `--init` is only required the first time a contributor encounters the submodule.

## Bumping the pin

Pin bumps are explicit two-step commits. There is no auto-bump behavior.

```bash
cd darwinian-worker-skills
git pull origin main
cd ..
git add darwinian-worker-skills
git commit -m "[chore:submodule] bump darwinian-worker-skills to <short-sha>"
git push
```

Notes:

- The submodule tracks upstream `main` by default. To pin to a specific tag instead, `cd darwinian-worker-skills && git checkout <tag>` before staging the gitlink.
- Always bump intentionally. Resist auto-bumping in CI; the pin is a deliberate contract about which catalog the CLI was last verified against.
- When bumping for a release, run the full sanity check (see below) so the new skill catalog doesn't break a downstream test.

## Shallow clone behavior

The submodule is configured with `shallow = true` in `.gitmodules`. This means:

- `git submodule update --init` performs a `--depth 1` clone — only the pinned commit and its tree, no history.
- Contributors browsing skills do not pay the bandwidth or storage cost of the full upstream history.
- To get full history locally (e.g. to author a skills-repo change): `cd darwinian-worker-skills && git fetch --unshallow`.

## Excluding from publish

The submodule is not in `package.json.files` and therefore is not included in the npm tarball. Verified by:

```bash
npm pack --dry-run --json | jq '.[0].files[].path' | grep darwinian-worker-skills
```

No matches expected. The CLI distribution stays the same size as before the submodule existed.

## CI considerations

CI configurations that clone this repo without `--recurse-submodules` (or without a separate `git submodule update --init` step) will see `darwinian-worker-skills/` as an empty directory. Nothing in this repo's build, test, or typecheck pipeline depends on the submodule contents:

- `tsconfig.json` `include` enumerates `cli/**`, `scripts/**`, `test/**`, `skills/shared/**` — does not reach the submodule path.
- `bun test` glob does not pick up the submodule.
- `scripts/verify-release-readiness.ts` checks `cli`, `sync-mcp.ts`, `README.md`, `registry/`, `package.json`, and `.ai/knowledges/01-05` — does not traverse the submodule.

A CI that wants the submodule available (e.g. for an end-to-end test against fresh skill bundles) should explicitly add a `git submodule update --init --recursive` step.

## Sanity check after a pin bump

Run the standard release-readiness gate to confirm nothing in the CLI surface changed in a way that disagrees with the new skill catalog:

```bash
bun install
bun test
bun run typecheck
bun run verify:release --json
npm pack --dry-run --json
```

All five should pass with the same output as before the bump. If any fail, the failure is informative about which contract between CLI and skills moved.

## Removing the submodule

Only if you need to detach the relationship entirely:

```bash
git submodule deinit -f darwinian-worker-skills
git rm -f darwinian-worker-skills
rm -rf .git/modules/darwinian-worker-skills
git commit -m "[chore:repo] remove darwinian-worker-skills submodule"
```

The `.gitmodules` entry is removed automatically by `git rm`. The `.git/modules/<name>` cleanup is manual.
