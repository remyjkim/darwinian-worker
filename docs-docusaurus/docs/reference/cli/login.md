---
sidebar_position: 15
---

# Login

`drwn login` authenticates the CLI with Darwinian Auth Hub through the device flow.

The command uses the production Auth Hub by default. To test against another Auth Hub, set `DRWN_DAH_HUB_URL`:

```bash
DRWN_DAH_HUB_URL=https://darwinian-auth-hub-staging.dev-726.workers.dev drwn login
```

Emit machine-readable output:

```bash
drwn login --json
```

In JSON mode, the browser sign-in URL is written to stderr while stdout remains the final JSON success object.

On success, credentials are written to `~/.agents/drwn/credentials.json` with owner-only permissions.

## Related

- [Whoami](./whoami) — validate the current session
- [Logout](./logout) — revoke best-effort and remove local credentials
- [Analyze](./analyze) — upload session archives after authentication
