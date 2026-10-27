# Production deployment

The production Cloudflare account is `415516b7403708741d606f6930e89e3f`
(`tiwi cf internal`). The public application uses `https://sandbox-sdk.site`;
Sandbox and OpenCode preview URLs use `*.sandbox-sdk.site`.

GitHub Actions builds and deploys the exact `main` commit that passed CI.
Repository secrets `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` must target
the production account. Both build and deploy receive the same account selection.

For a manual deployment:

```bash
export CLOUDFLARE_ACCOUNT_ID=415516b7403708741d606f6930e89e3f
bun install --frozen-lockfile
bun run format
bun run typecheck
bun run knip
bun run deploy
```

Docker must be running. Keep the locked Sandbox SDK and Docker image versions
aligned: this revision uses SDK `0.10.3`, `0.10.3-python`, and
`0.10.3-opencode`.

The private `hello-sandbox-backup` R2 bucket is mounted through the `BACKUP_BUCKET`
binding. It deletes backups after 14 days and aborts incomplete multipart uploads
after 7 days. The current application needs no runtime R2 access-key secrets.
The GitHub deployment API token is separate from Worker runtime bindings.

The account migration starts with empty sandboxes and backups. Containers use
the existing `basic` instance type and maximum of 100 instances per class.
`workers.dev` and version preview URLs remain disabled; the apex custom domain
and wildcard Worker route are declared in `wrangler.jsonc`.
