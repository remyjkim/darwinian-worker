---
sidebar_position: 10
---

# Disciplines

drwn is built around six load-bearing commitments. These disciplines make the system predictable to operate and predictable to extend; they hold whether you are reading state with `drwn status`, mutating state with `drwn write`, or building a new command on top.

## 1. Filesystem is the API

No daemon, no IPC, no socket. State lives at fixed paths under `~/.agents/drwn/` and `<project>/.agents/drwn/`. Anything that wants to read or mutate drwn state — including future surfaces like a web UI, an editor plugin, or a CI job — reads and writes the same shapes at the same paths. The CLI is one consumer of the filesystem API, not the canonical owner of it.

## 2. The lockfile is the contract

`card.lock` is the namespaced `drwn.project-lock` V1 contract. It records exact
Card resolutions with sha256 integrity hashes. Cross-machine reproducibility
holds **if and only if** the lockfile is honored. The lockfile encodes which
version satisfied a range and what the bundled content hashed to at resolve
time. A `drwn install` that ignores the lockfile is not reproducible; it is a
fresh resolution.

## 3. Guarded machine-state mutation

Every managed write under `~/.agents/drwn/` checks `DRWN_STORE_READONLY` through
the shared writable guard. File replacement uses atomic persistence, while
multi-record inventory and reference-sensitive changes also participate in the
global lock order. A new mutation path must preserve both contracts.

## 4. Atomic mutations everywhere

Temp-then-rename for files, immutable directories for package versions, atomic
regular pointer replacement, and validated tombstones for recoverable removal.
`fsync` completes required file and parent-directory durability. A crash should
leave either the prior committed state or a state the next invocation can
validate and recover.

## 5. Doctor is report-only

`drwn doctor` reports drift, missing generated files, stale symlinks, and ownership conflicts. It does not auto-fix any of them. The user decides what to do with each finding. This deliberately splits "what is wrong" from "what to change," because auto-fix at scale corrupts more state than it heals.

## 6. One process per invocation, ordered cross-process locks

drwn has no daemon or IPC supervisor, but mutating invocations coordinate with
owner locks. Inventory-sensitive work follows `inventory -> machine -> project`,
and multiple project roots are locked in normalized lexical order. Atomic
replacement still protects independent projection files; locks protect
cross-file invariants and reference decisions.

## Why these six together

The disciplines compose. The filesystem-as-API rule means commands compose by
reading and writing files; lockfiles, owner locks, and atomic persistence make
those operations reproducible and durable; the writable guard enforces readonly
operation; doctor remains report-only; and the per-invocation model keeps the
operational surface at `drwn <verb>`.

Each of these is also a constraint on contributions. A PR that adds a daemon, a non-lockfile-honoring install path, a non-atomic write, a bypass of the chokepoint, an auto-fix in doctor, or a cross-process coordinator is not just a feature — it is a change to the discipline. Such changes should be explicit in the PR description and reviewed against the discipline they affect.
