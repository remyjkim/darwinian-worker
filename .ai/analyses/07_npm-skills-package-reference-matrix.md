# NPM Skills Package Reference Matrix

## Purpose

Establish a small corpus of real npm packages that are analogous to the proposed package-backed skill bundle model for `beginning-agents`.

The goal is not to find a standard npm “skills package” type. It is to study the package patterns that matter:

- content-only bundles
- config bundles
- plugin packages
- CLI packages
- template/content-shipping packages

## Corpus Selection

The following packages were selected because they represent distinct artifact patterns:

1. `@tsconfig/node20`
2. `eslint-config-prettier`
3. `prettier-plugin-tailwindcss`
4. `eslint-plugin-import`
5. `create-vite`
6. `degit`
7. `hygen`

## Matrix

| Package | Category | CLI | Content Orientation | Tarball Pattern | Install Script Risk Relevance | Suitability As Reference |
|---|---|---:|---|---|---|---|
| `@tsconfig/node20` | config/content bundle | No | pure content/config | very small, manifest + config file only | low | excellent reference for minimal content bundles |
| `eslint-config-prettier` | config bundle with helper CLI | Yes | primarily config/runtime with optional helper tooling | small artifact, config exports plus helper CLI | medium | strong reference for “content + optional helper CLI” |
| `prettier-plugin-tailwindcss` | runtime plugin | No | runtime-heavy, compiled artifact | large dist-heavy tarball | low direct relevance | useful as negative example for heavy runtime plugin shape |
| `eslint-plugin-import` | runtime plugin + docs | No | runtime-heavy with many docs/config files | large and broad | low direct relevance | useful as negative example for overbroad plugin artifacts |
| `create-vite` | CLI + template bundle | Yes | ships many templates/assets | medium-large tarball with content directories | medium | very useful reference for CLI packages that ship content trees |
| `degit` | pure CLI scaffold tool | Yes | runtime-only | compact CLI artifact | medium | useful contrast case showing content not always shipped inside the package |
| `hygen` | CLI + template/content package | Yes | hybrid tool plus shipped templates | moderate tarball with `src/templates` content | high if installed locally from source | strong reference for content-shipping generator packages |

## Observations

### 1. There is no single dominant package pattern

The corpus clearly splits into:

- content/config bundles
- runtime plugins
- CLI/template shippers

This reinforces that `beginning-agents` must define its own bundle contract instead of relying on an npm-native category.

### 2. The most relevant analogies are not runtime plugins

For package-backed skills, the most relevant references are:

- `@tsconfig/node20`
- `eslint-config-prettier`
- `create-vite`
- `hygen`

These are the packages that most closely resemble:

- shipped content
- inspectable file trees
- optional helper CLI behavior

### 3. Runtime plugin packages are poor primary references

`prettier-plugin-tailwindcss` and `eslint-plugin-import` show patterns that are not ideal for skill bundles:

- large runtime-heavy distributions
- many compiled or implementation-specific files
- weak fit for content-oriented curation

They are useful mostly as anti-pattern references.

### 4. Content-only packages are viable and normal

`@tsconfig/node20` is the clearest evidence that a package can be a minimal, useful content bundle with:

- `package.json`
- a content/config file
- docs/license

This strongly supports the idea that package-backed skill bundles do not need their own CLI or heavy runtime layer.

## Conclusions For `beginning-agents`

The best-supported reference patterns are:

1. **content-first bundles**
2. **optional helper CLI, not authoritative operator CLI**
3. **stable shipped directory trees**

That supports the architecture in which:

- `beginning-agents` remains the operator and control plane
- extension bundles are content-first npm packages
- package CLIs, if present, are auxiliary only
