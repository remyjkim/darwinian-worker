---
sidebar_position: 17
---

# Whoami

`drwn whoami` validates the current analyzer session and prints the authenticated user email.

```bash
drwn whoami
drwn whoami --json
```

The command resolves auth from `~/.agents/drwn/credentials.json`. For automation, `DRWN_TOKEN` plus `DRWN_ANALYZER_URL` bypasses the credentials file:

```bash
DRWN_TOKEN=<token> DRWN_ANALYZER_URL=http://localhost:8787 drwn whoami
```

If the token is missing or expired, the command exits non-zero and asks you to run `drwn login`.

## Related

- [Login](./login) — authenticate with the analyzer
- [Logout](./logout) — remove local credentials
