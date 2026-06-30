# ABOUTME: Implementation plan to let drwn cards carry header-authenticated hosted HTTP MCP servers by rendering an MCP `headers` field across Claude, Codex, and Cursor.
# ABOUTME: Sequences the change into TDD phases with concrete files, signatures, per-target rendering rules, tests, and acceptance gates.

# Task 61: HTTP MCP `headers` passthrough across all three targets — Implementation Plan

**Status**: In Progress
**Created**: 2026-06-30
**Updated**: 2026-06-30
**Assigned**: Claude + Remy
**Priority**: Medium
**Estimated Effort**: ~0.5 day
**Dependencies**: none (additive, no migration)
**References**: [cli/core/types.ts, cli/core/mcp.ts, cli/core/card-manifest.ts, cli/core/mcp-library.ts, cli/core/card-mcp.ts, test/core-mcp-sync.test.ts, /Users/pureicis/dev/mindspace-landing/.ai/tasks/04_drwn_http_header_fix_scope.md, https://developers.openai.com/codex/config-reference, https://developers.openai.com/codex/mcp]

---

## Progress (2026-06-30)

Implemented on branch `feat/http-mcp-headers-passthrough`. **Phases 0–5 complete.**

- **Type** (`cli/core/types.ts`): `headers?: Record<string,string>` added to `RegistryServer`.
- **Renderers** (`cli/core/mcp.ts`): `BEARER_PASSTHROUGH`, `mapHeaderValues`, `partitionCodexHeaders`, and `codexUnsupportedHeaderKeys` added; headers wired into Claude (`toJsonServerConfig`), Cursor (`toCursorServerConfig`, `${env:VAR}` rewrite), and Codex (`toCodexServerConfig`: bearer→`bearer_token_env_var`, literals→`http_headers`).
- **Validation**: `isStringRecord` exported from `card-manifest.ts`; manifest `servers[].headers` and `validateMcpLibraryServer` reject non-string header maps.
- **Codex reporting** (`cli/core/sync.ts`): non-bearer `${VAR}` headers (unexpressible on Codex) emit a `result.warnings` entry instead of silently dropping.
- **Tests**: `test/core-mcp-headers.test.ts` (8 unit/integration cases: per-target render, Codex bearer translation, unsupported-header flag, header-less backward-compat, manifest + library validation, card→registry→render round-trip) plus `test/core-mcp-sync.test.ts` (2 **end-to-end** cases: real non-dry-run `syncMcp` writes header into all three actual target files with user content preserved; Codex-incompatible header warns + omitted). `bun test` = 992 pass / 2 skip / 1 pre-existing fail; `bun run typecheck` clean; lint clean for changed files.
- **Phase 5 (done):** version bumped `0.5.0 → 0.6.0` in `package.json` + `cli/core/version.ts` (parity test passes). Global `drwn` is `bun link`-symlinked to this repo, so the change is already live (`drwn --version` → `0.6.0`); no separate reinstall needed.
- **Known pre-existing failure (not ours):** `documentation readiness` (usage guide must contain "markdownify") fails on clean `main` too — unrelated to MCP, left untouched.
- **Docs follow-up (separate repo):** `author-mind-card` / `import-mcp-from-claude` SKILL.md in `darwinian-harness-skills` should mention the `headers` field — deferred, not edited from this branch.

---

## Objective

Allow a Mind Card to bundle a **hosted HTTP MCP server that authenticates with a request
header** (e.g. `Authorization: Bearer ${FAL_KEY}`) and have `drwn write` materialize that
auth correctly into **all three** downstream targets — Claude, Codex, and Cursor.

Motivating consumer: a reusable `@remyjkim/fal` card pointing at the official
`https://mcp.fal.ai/mcp` server (curated 9-tool surface), instead of falling back to a
community stdio MCP.

### Goal state

A server definition like this in `card.json.servers` (and `mcp-servers/<id>.json`):

```json
{
  "description": "fal.ai hosted MCP — 1,000+ image/video/audio models.",
  "transport": "http",
  "url": "https://mcp.fal.ai/mcp",
  "headers": { "Authorization": "Bearer ${FAL_KEY}" },
  "optional": false
}
```

renders to each target's native config with auth intact:

- **Claude** (`~/.claude*` JSON): `{ "type": "http", "url": "...", "headers": { "Authorization": "Bearer ${FAL_KEY}" } }` — Claude expands `${FAL_KEY}` at launch.
- **Cursor** (`~/.cursor/mcp.json`): same, but values rewritten to Cursor's `${env:FAL_KEY}` form.
- **Codex** (`~/.codex/config.toml`): `url`, plus `bearer_token_env_var = "FAL_KEY"` (Codex's native bearer mechanism), with any non-bearer literal headers in `http_headers`.

---

## Success Criteria

- [ ] `RegistryServer` supports an optional `headers: Record<string, string>` field.
- [ ] An HTTP server with `headers` renders the header into Claude config verbatim (`${VAR}` preserved).
- [ ] The same renders into Cursor config with `${VAR}` → `${env:VAR}` rewriting.
- [ ] The same renders into Codex config: an `Authorization: Bearer ${VAR}` header → `bearer_token_env_var = "VAR"`; literal non-bearer headers → `http_headers`.
- [ ] Header-less HTTP servers render byte-identical to today (existing snapshots/hashes unchanged).
- [ ] Card manifest + MCP library validation accept `headers` (reject non-string values).
- [ ] A round-trip scenario (card with header-auth HTTP server → `card add` → `drwn write`) lands the header in the Claude config and is drift-stable on re-write.
- [ ] `bun test` and `bun run typecheck` green.
- [ ] CLI version bumped `0.5.0` → `0.6.0`; global install refreshed.

---

## Background — root cause (verified)

Storage is already permissive; only rendering drops the data:

- `cli/core/card-manifest.ts` `validateCardManifest` does **not** validate `servers` — passes through.
- `cli/core/card-mcp.ts` `isRegistryServerDefinition` checks only description/transport/optional and deep-clones the whole object.
- `cli/core/mcp-library.ts` `validateMcpLibraryServer` asserts shape, stores the **raw** object.
- **The drop happens in `cli/core/mcp.ts`**, where three HTTP renderers rebuild the config field-by-field as `{ type, url }` (Claude/base `toJsonServerConfig:108`, Cursor `toCursorServerConfig:129`) or `{ url, enabled }` (Codex `toCodexServerConfig:147`), discarding everything else.

Hashing/drift (`canonicalJsonHash(toJsonServerConfig(server))`) wraps whatever the renderer
emits, so emitting headers is automatically covered and header-less servers keep identical hashes.

---

## Research grounding (verified 2026-06-30, official docs)

All three target schemas confirmed verbatim before implementation:

- **Claude Code** — `code.claude.com/docs/en/mcp`: env expansion `${VAR}` / `${VAR:-default}`
  applies to `command`, `args`, `url`, `env`, **and `headers`**. Official HTTP example:
  `{ "type": "http", "url": "...", "headers": { "Authorization": "Bearer ${API_KEY}" } }`.
  Caveat: known consumption bugs (anthropics/claude-code #6204, #51581) where `${VAR}` in HTTP
  headers may not be substituted on some versions — this is Claude-side, not a drwn emission
  issue; covered by the manual smoke test.
- **Cursor** — `cursor.com/docs`: remote server = `url` + `headers` map; substitution syntax
  `${env:VAR}`, applies to `command`/`args`/`env`/`url`/`headers`. Official example:
  `"headers": { "Authorization": "Bearer ${env:MY_SERVICE_TOKEN}" }`. Confirms the existing
  `toCursorEnvValue` rewrite is the correct transform for header values.
- **Codex** — `developers.openai.com/codex/config-reference`: per-server `url`,
  `bearer_token_env_var` (env var **name**; Codex builds `Authorization: Bearer <token>`), and
  `http_headers` (literal map, no `${VAR}` interpolation). `experimental_use_rmcp_client` is
  **not** required for Streamable HTTP MCP servers — the Phase 3 rmcp concern is resolved (no
  action needed).

---

## Strategy — two solutions considered

### Solution A — generic `headers` field (recommended)
Add `headers?: Record<string,string>` to `RegistryServer`; render per target, translating to
each target's native auth mechanism (Codex needs `bearer_token_env_var`, not a header string).

- **Pros:** general (any header-auth MCP), matches Claude/Cursor's native header model and how
  users think about `claude mcp add --header`, faithful to the MCP config surface. Only Codex
  needs a translation rule.
- **Cons:** Codex translation must parse `Authorization: Bearer ${VAR}` out of a header string.

### Solution B — typed `auth` abstraction
Add `auth?: { type: "bearer"; tokenEnvVar: string }` (or `bearerTokenEnvVar`), translated per
target into a header (Claude/Cursor) or `bearer_token_env_var` (Codex).

- **Pros:** maps 1:1 to Codex's native field; no string parsing.
- **Cons:** narrower (bearer-only), a new bespoke concept that diverges from the raw header
  model; non-bearer headers still need a separate `headers` field later anyway.

### Decision: **Solution A**, with a Codex translation rule.
General and future-proof; the only special case is Codex, which is unavoidable because Codex
models bearer auth as an env-var name rather than a header. Non-bearer literal headers still
flow to Codex via `http_headers`, so A covers strictly more than B.

---

## Per-target rendering spec

Add a small header-partition helper mirroring the existing env helpers (`ENV_PASSTHROUGH`,
`partitionCodexEnv`, `toCursorEnvValue`, `mcp.ts:73–97`).

```ts
// mcp.ts — matches "Bearer ${VAR}" exactly, capturing VAR.
const BEARER_PASSTHROUGH = /^Bearer\s+\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/;

function mapHeaderValues(
  headers: Record<string, string>,
  fn: (v: string) => string,
): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, fn(v)]));
}

// Codex: bearer Authorization -> bearer_token_env_var; everything else -> literal http_headers.
// A non-Authorization header carrying ${VAR} can't be interpolated by Codex -> report it.
function partitionCodexHeaders(headers: Record<string, string> | undefined) {
  let bearerTokenEnvVar: string | undefined;
  let httpHeaders: Record<string, string> | undefined;
  const unsupported: string[] = [];
  for (const [key, value] of Object.entries(headers ?? {})) {
    const bearerVar = key.toLowerCase() === "authorization" ? value.match(BEARER_PASSTHROUGH)?.[1] : undefined;
    if (bearerVar) {
      bearerTokenEnvVar = bearerVar;
    } else if (ENV_PASSTHROUGH.test(value)) {
      unsupported.push(key); // Codex cannot interpolate ${VAR} in a literal header
    } else {
      httpHeaders ??= {};
      httpHeaders[key] = value;
    }
  }
  return { bearerTokenEnvVar, httpHeaders, unsupported };
}
```

### Claude / base JSON — `toJsonServerConfig` (HTTP branch)
```ts
return {
  type: server.transport,
  url: server.url,
  ...(server.headers ? { headers: server.headers } : {}),
};
```

### Cursor — `toCursorServerConfig` (HTTP branch)
```ts
return {
  type: server.transport,
  url: server.url,
  ...(server.headers ? { headers: mapHeaderValues(server.headers, toCursorEnvValue) } : {}),
};
```

### Codex — `toCodexServerConfig` (HTTP branch)
```ts
const { bearerTokenEnvVar, httpHeaders, unsupported } = partitionCodexHeaders(server.headers);
// unsupported -> surface via the existing OptionalMcpReport/warning channel (see Phase 3).
return {
  url: server.url,
  enabled: true,
  ...(bearerTokenEnvVar ? { bearer_token_env_var: bearerTokenEnvVar } : {}),
  ...(httpHeaders ? { http_headers: httpHeaders } : {}),
};
```

> **Codex (resolved):** the official config reference confirms `url` /
> `bearer_token_env_var` / `http_headers` per-server and that `experimental_use_rmcp_client`
> is **not** required for Streamable HTTP MCP servers. No rmcp flag work in this task.

---

## Implementation Plan (TDD)

### Phase 0 — Failing tests first
- [ ] In `test/core-mcp-sync.test.ts`, add an HTTP fixture with `headers: { Authorization: "Bearer ${FAL_KEY}" }` plus one literal header `{ "X-Trace": "on" }`.
- [ ] Assert Claude render: `headers` present, `${FAL_KEY}` verbatim, `X-Trace` literal.
- [ ] Assert Cursor render: `Authorization` value becomes `Bearer ${env:FAL_KEY}`; `X-Trace` literal.
- [ ] Assert Codex render: `bearer_token_env_var = "FAL_KEY"`, `http_headers = { "X-Trace": "on" }`, no broken literal.
- [ ] Assert backward-compat: header-less HTTP fixture renders identically to current output; `canonicalJsonHash` unchanged.
- [ ] Run `bun test` — confirm the new cases fail for the right reason.

### Phase 1 — Type + renderers
- [ ] `cli/core/types.ts`: add `headers?: Record<string, string>` to `RegistryServer`.
- [ ] `cli/core/mcp.ts`: add `BEARER_PASSTHROUGH`, `mapHeaderValues`, `partitionCodexHeaders`; wire headers into the three HTTP branches per the spec above.
- [ ] `bun test` (render cases green), `bun run typecheck`.

### Phase 2 — Validation (reject malformed headers)
- [ ] `cli/core/mcp-library.ts` `validateMcpLibraryServer`: if `headers` present, assert it's a `Record<string,string>` (object, all string values) — else throw a clear error.
- [ ] `cli/core/card-manifest.ts`: add a minimal `servers` header-type check (only when `headers` present) so authoring catches mistakes at `card source doctor` time.
- [ ] Tests for both validators (valid passes; non-string value rejected).

### Phase 3 — Codex unsupported-header reporting
- [ ] Route `partitionCodexHeaders().unsupported` into the existing optional-MCP/warning report surface (see `cli/core/mcp-report.ts`) so a non-bearer `${VAR}` header on Codex is visible, not silently dropped. (rmcp flag confirmed unnecessary — see Research grounding.)

### Phase 4 — Round-trip scenario + docs
- [ ] Scenario test: author/lock a card with a header-auth HTTP server, run the write path, assert the header lands in Claude config and re-write is drift-stable.
- [ ] Docs: note `headers` as a server field in the `author-mind-card` skill + card README template (in the `darwinian-harness-skills` repo); note header capture in `import-mcp-from-claude`.

### Phase 5 — Release
- [ ] Bump `package.json` `0.5.0` → `0.6.0` (additive/minor).
- [ ] `bun run verify:release` (if applicable), then refresh the global install so `drwn` picks up the change.
- [ ] Re-validate any adopting card: `drwn card source doctor`, `drwn card validate`.

---

## Testing Strategy

- **Unit (renderers):** `test/core-mcp-sync.test.ts` — the three target renders + backward-compat + hash stability.
- **Unit (validation):** library + manifest header-type checks.
- **Scenario (round-trip):** card → `card add` → `drwn write` → Claude config asserts; drift-stable re-write.
- **Manual smoke (not CI):** apply the fal card to a throwaway project, `export FAL_KEY=...`, `/mcp` shows fal connected, run one cheap generation. Document since live keys aren't in CI.
- Gate: `bun test` + `bun run typecheck` green before release.

---

## Acceptance Criteria

- [ ] All Success Criteria checked.
- [ ] No regressions: full `bun test` green; existing MCP render snapshots unchanged for header-less servers.
- [ ] `drwn write` produces valid Claude/Cursor/Codex configs for a header-auth HTTP server.
- [ ] Docs updated (authoring skill + import note).

---

## Risks & Mitigation

- **Codex HTTP may need `experimental_use_rmcp_client` to work at all** (pre-existing gap). Mitigation: verify in Phase 3; treat the rmcp flag as a separate follow-up rather than blocking headers.
- **Cursor header-key casing / format drift.** Mitigation: assert exact rendered shape in tests; only values are rewritten, keys pass through.
- **Secret leakage.** Only `${VAR}` references are ever written to configs/cards; literal secrets must never be committed. Tests assert no literal token appears. The `notion-token` card precedent ("inject as a container secret, never commit") applies.
- **Scope creep into a Codex-auth overhaul.** Mitigation: keep this task to header passthrough + the clean bearer translation; defer broader Codex remote-MCP work.

---

## Notes / out of scope

- Broad Codex Streamable-HTTP enablement (`experimental_use_rmcp_client`) beyond what headers need.
- The `@remyjkim/fal` card itself (separate task; this only unblocks its hosted-MCP variant).
- OAuth-style remote auth (already handled via the `auth: "oauth"` path, e.g. `notion-agent`).
