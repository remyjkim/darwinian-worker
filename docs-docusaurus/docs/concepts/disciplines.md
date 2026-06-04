---
sidebar_position: 10
---

# Disciplines

drwn is built around six load-bearing commitments. These disciplines make the system predictable to operate and predictable to extend; they hold whether you are reading state with `drwn status`, mutating state with `drwn write`, or building a new command on top.

## 1. Filesystem is the API

No daemon, no IPC, no socket. State lives at fixed paths under `~/.agents/drwn/` and `<project>/.agents/drwn/`. Anything that wants to read or mutate drwn state — including future surfaces like a web UI, an editor plugin, or a CI job — reads and writes the same shapes at the same paths. The CLI is one consumer of the filesystem API, not the canonical owner of it.

## 2. The lockfile is the contract

`card.lock` (v2) records exact card resolutions with sha256 integrity hashes. Cross-machine reproducibility holds **if and only if** the lockfile is honored. The lockfile encodes which version satisfied a range and what the bundled content hashed to at resolve time. A `drwn install` that ignores the lockfile is not reproducible — it is by definition a fresh resolution.

## 3. Single chokepoint for store mutation

Every write under `~/.agents/drwn/` flows through `assertStoreWritable()` and `writeAtomically()`. This is why `DRWN_STORE_READONLY=1` works — it is enforced at the chokepoint, not opted into per command. New commands that mutate the store inherit this guarantee for free if they go through the chokepoint, and silently break it if they bypass it.

## 4. Atomic mutations everywhere

Temp-then-rename for files. Staging-then-rename for migrations. `fsync` on the parent directory for the write record. A drwn process that crashes mid-operation should leave the store in either the pre-state or the post-state, never in a partial state that subsequent reads have to reason about. Atomicity is the reason we can `kill -9` drwn and trust the next invocation.

## 5. Doctor is report-only

`drwn doctor` reports drift, missing generated files, stale symlinks, and ownership conflicts. It does not auto-fix any of them. The user decides what to do with each finding. This deliberately splits "what is wrong" from "what to change," because auto-fix at scale corrupts more state than it heals.

## 6. One process per invocation, bounded local concurrency

drwn does not coordinate across processes. There is no lockfile mutex, no IPC supervisor. Concurrency safety is achieved by the atomic-rename discipline (#4) plus the read-only store flag (#3). Two simultaneous `drwn write` invocations against the same store can race, but neither can leave it half-written.

## Why these six together

The disciplines compose. The filesystem-as-API rule means commands compose by reading and writing files; the lockfile and atomic-write rules mean those reads and writes are durable and reproducible; the chokepoint rule means new commands inherit the durability without thinking about it; doctor-is-report-only means the system never silently rewrites state out from under the operator; and the per-invocation model means the operational surface stays as simple as `drwn <verb>`.

Each of these is also a constraint on contributions. A PR that adds a daemon, a non-lockfile-honoring install path, a non-atomic write, a bypass of the chokepoint, an auto-fix in doctor, or a cross-process coordinator is not just a feature — it is a change to the discipline. Such changes should be explicit in the PR description and reviewed against the discipline they affect.
