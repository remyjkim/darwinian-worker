---
sidebar_position: 1
---

# Card Spec

The Card is drwn's unit of distributable harness intent. A card declares a versioned bundle of skills, MCP servers, extension intent, and target defaults that a project can consume with a single ref. This page describes the producer/consumer contract: what shapes producers must emit, and what consumers (drwn or any compatible tool) must honor.

For the on-disk manifest shape, see [Card Manifest](../schemas/card-manifest). For the lockfile shape, see below — the lockfile contract lives here because it is part of the cross-tool interoperability surface.

## Three States

A card exists in one of three states. Each state has its own location and on-disk shape.

| State | Location | Shape |
|---|---|---|
| **Source** | `~/.agents/drwn/sources/<scope>/<name>/` | Working tree with editable `card.json`, `skills/`, `mcp-servers/`. Authored with `drwn card source` commands. |
| **Published** | `~/.agents/drwn/cards/<scope>/<name>.git/` | Immutable bare git repo. Versions are git tags `vX.Y.Z`. Trees are extracted to `~/.agents/drwn/extracted/<sha>/` on demand. |
| **Consumed** | `<project>/.agents/drwn/card.lock` (entries) and an extracted dir | A `CardLockEntry` in the lockfile plus the extracted tree. |

State transitions are implemented in `cli/core/card-store.ts`: `createCardSource` (`:223-263`), `publishCard` (`:620-672`), and `resolveCard` (`:682-709`).

## Card Refs

A card ref names a card and a version selector. Three canonical forms plus two shorthands. Grammar implemented in `parseCardRef` (`cli/core/card-store.ts:136-204`).

| Form | Shape | Example |
|---|---|---|
| Store | `@scope/name@<range>` or `name@<range>` | `@me/backend@^1.0.0` |
| File | `file:<path>` | `file:./vendor/local-card` |
| Git (ref) | `git+<url>#<ref>` | `git+https://github.com/me/card.git#v1.2.0` |
| Git (range) | `git+<url>@<range>` | `git+https://github.com/me/card.git@^1.0.0` |
| GitHub shorthand | `github:owner/repo#<ref>` or `github:owner/repo@<range>` | `github:me/card@^1.0.0` |
| GitLab shorthand | `gitlab:owner/repo#<ref>` or `gitlab:owner/repo@<range>` | `gitlab:me/card#main` |

A ref with no `@range` is treated as range `*`. Ranges use `validRange` semantics from `cli/core/semver-utils.ts`; exact versions match `isStrictSemver`.

The shorthands `github:` and `gitlab:` expand to `https://github.com/<owner>/<repo>.git` and `https://gitlab.com/<owner>/<repo>.git` respectively (`card-store.ts:185-204`).

## Lockfile v2 Contract

On disk: `<project>/.agents/drwn/card.lock`. Type: `CardLockfile` (`cli/core/card-lock.ts:32-36`).

Producers must emit exactly this shape; consumers must reject anything else. The validator is `validateCardLockfile` (`card-lock.ts:57-64`).

```json
{
  "lockfileVersion": 2,
  "store": { "minDrwnVersion": "0.1.0" },
  "cards": [
    {
      "origin": "store",
      "name": "@me/backend",
      "requested": "@me/backend@^1.0.0",
      "version": "1.2.0",
      "path": "/Users/me/.agents/drwn/extracted/abc123.../",
      "integrity": "sha256-deadbeef...",
      "manifest": { "name": "@me/backend", "version": "1.2.0" },
      "skills": ["reviewer", "release-notes"],
      "registry": null,
      "git": {
        "url": "https://github.com/me/backend.git",
        "ref": "v1.2.0",
        "commit": "0123456789abcdef0123456789abcdef01234567"
      }
    }
  ]
}
```

### Top-level fields

| Field | Type | Required | Meaning |
|---|---|---|---|
| `lockfileVersion` | literal `2` | yes | Schema gate. Anything else throws (`card-lock.ts:58-59`). |
| `store.minDrwnVersion` | string | no | Minimum drwn version a consumer needs to honor this lockfile. |
| `cards` | `CardLockEntry[]` | yes | One entry per locked card. Must be an array. |

### `CardLockEntry`

Required for every entry (`card-lock.ts:19-30`, validator at `:66-100`):

| Field | Type | Meaning |
|---|---|---|
| `origin` | `"store" \| "git" \| "file" \| "npm"` | Where the card came from. Validator rejects any other value. |
| `name` | non-empty string | Resolved card name. |
| `requested` | non-empty string | The original ref the project asked for. |
| `version` | non-empty string | The resolved semver. |
| `path` | non-empty string | Absolute path to the extracted card tree on this machine. |
| `integrity` | non-empty string | `sha256-<hex>` over the canonical card tree. See below. |
| `manifest` | `CardManifest` | The full validated manifest as carried by the card. |
| `skills` | `string[]` | The exact skill list the card contributed. |
| `registry` | literal `null` | **Reserved.** Must be `null`; the validator throws otherwise (`card-lock.ts:83-85`). |

Origin-specific (`card-lock.ts:102-121`):

| Field | When | Shape |
|---|---|---|
| `git` | required for `origin: "store"` and `origin: "git"`; **forbidden** for `"file"` and `"npm"` | `{ url?: string; ref?: string; commit: string }`. `commit` must be a 40-character lowercase SHA. |

### `npm` origin

`origin: "npm"` is part of the contract surface today and reserved for future package-registry-backed resolution. The validator accepts the value and forbids git metadata on it (`card-lock.ts:103-107`).

## Integrity Hash

The `integrity` field is computed by `computeCardIntegrity` (`cli/core/card-store.ts:317-331`). The algorithm is normative — any tool that emits drwn lockfiles must produce the same hash for the same tree.

1. Walk the card directory recursively. Skip `.integrity`, `.git`, and everything under `.git/` (`card-store.ts:295-297`).
2. For each regular file:
   - Capture `p` — the forward-slash path relative to the card root.
   - Capture `m` — `"x"` if any of the executable bits (`mode & 0o111`) are set, otherwise `"-"`.
   - Capture `h` — the lowercase hex `sha256` of the file's bytes.
3. Sort the records by `p` ascending (locale-independent).
4. Canonicalize as `JSON.stringify(records)` — i.e., `[{"p":"...","m":"-","h":"..."}, ...]` with sorted keys per record (object literal order: `p`, `m`, `h`).
5. The final hash is `sha256-` followed by the lowercase hex `sha256` of that canonical JSON string.

This makes the hash sensitive to file content, path, and executable bit. It is not sensitive to mtimes, ownership, or symlink-vs-file distinctions for non-regular entries.

## Project Overlay at Write

Card manifests contribute to project state through `mergeCardManifestsIntoProjectConfig` (`cli/core/card-project.ts:44-94`). The rule is:

1. All card manifests are merged together for `skills.include`, `servers`, `extensions`, and `targets`. Later cards override earlier cards on key collisions.
2. The project config's own `servers`, `extensions`, and `targets` are spread **after** the merged card values — the project wins on key collisions.
3. `skills.include` is the union of all card includes plus the project's own includes. The project's `skills.exclude` carries through unchanged.

The practical consequence: a project can disable a card-contributed server with `{"enabled": false}` and that override wins at write. A card cannot force a project to ship something it has explicitly turned off.

## Reserved Namespaces

- **`skills.exclude`** in a card manifest is **forbidden** (`cli/core/card-manifest.ts:85-87`). Cards contribute; consumers exclude.
- **`skills.shared`** in a card manifest is **reserved**. Must be omitted or empty (`card-manifest.ts:91-97`).
- **`registry`** in a lockfile entry is **reserved**. Must be `null` (`card-lock.ts:83-85`).
- **`.integrity`, `.git`, `.git/*`** paths are skipped by the integrity walker and must not contribute to the hash.

## Compatibility Surface

Any future tool that reads drwn lockfiles or publishes drwn cards must honor this spec:

- Lockfile validator must reject `lockfileVersion !== 2`.
- All required `CardLockEntry` fields must be present and non-empty strings (except `registry: null` and origin-specific `git`).
- Integrity hashes must be computed via the algorithm above. Mismatches indicate tampering or a divergent implementation.
- Card refs must parse according to `parseCardRef`. Unsupported origins must error rather than silently fall through.

## Related

- [Card Manifest](../schemas/card-manifest) — the on-disk `card.json` shape
- [Project Config JSON](../schemas/project-config-json) — where `cards[]` refs live
- [Cards concept](../../concepts/cards) — authoring and consumption walkthrough
- [Local Store](../../concepts/local-store) — store layout backing the three states
