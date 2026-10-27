# Production deployment

The production Cloudflare account is `415516b7403708741d606f6930e89e3f`
(`tiwi cf internal`). The public application uses `https://sandbox-sdk.site`;
Sandbox and OpenCode preview URLs use `*.sandbox-sdk.site`.

GitHub Actions builds and deploys the exact `main` commit that passed CI.
Repository secrets `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` must target
the production account. Both build and deploy receive the same account selection.

The account-owned CI token is named
`github-actions-hello-sandbox-production-20261027` and expires on January 25, 2027. Rotate it before that date, then replace the repository secret with
`gh secret set CLOUDFLARE_API_TOKEN --repo TimoWilhelm/hello-sandbox` (paste the
token at the secure prompt). It has Workers Editor, Workers Containers Write,
Workers Observability Write, Account Settings Read, and Workers R2 Storage
Metadata Read in the production account. Zone Read and Workers Routes Write
are limited to the `sandbox-sdk.site` zone. This account-level token can deploy
other existing Workers and manage containers in that account; this scope and
its 90-day lifetime were explicitly approved for the migration.

For a manual deployment:

```bash
export CLOUDFLARE_ACCOUNT_ID=415516b7403708741d606f6930e89e3f
bun install --frozen-lockfile
bun run format
bun run typecheck
bun run knip
bun run deploy
```

Docker must be running. SDK `1.0.3` is pinned in the lockfile and both images copy
`sandbox-shim` from `cloudflare/sandbox:1.0.3`. The app uses native container
execution with `durable_object` scheduling. Its own Durable Object methods provide
persistent Python/JavaScript kernels, tmux terminals, previews, quick tunnels,
file watching and OpenCode. These helpers are application code, rather than SDK
0.x APIs. The OpenCode CLI is pinned to `1.2.26`.

R2 mounts use SDK `S3Mount` and the exported `S3Gateway`. Configure `S3_ENDPOINT`
and `S3_BUCKET`, plus Worker secrets `S3_ACCESS_KEY_ID` and
`S3_SECRET_ACCESS_KEY`. The credential `hello-sandbox-r2-mount-production-20261027`
has Object Read & Write for `hello-sandbox-backup` only and expires January 25, 2027. Rotate both secrets before then. Credentials stay in the Worker; each
sandbox can mount only its `sandboxes/<sandbox-id>/` prefix through the gateway.
For local mount development, supply a development bucket's scoped credentials in
an ignored `.dev.vars` file. The `BACKUP_BUCKET` binding remains available for
R2 operations; SDK 1.0 mounts use the S3 gateway instead of that binding.
The bucket deletes objects after 14 days and aborts incomplete multipart uploads
after 7 days. The CI deployment token is separate from runtime mount credentials.

The account migration starts with empty sandboxes and backups. Containers use
the existing `basic` instance type, a ten-minute inactivity timeout, and a
three-hour maximum lifetime. Native Durable Object scheduling does not accept
`max_instances`; the destination account's container limits apply instead of
the previous per-class cap of 100. Interpreter execution is limited to two minutes
for shell commands and one minute for each code cell, with up to 32 contexts per
sandbox. A timed-out kernel is stopped and its variables are cleared.
`workers.dev` and version preview URLs remain disabled; the apex custom domain
and wildcard Worker route are declared in `wrangler.jsonc`.
