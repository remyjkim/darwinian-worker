// ABOUTME: Narrow BeginningDB client used by mind-store engines: file CAS, append, placements, search.
// ABOUTME: Fetch-based adapter standing in for the @beginningdb/client package (EXT-3 replaces it on publish).

import { DrwnError } from "../errors";
import type { BgdbConfig } from "./config";
import type { MemoryKind } from "../card-manifest";
import { parseCanonicalPoolPath } from "./paths";

export interface MindDbStat {
  etag: string;
  inodeId: number;
  size: number;
}

export interface MindDbFile {
  content: string;
  etag: string;
}

export interface MindDbEntry {
  name: string;
  kind: "file" | "dir";
}

export interface MindDbClient {
  stat(path: string): Promise<MindDbStat | null>;
  get(path: string): Promise<MindDbFile | null>;
  put(path: string, content: string, opts?: { ifMatch?: string; ifNoneMatch?: "*" }): Promise<{ etag: string }>;
  append(path: string, content: string): Promise<{ etag: string }>;
  delete(path: string, opts?: { everywhere?: boolean }): Promise<void>;
  mkdir(path: string): Promise<void>;
  list(path: string): Promise<MindDbEntry[]>;
  place(source: string, destination: string): Promise<void>;
  unplace(path: string): Promise<void>;
  placements(inodeId: number): Promise<string[]>;
  search(q: string, opts?: { pathPrefix?: string }): Promise<string[]>;
}

export interface MindMemoryHealthIssue {
  code: "unplaced_pool_entry" | "pool_placement_missing" | "unsupported_memory_residue";
  path: string;
}

const MEMORY_KINDS: readonly MemoryKind[] = ["observations", "insights"];

async function walkFiles(client: MindDbClient, root: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await client.list(root)) {
    const path = `${root}/${entry.name}`;
    if (entry.kind === "dir") files.push(...await walkFiles(client, path));
    else files.push(path);
  }
  return files;
}

function hasCanonicalPoolPlacement(paths: string[], kind: MemoryKind): boolean {
  return paths.some((path) => {
    try {
      return parseCanonicalPoolPath(path).kind === kind;
    } catch {
      return false;
    }
  });
}

export async function inspectMindMemoryHealth(client: MindDbClient, mindId: string): Promise<MindMemoryHealthIssue[]> {
  const issues: MindMemoryHealthIssue[] = [];
  const poolRootEntries = await client.list("/pool");
  for (const entry of poolRootEntries) {
    if (!MEMORY_KINDS.includes(entry.name as MemoryKind)) {
      issues.push({ code: "unsupported_memory_residue", path: `/pool/${entry.name}` });
    }
  }

  const mindMemoryRoot = `/minds/${mindId}/memory`;
  for (const entry of await client.list(mindMemoryRoot)) {
    if (!MEMORY_KINDS.includes(entry.name as MemoryKind)) {
      issues.push({ code: "unsupported_memory_residue", path: `${mindMemoryRoot}/${entry.name}` });
    }
  }

  for (const kind of MEMORY_KINDS) {
    for (const poolPath of await walkFiles(client, `/pool/${kind}`)) {
      try {
        parseCanonicalPoolPath(poolPath);
      } catch {
        issues.push({ code: "unsupported_memory_residue", path: poolPath });
        continue;
      }
      const stat = await client.stat(poolPath);
      if (!stat) continue;
      const placements = await client.placements(stat.inodeId);
      if (!placements.some((path) => path.startsWith("/minds/") && path.includes(`/memory/${kind}/`))) {
        issues.push({ code: "unplaced_pool_entry", path: poolPath });
      }
    }

    const reportedInodes = new Set<number>();
    for (const viewPath of await walkFiles(client, `${mindMemoryRoot}/${kind}`)) {
      const stat = await client.stat(viewPath);
      if (!stat || reportedInodes.has(stat.inodeId)) continue;
      const placements = await client.placements(stat.inodeId);
      if (!hasCanonicalPoolPlacement(placements, kind)) {
        reportedInodes.add(stat.inodeId);
        issues.push({ code: "pool_placement_missing", path: viewPath });
      }
    }
  }

  return issues.sort((left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code));
}

function encodePath(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return normalized.split("/").map(encodeURIComponent).join("/");
}

export function createMindDbClient(config: Pick<BgdbConfig, "baseUrl" | "token" | "tenantId">): MindDbClient {
  async function request(method: string, pathAndQuery: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${config.token}`);
    if (config.tenantId !== undefined) {
      headers.set("x-tenant-id", String(config.tenantId));
    }
    let response: Response;
    try {
      response = await fetch(new URL(pathAndQuery, config.baseUrl), { ...init, method, headers });
    } catch (error) {
      throw new DrwnError(
        "MIND_DB_UNREACHABLE",
        `BeginningDB is unreachable at ${config.baseUrl}: ${error instanceof Error ? error.message : String(error)}`,
        ["Check the binding (BGDB_BASE_URL) and that the server is running."],
        error,
      );
    }
    if (response.status === 412) {
      throw new DrwnError("MIND_DB_CONFLICT", `BeginningDB write conflict (412) on ${method} ${pathAndQuery}`);
    }
    return response;
  }

  async function assertOk(response: Response, operation: string) {
    if (!response.ok) {
      throw new DrwnError("MIND_DB_ERROR", `BeginningDB ${operation} failed (${response.status}): ${await response.text()}`);
    }
  }

  return {
    async stat(path) {
      const response = await request("GET", `/v1/stat${encodePath(path)}`);
      if (response.status === 404) {
        return null;
      }
      await assertOk(response, "stat");
      const body = (await response.json()) as { inode_id: number; size: number; etag?: string };
      return { etag: body.etag ?? response.headers.get("etag") ?? "", inodeId: body.inode_id, size: body.size };
    },
    async get(path) {
      const response = await request("GET", `/v1/fs${encodePath(path)}`);
      if (response.status === 404) {
        return null;
      }
      await assertOk(response, "get");
      return { content: await response.text(), etag: response.headers.get("etag") ?? "" };
    },
    async put(path, content, opts = {}) {
      const headers: Record<string, string> = {};
      if (opts.ifMatch) {
        headers["if-match"] = opts.ifMatch;
      }
      if (opts.ifNoneMatch) {
        headers["if-none-match"] = opts.ifNoneMatch;
      }
      const response = await request("PUT", `/v1/fs${encodePath(path)}`, { body: content, headers });
      await assertOk(response, "put");
      const headerEtag = response.headers.get("etag");
      if (headerEtag) {
        return { etag: headerEtag };
      }
      const statResponse = await request("GET", `/v1/stat${encodePath(path)}`);
      await assertOk(statResponse, "stat-after-put");
      return { etag: statResponse.headers.get("etag") ?? "" };
    },
    // PATCH is an offset write, not an atomic append: the offset comes from a prior stat, so concurrent
    // appenders can race. Observation conventions assume one writer per capture-context entry file.
    async append(path, content) {
      const statResponse = await request("GET", `/v1/stat${encodePath(path)}`);
      if (statResponse.status === 404) {
        throw new DrwnError("MIND_DB_ERROR", `Cannot append to a missing file: ${path}`);
      }
      await assertOk(statResponse, "stat-before-append");
      const { size } = (await statResponse.json()) as { size: number };
      const response = await request("PATCH", `/v1/fs${encodePath(path)}`, {
        body: content,
        headers: { "content-range": `bytes ${size}-` },
      });
      await assertOk(response, "append");
      const headerEtag = response.headers.get("etag");
      if (headerEtag) {
        return { etag: headerEtag };
      }
      const after = await request("GET", `/v1/stat${encodePath(path)}`);
      await assertOk(after, "stat-after-append");
      return { etag: after.headers.get("etag") ?? "" };
    },
    async delete(path, opts = {}) {
      const query = opts.everywhere ? "?action=delete_everywhere" : "";
      const response = await request("DELETE", `/v1/fs${encodePath(path)}${query}`);
      await assertOk(response, "delete");
    },
    async mkdir(path) {
      const response = await request("MKCOL", `/v1/fs${encodePath(path)}`);
      if (response.status === 409) {
        return;
      }
      await assertOk(response, "mkdir");
    },
    async list(path) {
      const response = await request("GET", `/v1/list${encodePath(path)}`);
      if (response.status === 404) {
        return [];
      }
      await assertOk(response, "list");
      const body = (await response.json()) as { entries: MindDbEntry[] };
      return body.entries;
    },
    async place(source, destination) {
      const response = await request(
        "POST",
        `/v1/fs${encodePath(source)}?action=place&destination=${encodeURIComponent(destination)}`,
      );
      await assertOk(response, "place");
    },
    async unplace(path) {
      const response = await request("DELETE", `/v1/fs${encodePath(path)}?action=unplace`);
      if (response.status === 404) {
        return;
      }
      await assertOk(response, "unplace");
    },
    async placements(inodeId) {
      const response = await request("GET", `/v1/files/${inodeId}/placements`);
      await assertOk(response, "placements");
      const body = (await response.json()) as { paths: string[] };
      return body.paths;
    },
    async search(q, opts = {}) {
      const params = new URLSearchParams({ q });
      if (opts.pathPrefix) {
        params.set("path_prefix", opts.pathPrefix);
      }
      const response = await request("GET", `/v1/search?${params.toString()}`);
      await assertOk(response, "search");
      const body = (await response.json()) as { results: string[] };
      return body.results;
    },
  };
}
