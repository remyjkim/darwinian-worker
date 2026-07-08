// ABOUTME: In-memory fake BeginningDB server for integration tests, speaking the real /v1 HTTP surface.
// ABOUTME: Models one owner filesystem: inodes with versions, path placements, ETag CAS, append, search, child-tokens.

interface Inode {
  id: number;
  version: number;
  content: string;
}

export interface FakeBgdbState {
  inodes: Map<number, Inode>;
  paths: Map<string, number>;
  dirs: Set<string>;
  requests: string[];
}

export interface FakeBgdb {
  baseUrl: string;
  token: string;
  state: FakeBgdbState;
  stop: () => void;
  readFile: (path: string) => string | null;
  etagOf: (path: string) => string | null;
}

function etag(inode: Inode) {
  return `W/"${inode.id}:${inode.version}"`;
}

function normalize(path: string) {
  const decoded = path.split("/").map((part) => decodeURIComponent(part)).join("/");
  const cleaned = decoded.replace(/\/+/g, "/").replace(/\/$/, "");
  return cleaned.startsWith("/") ? cleaned : `/${cleaned}`;
}

export function startFakeBgdb(options: { token?: string } = {}): FakeBgdb {
  const token = options.token ?? "fake-bgdb-token";
  const state: FakeBgdbState = { inodes: new Map(), paths: new Map(), dirs: new Set(), requests: [] };
  let nextInodeId = 1;

  function inodeAt(path: string): Inode | null {
    const id = state.paths.get(normalize(path));
    return id === undefined ? null : (state.inodes.get(id) ?? null);
  }

  function ensureParentDirs(path: string) {
    const parts = normalize(path).split("/").slice(1, -1);
    let current = "";
    for (const part of parts) {
      current += `/${part}`;
      state.dirs.add(current);
    }
  }

  function unplace(path: string, everywhere: boolean): number {
    const normalized = normalize(path);
    const id = state.paths.get(normalized);
    if (id === undefined) {
      return 404;
    }
    if (everywhere) {
      for (const [candidate, owner] of [...state.paths.entries()]) {
        if (owner === id) {
          state.paths.delete(candidate);
        }
      }
      state.inodes.delete(id);
      return 204;
    }
    state.paths.delete(normalized);
    const remaining = [...state.paths.values()].some((owner) => owner === id);
    if (!remaining) {
      state.inodes.delete(id);
    }
    return 204;
  }

  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      state.requests.push(`${request.method} ${url.pathname}${url.search}`);
      const bearer = request.headers.get("authorization");
      if (bearer !== `Bearer ${token}`) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }

      if (request.method === "POST" && url.pathname === "/v1/auth/child-token") {
        return Response.json({ token, expires_at: "2999-01-01T00:00:00Z", jti: "fake-jti" });
      }

      if (url.pathname.startsWith("/v1/stat/")) {
        const path = normalize(url.pathname.slice("/v1/stat".length));
        const inode = inodeAt(path);
        if (!inode) {
          return Response.json({ error: "not found" }, { status: 404 });
        }
        return Response.json(
          { kind: "file", path, size: inode.content.length, version: inode.version, inode_id: inode.id, etag: etag(inode) },
          { headers: { etag: etag(inode) } },
        );
      }

      if (url.pathname.startsWith("/v1/list/")) {
        const path = normalize(url.pathname.slice("/v1/list".length));
        const prefix = path === "/" ? "/" : `${path}/`;
        const names = new Map<string, "file" | "dir">();
        for (const candidate of state.paths.keys()) {
          if (candidate.startsWith(prefix)) {
            const rest = candidate.slice(prefix.length);
            const head = rest.split("/")[0]!;
            names.set(head, rest.includes("/") ? "dir" : "file");
          }
        }
        for (const dir of state.dirs) {
          if (dir.startsWith(prefix)) {
            const rest = dir.slice(prefix.length);
            const head = rest.split("/")[0]!;
            if (!names.has(head)) {
              names.set(head, "dir");
            }
          }
        }
        return Response.json({
          entries: [...names.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, kind]) => ({ name, kind })),
        });
      }

      if (url.pathname === "/v1/search") {
        const q = url.searchParams.get("q") ?? "";
        const prefix = url.searchParams.get("path_prefix");
        const results: string[] = [];
        for (const [path, id] of state.paths.entries()) {
          if (prefix && !path.startsWith(normalize(prefix))) {
            continue;
          }
          const inode = state.inodes.get(id);
          if (inode && (inode.content.includes(q) || path.includes(q))) {
            results.push(path);
          }
        }
        return Response.json({ results: results.sort() });
      }

      const placementsMatch = url.pathname.match(/^\/v1\/files\/(\d+)\/placements$/);
      if (placementsMatch) {
        const id = Number(placementsMatch[1]);
        const paths = [...state.paths.entries()].filter(([, owner]) => owner === id).map(([path]) => path);
        return Response.json({ inode_id: id, paths: paths.sort() });
      }

      if (!url.pathname.startsWith("/v1/fs/")) {
        return Response.json({ error: "not found" }, { status: 404 });
      }
      const path = normalize(url.pathname.slice("/v1/fs".length));

      if (request.method === "POST" && url.searchParams.get("action") === "place") {
        const destination = url.searchParams.get("destination");
        if (!destination) {
          return Response.json({ error: "destination required" }, { status: 400 });
        }
        const source = inodeAt(path);
        if (!source) {
          return Response.json({ error: "source not found" }, { status: 404 });
        }
        const dest = normalize(destination);
        if (state.paths.has(dest)) {
          return Response.json({ error: "destination exists" }, { status: 409 });
        }
        ensureParentDirs(dest);
        state.paths.set(dest, source.id);
        return new Response(null, { status: 201 });
      }

      if (request.method === "MKCOL") {
        if (state.dirs.has(path)) {
          return Response.json({ error: "exists" }, { status: 409 });
        }
        ensureParentDirs(`${path}/x`);
        return new Response(null, { status: 201 });
      }

      if (request.method === "GET") {
        const inode = inodeAt(path);
        if (!inode) {
          return Response.json({ error: "not found" }, { status: 404 });
        }
        return new Response(inode.content, { headers: { etag: etag(inode) } });
      }

      // Mirrors the real server: PUT responses carry no ETag (clients stat for it) and PATCH is an
      // offset write requiring a Content-Range header, not an atomic append.
      if (request.method === "PUT") {
        const existing = inodeAt(path);
        const ifMatch = request.headers.get("if-match");
        const ifNoneMatch = request.headers.get("if-none-match");
        if (ifNoneMatch === "*" && existing) {
          return Response.json({ error: "precondition failed" }, { status: 412 });
        }
        if (ifMatch && (!existing || etag(existing) !== ifMatch)) {
          return Response.json({ error: "precondition failed" }, { status: 412 });
        }
        const content = await request.text();
        if (existing) {
          existing.version += 1;
          existing.content = content;
          return new Response(null, { status: 204 });
        }
        const inode: Inode = { id: nextInodeId++, version: 1, content };
        state.inodes.set(inode.id, inode);
        ensureParentDirs(path);
        state.paths.set(path, inode.id);
        return new Response(null, { status: 201 });
      }

      if (request.method === "PATCH") {
        const inode = inodeAt(path);
        if (!inode) {
          return Response.json({ error: "not found" }, { status: 404 });
        }
        const range = request.headers.get("content-range");
        const start = range?.match(/^bytes (\d+)-/)?.[1];
        if (start === undefined) {
          return Response.json({ code: "bad_request", message: "invalid content-range" }, { status: 400 });
        }
        const offset = Number(start);
        const body = await request.text();
        const padded = inode.content.length < offset ? inode.content.padEnd(offset, "\0") : inode.content;
        inode.content = padded.slice(0, offset) + body + padded.slice(offset + body.length);
        inode.version += 1;
        return new Response(null, { status: 204 });
      }

      if (request.method === "DELETE") {
        const status = unplace(path, url.searchParams.get("action") === "delete_everywhere");
        return status === 204
          ? new Response(null, { status: 204 })
          : Response.json({ error: "not found" }, { status });
      }

      return Response.json({ error: "unsupported" }, { status: 405 });
    },
  });

  return {
    baseUrl: `http://127.0.0.1:${server.port}`,
    token,
    state,
    stop: () => server.stop(true),
    readFile: (path: string) => {
      const id = state.paths.get(normalize(path));
      return id === undefined ? null : (state.inodes.get(id)?.content ?? null);
    },
    etagOf: (path: string) => {
      const id = state.paths.get(normalize(path));
      const inode = id === undefined ? undefined : state.inodes.get(id);
      return inode ? etag(inode) : null;
    },
  };
}
