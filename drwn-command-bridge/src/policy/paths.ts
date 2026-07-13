// ABOUTME: Resolves cwd and argv path tokens under configured allowed roots.
// ABOUTME: Rejects traversal, symlink escape, and Cowork VM-internal paths.

import { realpath } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";
import type { BridgePolicy } from "./load";

function isWindowsAbsolutePath(value: string) {
  return /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\");
}

function isVmInternalPath(value: string) {
  return value.startsWith("/sessions/");
}

function stripFileUrlLike(value: string) {
  return value;
}

export function isPathLikeArg(value: string) {
  return (
    value.includes("/") ||
    value.includes("\\") ||
    value.startsWith("~") ||
    value.startsWith(".") ||
    isWindowsAbsolutePath(value)
  );
}

function withTrailingSeparator(path: string) {
  return path.endsWith(sep) ? path : `${path}${sep}`;
}

async function realAllowedRoots(policy: BridgePolicy) {
  return await Promise.all(policy.rootsAllow.map((root) => realpath(root)));
}

function assertInsideRoots(resolved: string, roots: string[]) {
  const inside = roots.some((root) => resolved === root || resolved.startsWith(withTrailingSeparator(root)));
  if (!inside) {
    throw new Error(`Path resolves outside allowed roots: ${resolved}`);
  }
}

export async function resolveCwdWithinRoots(input: string | undefined, policy: BridgePolicy): Promise<string> {
  const roots = await realAllowedRoots(policy);
  const base = roots[0];
  if (!base) {
    throw new Error("Policy has no allowed roots");
  }
  const candidate = input === undefined ? base : isAbsolute(input) ? input : resolve(base, input);
  if (isVmInternalPath(candidate)) {
    throw new Error(`Cowork VM-internal path cannot be used as a host path: ${candidate}`);
  }
  const resolved = await realpath(candidate);
  assertInsideRoots(resolved, roots);
  return resolved;
}

export async function validatePathArgsWithinRoots(argv: string[], cwd: string, policy: BridgePolicy): Promise<void> {
  const roots = await realAllowedRoots(policy);
  for (const arg of argv.slice(1)) {
    const value = stripFileUrlLike(arg);
    if (isVmInternalPath(value)) {
      throw new Error(`Cowork VM-internal path cannot be used as a host path: ${value}`);
    }
    if (!isPathLikeArg(value)) {
      continue;
    }
    const candidate = value.startsWith("~/")
      ? resolve(policy.rootsAllow[0] ?? cwd, value.slice(2))
      : isAbsolute(value) || isWindowsAbsolutePath(value)
        ? value
        : resolve(cwd, value);
    const resolved = await realpath(candidate);
    assertInsideRoots(resolved, roots);
  }
}
