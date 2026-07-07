// ABOUTME: Parses and formats upstream git refs for card source provenance sync.
// ABOUTME: Rejects local-path upstream values that cannot be shared across machines.

import { DrwnError } from "./errors";

export type ParsedUpstreamRef = {
  gitUrl: string;
  subpath: string;
  rev: string | null;
};

function isLocalUpstreamRef(ref: string): boolean {
  if (ref.startsWith("file:")) {
    return true;
  }
  if (ref.startsWith("/") || ref.startsWith("./") || ref.startsWith("../")) {
    return true;
  }
  return false;
}

function parseGitUpstreamBody(body: string): { gitUrl: string; fragment: string } {
  const hashIndex = body.indexOf("#");
  if (hashIndex === -1) {
    throw new DrwnError("UPSTREAM_REF_INVALID", "upstream ref requires git+URL#subpath[@rev]");
  }
  const gitUrl = body.slice(0, hashIndex);
  const fragment = body.slice(hashIndex + 1);
  if (!gitUrl || !fragment) {
    throw new DrwnError("UPSTREAM_REF_INVALID", "upstream ref requires git+URL#subpath[@rev]");
  }
  return { gitUrl, fragment };
}

function parseFragment(fragment: string): { subpath: string; rev: string | null } {
  const revMarker = fragment.lastIndexOf("@");
  if (revMarker === -1) {
    return { subpath: fragment, rev: null };
  }
  const subpath = fragment.slice(0, revMarker);
  const rev = fragment.slice(revMarker + 1);
  if (!subpath || !rev) {
    throw new DrwnError("UPSTREAM_REF_INVALID", "upstream ref requires git+URL#subpath[@rev]");
  }
  return { subpath, rev };
}

export function parseUpstreamRef(ref: string): ParsedUpstreamRef {
  if (isLocalUpstreamRef(ref)) {
    throw new DrwnError("UPSTREAM_LOCAL_PATH_REJECTED", "upstream ref cannot be a local path");
  }
  if (!ref.startsWith("git+")) {
    throw new DrwnError("UPSTREAM_REF_INVALID", "upstream ref must start with git+");
  }
  const { gitUrl, fragment } = parseGitUpstreamBody(ref.slice("git+".length));
  if (gitUrl.startsWith("file:")) {
    throw new DrwnError("UPSTREAM_LOCAL_PATH_REJECTED", "upstream ref cannot use a file:// git URL");
  }
  const { subpath, rev } = parseFragment(fragment);
  return { gitUrl, subpath, rev };
}

export function formatUpstreamRef(parsed: ParsedUpstreamRef): string {
  const fragment = parsed.rev ? `${parsed.subpath}@${parsed.rev}` : parsed.subpath;
  return `git+${parsed.gitUrl}#${fragment}`;
}
