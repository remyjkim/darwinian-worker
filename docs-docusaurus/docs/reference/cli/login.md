---
sidebar_position: 15
---

# Login

`drwn login` authenticates the CLI with the Darwinian analyzer through the device flow.

The command requires an analyzer API URL from `DRWN_ANALYZER_URL` or `analyzer.apiUrl` in `~/.agents/drwn/config.json`:

```bash
DRWN_ANALYZER_URL=http://localhost:8787 drwn login
```

```json
{
  "version": 1,
  "analyzer": {
    "apiUrl": "http://localhost:8787",
    "webBaseUrl": "https://darwinian-harness-services.pages.dev"
  },
  "optional": {}
}
```

Run without opening a browser automatically:

```bash
drwn login --no-browser
```

Emit machine-readable output:

```bash
drwn login --json
```

In JSON mode, the device sign-in URL and user code are written to stderr while stdout remains the final JSON success object.

On success, credentials are written to `~/.agents/drwn/credentials.json` with owner-only permissions.

## Related

- [Whoami](./whoami) — validate the current session
- [Logout](./logout) — revoke best-effort and remove local credentials
- [Analyze](./analyze) — upload session archives after authentication
