# Card trust hardening roadmap

## Threat

Mind Cards bundle executable instruction surfaces: skills (prompt injection), MCP servers (credential exfiltration via headers/env), and hooks (arbitrary command execution). Unsigned cards from an open community catalog create an instruction-trust attack surface comparable to installing unaudited shell scripts.

## Near-term mitigations (shipped)

- Apply-time content summaries (`drwn card apply`) list skills, MCP servers, and hook consent requirements before materialization.
- Successor pointers are same-scope auto-suggest only; cross-scope successors require explicit `--accept-successor` or catalog corroboration.
- Machine-scope `drwn write` requires `--scope machine` to prevent silent home-directory mutation.

## Path to card signing

1. **Publisher identity** — bind card scope to verified git hosting identity (SSH deploy keys, OIDC from CI).
2. **Manifest signatures** — sign `card.json` + content manifest at publish time; verify before apply.
3. **Catalog v2** — catalog entries carry publisher keys and signature chains; drwn refuses unsigned cards when `trustedSources.strict` is enabled.

## Trigger

Implement signing before any default-registered community catalog grows beyond curated membership (analysis 94 §3.5). Until then, keep catalogs curated and treat apply summaries as the primary operator gate.
