# ABOUTME: Completion evidence for Task 79's fail-closed whole-Store export security remediation.
# ABOUTME: Records the security boundary, implementation commits, unaffected transfer paths, and verification.

# Task 79 Completion: Store Export Security

**Status:** Completed
**Completed:** 2026-07-13
**Plan:** `.ai/tasks/79_drwn-store-export-security-hotfix-plan.md`

---

## Outcome

Ordinary `drwn store export` is registered but fails with
`STORE_EXPORT_DISABLED_UNSAFE` before creating an output directory or archive.
There is no `--force`, unsafe option, or environment-variable bypass.

The prior implementation archived the entire `drwn/` Store root, which could
include `credentials.json`, machine defaults, registered projects, write
history, generated state, and caches. Existing archives from that behavior are
documented as sensitive and must not be treated as credential-free transfer
artifacts.

Task 79 intentionally leaves these independent paths unchanged:

- Worker deploy's typed Card-closure payload export;
- `store seed` and `DRWN_STORE_SEED_PATH` legacy inputs;
- Card repositories, sources, extracted trees, and machine state;
- the proposed allowlisted portable inventory format in Task 82.

## Implementation Commits

| Commit | Scope |
|---|---|
| `9e8fb74` | Disable ordinary whole-Store export before side effects and add security regressions |
| `c74d149` | Document the fail-closed behavior and add the Store export release gate |

## Verification Evidence

Current focused coverage proves refusal before output, scoped deploy export
compatibility, and unchanged seed behavior:

```bash
bun test test/commands-store-maintenance.test.ts \
  test/core-worker-deploy.test.ts \
  test/commands-store-seed.test.ts \
  test/core-store-seed.test.ts
```

The final repository verification on 2026-07-13 also passed:

- complete suite: 1,425 pass, 5 environment-gated skips, 0 fail;
- `bun run typecheck`: pass;
- `bun run docs:build`: optimized production build pass;
- `bun run verify:release --json`: `ok:true`, no warnings, and the
  `store export security` check passed;
- `git diff --check`: pass.

## Acceptance Status

All Task 79 completion gates are satisfied. Whole-Store export remains
fail-closed until a separately approved, allowlist-built portable format
replaces it; no broad archive path is available through the supported command.
