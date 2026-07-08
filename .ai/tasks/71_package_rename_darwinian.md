# ABOUTME: Execution plan to rename the drwn CLI npm package/repo from `darwinian-minds` to `darwinian` — the atomic CLI change (incl. the self-blocking release gate), the hook-policy subpath lockstep, publish, dependent-card republish, services image pin, deprecations, and repo/domain cleanup.
# ABOUTME: Coordinated with darwinian-services `.ai/tasks/42_server_side_blueprint_deploy_implementation_plan.md` (Task S-A pins the renamed package). Principle: long-term-optimal / no backward compatibility.

# Task 71: Package Rename — `darwinian-minds` → `darwinian`

**Date**: 2026-07-07
**Author**: Claude + Remy
**Status**: Ready for handoff — execution-ready
**Decision**: package name = **`darwinian`** (the framework name; `npm i -g darwinian` → the `drwn` command). Bin stays `drwn`; **drop the stale `dminds` alias**. hook-policy subpath → `darwinian/hook-policy`.
**References**: `package.json`, `.github/workflows/release.yml`, `scripts/verify-release-readiness.ts` (:152), `cli/core/card-source.ts` (:324,:519), `cli/core/hook-generator/{bundle-composer,emit-mastra-composer}.ts`, `cli/core/hook-policy/index.ts`, `.gitmodules`; services `studio-deployment/images/*/Dockerfile*`

---

## Why & the three landmines

1. **`darwinian-minds/hook-policy` is an EXTERNAL contract, not an internal string.** Card authors import it; the CLI emits it into scaffolds (`card-source.ts:519`) and generated runtime code (`emit-mastra-composer.ts:31`), and esbuild treats it as `external`/`onResolve` (`card-source.ts:324`, `bundle-composer.ts:51,93`). Renaming the package breaks **every published card** that imports it unless they republish in lockstep. No backward-compat shim (per principle).
2. **The release gate self-blocks the rename.** `verify-release-readiness.ts:152` and `test/package-readiness.test.ts` / `test/cli-install-mode.test.ts` hardcode `darwinian-minds` — they must change in the **same commit** or CI red-lights the renamed package.
3. **The services images install `darwinian-harness` (the OLD 0.2.1 name), unpinned** — so the services-side change is `harness → darwinian@X` across 3 Dockerfiles, and it's gated on the publish (Task R-2).

## Tasks (in safe order — see §Ordering)

### R-1 — CLI atomic change (one commit; green `tsc` + `bun test`)
**Files**:
- `package.json`: `name` `darwinian-minds`→`darwinian` (:2); `bin` drop `dminds`, keep `drwn` (:4-5); `homepage`/`bugs`/`repository` URLs (:16,:18,:22) → the new repo URL (see R-6); `keywords` (:36); `files` logo asset path if renamed (:31, §R-7).
- **hook-policy subpath consumers → `darwinian/hook-policy`** (the lockstep set): the emitted scaffold in `card-source.ts:519` (`hookPolicyTemplate`), the esbuild `external` at `card-source.ts:324`, the emitted export in `emit-mastra-composer.ts:31`, the imports + `onResolve` filter in `bundle-composer.ts:51,93`, and the ABOUTME in `hook-policy/index.ts:2`. Update the `exports["./hook-policy"]` map key context in `package.json:8-11` as needed (the subpath key stays `./hook-policy`; only the package prefix consumers change).
- **Release-gate (self-blocking — same commit)**: `verify-release-readiness.ts:152-153` (`pkg.name !== "darwinian"`), `test/package-readiness.test.ts` (:19,:21,:25,:26,:29,:103,:137 — name/bin/URLs/release.yml-install-line/logo), `test/cli-install-mode.test.ts:15,19`.
- **Test assertions pinning the hook-policy string**: `test/core-hook-policy-export.test.ts:6,8`, `test/core-hook-bundle-composer.test.ts:39,77`, `test/cli-hook-write-e2e.test.ts:38,70,124,266`, `test/core-hook-emit-mastra.test.ts:36`, `test/commands-card-show-hooks.test.ts:22`, `test/commands-doctor.test.ts:253,283`.
- **Internal/cosmetic**: `cli/context.ts:37` error text; `test/sync-mcp.test.ts:28` temp-dir prefix; docs (`README.md`, `INSTALL.md`, `docs/maintainers/publishing.md`, `docs-astro/*`, `docs-docusaurus/*`, `docs/cli-quickref.md`) — bulk of the 221 refs, update forward-facing docs (not the historical `.ai/` trail).
- **Exit**: `npx tsc --noEmit` + `bun test` green; `verify:release` green with `name === "darwinian"`.

### R-2 — Publish `darwinian@<X.Y.Z>`
**Files**: `.github/workflows/release.yml` (`environment.url` → `npmjs.com/package/darwinian`; the `npm view "darwinian@..."` not-published check; the ubuntu+macos smoke `npm install -g darwinian@... && drwn --version`).
- Version: continue the line (0.6.x) — a naming rename with no code break. The npm token is account-scoped, so publishing a new name needs no new secret.
- **Exit**: `npm view darwinian version` = X.Y.Z; `npm i -g darwinian && drwn --version` works.

### R-3 — Republish dependent cards against `darwinian/hook-policy`
- **First, inventory the blast radius (its size is unknown until then):** `grep -rl "darwinian-minds/hook-policy"` across the `darwinian-minds-skills` submodule repo and every `curation-labs` catalog repo. Only cards that actually import the subpath need republishing; a hook-less card is unaffected. R-3 is not schedulable until this list exists.
- Each such card: bump version, republish against `darwinian/hook-policy`, re-catalog. **Cannot land before R-2** (the new import must resolve).
- **Exit**: the inventoried cards resolve `darwinian/hook-policy`; `drwn card clone` + `drwn write` on a hook-shipping card succeeds.

### R-4 — Update services image pins (`harness` → `darwinian@X`)
- `darwinian-services/studio-deployment/images/mind-runtime/Dockerfile:33`, `Dockerfile.cloud:33`, `images/engine-runtime/Dockerfile.cloud:43`: `npm install -g darwinian-harness` → `npm install -g darwinian@<X.Y.Z>` (pinned). **This IS Task S-A** in the server plan (42); the two must reference the same pinned version. **After R-2.**
- **Exit**: images build; in-container `drwn --version` = X.Y.Z.

### R-5 — Deprecate the old packages
- `npm deprecate darwinian-minds "renamed to darwinian"` and `npm deprecate darwinian-harness "renamed to darwinian"` (non-destructive; installs still work, clean signal). **After R-2/R-3/R-4** so nothing still depends on them.

### R-6 — GitHub repo (+ submodule) rename
- Rename `github.com/remyjkim/darwinian-minds` → `darwinian`; update the local `origin` remote explicitly (GitHub redirects are fragile). If also renaming the skills repo → `darwinian-skills`: update `.gitmodules` (:1-3) + the `github:remyjkim/darwinian-minds-skills` card ref (`docs-docusaurus/.../use-darwinian-minds-skills.md:20`) + submodule docs. **Do last** — redirects cover the interim.

### R-7 — Domain / asset cleanup (don't let these hide)
- `contact@darwinian-minds.dev` (`docs-astro/src/consts.ts:8`) → the `darwinian` domain (DNS/email, external).
- `docs/assets/darwinian-minds-logo.png` → rename; touches `package.json:31` `files`, `test/package-readiness.test.ts:137`, `test/docs-readiness.test.ts:83`, README `<img>`.
- Cosmetic `dm-`/`darwinian-minds` external repo names (`curation-labs/dm-cards-catalog-v1` `registry/config.json:25`) — separate org, optional.

## Ordering & the hard constraints

R-1 (incl. the self-blocking release-gate edits) → R-2 publish → R-3 republish cards **and** R-4 image pin (both need R-2) → R-5 deprecate → R-6 repo rename → R-7 cleanup. The load-bearing constraints: the release-gate edits must be in R-1's commit (else CI blocks), and R-3/R-4 cannot precede R-2 (the package must exist to install/import).

## Coherence note (resolved)

`darwinian` was chosen over `darwinian-worker` deliberately: the CLI authors/deploys workers rather than being one, and `darwinian-worker` collides with the `drwn worker` subcommand. `darwinian` = the framework; `drwn` = its command. The `dminds` alias (from "darwinian-minds") is dropped as stale.
