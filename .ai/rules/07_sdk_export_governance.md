# SDK Export Governance Rule

## Purpose

Prevent uncontrolled API surface growth and ensure every public export has clear ownership and lifecycle policy.

---

## Required Metadata For New Public Exports

Every new exported path or symbol must include:

1. **Owner** (team or person)
2. **Tier** (`Tier 1`, `Tier 2`, `Tier 3`)
3. **Intended consumers**
4. **Test obligations** (unit/integration/e2e expectations)
5. **Documentation obligations** (which pages updated)
6. **Deprecation path** (if replacing/renaming existing surface)

If any item is missing, do not merge.

---

## Tier Definitions

- **Tier 1**: default onboarding/stable
- **Tier 2**: advanced/supported
- **Tier 3**: evolving/experimental (non-default)

---

## Enforcement

At PR review time:

1. confirm tier table updates in `.ai/knowledges/02_sdk/README.md` if surface changed
2. verify tests exist at the declared risk tier
3. reject exports that bypass governance metadata
