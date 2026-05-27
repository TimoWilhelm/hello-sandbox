# Hello Sandbox

Interactive demo app for the [Cloudflare Sandbox SDK](https://developers.cloudflare.com/sandbox/).

- Run shell commands and view stdout/stderr/exit codes
- Filesystem CRUD (write, read, mkdir, list, delete, exists)
- Stateful Python and JavaScript REPL with variable persistence
- Natural language to code: an LLM generates Python and executes it in the sandbox
- Interactive terminal session via xterm.js over WebSocket
- Start HTTP servers inside the container and expose them via preview URLs or quick Cloudflare Tunnels
- Live filesystem change stream via Server-Sent Events
- Embedded [OpenCode](https://opencode.ai) agent running in a dedicated sandbox
- Mount an R2 bucket directly into the sandbox filesystem via Worker bindings
- Slides mode (`?mode=slides`) for presenting

## Tech Stack

| Layer           | Technology                       |
| --------------- | -------------------------------- |
| Runtime         | Cloudflare Workers               |
| Server          | Hono                             |
| Frontend        | React 19                         |
| Build           | Vite + `@cloudflare/vite-plugin` |
| CSS             | Tailwind CSS v4                  |
| Terminal        | xterm.js                         |
| AI              | Vercel AI SDK + Workers AI       |
| Animations      | Framer Motion                    |
| Language        | TypeScript                       |
| Package Manager | Bun                              |

## Getting Started

You need [Bun](https://bun.sh/) and [Docker](https://www.docker.com/) (for local sandbox containers).

```bash
bun install
bun run dev
```

```bash
bun run typecheck       # type check
bun run lint            # lint
bun run format          # format
bun run deploy          # deploy to Cloudflare
```

## Project Structure

```
src/
  index.ts              # Worker entry: Hono app, WebSocket terminal, SPA fallback
  api/
    index.ts            # Central API router with CORS and /api/status health endpoint
    sandbox.ts          # Shared sandbox accessor
    exec.ts             # POST /api/exec
    files.ts            # POST /api/files/*
    interpreter.ts      # POST /api/code
    ai.ts               # POST /api/ai
    preview.ts          # POST /api/preview/*
    watch.ts            # GET  /api/watch (SSE)
    backup.ts           # POST /api/backup/*
  client/
    app.tsx             # Main app shell (sidebar nav, animated panels, status bar)
    panels/             # One component per demo panel (11 panels)
    components/         # Shared UI (badges, cards, code blocks, file tree, etc.)
    lib/                # API client, formatting, syntax highlighting, hooks
    slides/             # Presentation mode (17 slides)
```

## Configuration

Cloudflare bindings in `wrangler.jsonc`:

- `AI` (Workers AI) - LLM inference for the AI Exec panel
- `ASSETS` (Static Assets) - SPA asset serving
- `BACKUP_BUCKET` (R2 Bucket) - mounted into the sandbox with `sandbox.mountBucket()`
- `Sandbox` (Durable Object) - main demo sandbox
- `OpencodeSandbox` (Durable Object) - dedicated OpenCode agent sandbox

Run `bun run cf-typegen` after changing bindings.

## Resources

- [Sandbox SDK docs](https://developers.cloudflare.com/sandbox/)
- [Workers docs](https://developers.cloudflare.com/workers/)
- [OpenCode](https://opencode.ai/)
