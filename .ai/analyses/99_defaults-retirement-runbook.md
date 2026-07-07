# Defaults retirement runbook

Machine `library defaults` entries are being replaced by profile Mind Cards.

## Migration steps

1. Capture defaults into a profile card: `drwn card new everyday --from-defaults --scope @your-handle`
2. Publish the profile card: `drwn card publish @your-handle/everyday`
3. Apply it in each project: `drwn use @your-handle/everyday` (registers the project in `~/.agents/drwn/projects.json`)
4. Remove legacy `library defaults` entries explicitly with `drwn library defaults remove-skill` / `remove-mcp`

drwn does **not** auto-remove machine defaults. Each operator removes legacy defaults after verifying the profile card in their projects.

## Bulk refresh

After projects are registered, run `drwn projects update --all` to refresh cards across the machine index.
