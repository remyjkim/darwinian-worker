---
sidebar_position: 16
---

# Logout

`drwn logout` removes local analyzer credentials and attempts to revoke the server session.

```bash
drwn logout
```

Emit machine-readable output:

```bash
drwn logout --json
```

Server revocation is best-effort. The credentials file is removed even if the server cannot be reached.

## Related

- [Login](./login) — authenticate with the analyzer
- [Whoami](./whoami) — validate the current session
