---
sidebar_position: 18
---

# Analyze

`drwn analyze sessions` uploads a session-log archive to the configured analyzer backend and prints where to watch the job.

Preview without auth or network:

```bash
drwn analyze sessions --dry-run
```

Upload the newest local archive, or build one inline if none exists:

```bash
drwn analyze sessions
```

Build a fresh archive first:

```bash
drwn analyze sessions --fresh
```

Use an explicit upload artifact:

```bash
drwn analyze sessions --archive /tmp/sessions.tar.gz
```

Wait for the final report and open it:

```bash
drwn analyze sessions --wait --open
```

Emit machine-readable output:

```bash
drwn analyze sessions --wait --json
```

## Configuration

`drwn analyze sessions` requires auth from either `drwn login` or `DRWN_TOKEN` plus `DRWN_ANALYZER_URL`.

The analyzer API URL comes from credentials, `DRWN_ANALYZER_URL`, or `analyzer.apiUrl`. The optional frontend URL comes from `DRWN_ANALYZER_WEB_URL` or `analyzer.webBaseUrl` and is used to compose `/processing/<jobId>` and `/report/<reportId>` URLs.

```json
{
  "version": 1,
  "analyzer": {
    "apiUrl": "http://localhost:8787",
    "webBaseUrl": "https://harness.darwiniantools.com",
    "maxArchiveBytes": 104857600
  },
  "optional": {}
}
```

## Input resolution

The command resolves input in this order:

1. `--archive <path>` uses the explicit `.tar`, `.tar.gz`, or `.tgz` path.
2. `--fresh` builds a new `.tar.gz` with the same discovery rules as `drwn export sessions`.
3. The newest archive under `.agents/drwn/session-log-exports/` is reused when present.
4. If no archive exists, a new inline `.tar.gz` is built and uploaded.

`--dry-run` is non-mutating: it validates an existing archive when selected, or reports that an inline export would be built without creating it.

## Related

- [Export](./export) — build upload-ready archives manually
- [Login](./login) — authenticate before uploading
