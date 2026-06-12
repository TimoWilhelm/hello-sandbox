import { Hono } from 'hono';

import { sandbox } from './sandbox';

// Dedicated docroot so the tunnel demo never collides with the preview demo,
// which serves its own page from a separate directory in the same sandbox.
const TUNNEL_DIR = '/workspace/tunnel';

const app = new Hono<{ Bindings: Env; Variables: { sandboxId: string } }>();

app.post('/start', async (c) => {
	const { command, port: portRaw } = await c.req.json<{
		command?: string;
		port?: number;
	}>();
	const sb = sandbox(c);
	const cmd = command || 'python3 -m http.server 8081';
	const port = portRaw || 8081;

	// Always (over)write the demo page into the dedicated docroot so the
	// tunnel deterministically serves its own content regardless of order.
	await sb.mkdir(TUNNEL_DIR, { recursive: true });
	await sb.writeFile(`${TUNNEL_DIR}/index.html`, getDemoHTML());

	const proc = await sb.startProcess(cmd, { cwd: TUNNEL_DIR });
	await proc.waitForPort(port, { mode: 'tcp', timeout: 10_000 });

	// tunnels.get() is idempotent (returns the cached tunnel for this port or
	// spawns a fresh cloudflared process), so no manual list/reuse is needed.
	const tunnel = await sb.tunnels.get(port);

	// A freshly spawned *.trycloudflare.com hostname is returned as soon as
	// cloudflared reports it, but the public edge/DNS can take a few seconds
	// to become resolvable. Without this wait the iframe's first load often
	// fails with "no address found". Poll from the Worker to warm DNS and
	// confirm reachability before handing the URL to the browser.
	await waitForTunnelReady(tunnel.url);

	return c.json({ success: true, url: tunnel.url, port: tunnel.port });
});

app.post('/stop', async (c) => {
	const { port } = await c.req.json<{ port?: number }>();
	await sandbox(c).tunnels.destroy(port || 8081);
	return c.json({ success: true });
});

export default app;

// Poll the public tunnel URL until it responds (or we give up), warming DNS so
// the browser doesn't hit "no address found" on the first load.
async function waitForTunnelReady(url: string, timeoutMs = 20_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(url, {
				method: 'HEAD',
				redirect: 'manual',
				signal: AbortSignal.timeout(3000),
			});
			// Any HTTP response (even 4xx/5xx from the origin) means the tunnel
			// hostname now resolves and the edge is routing to the container.
			if (response.status > 0) return;
		} catch {
			// DNS not yet resolvable or connection not ready — retry shortly.
		}
		await new Promise((resolve) => setTimeout(resolve, 750));
	}
}

function getDemoHTML(): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sandbox Tunnel</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:'Space Grotesk',sans-serif;background:#050816;color:#e8e6e3}
  .card{text-align:center;padding:3rem 4rem;border:1px solid #263257;background:linear-gradient(180deg,#0d1224 0%,#0a1020 100%)}
  h1{font-size:2.5rem;margin-bottom:.5rem;font-weight:600;letter-spacing:-.02em}
  .accent{color:#7dd3fc}
  p{color:#a8b2d6;margin-top:.75rem;font-size:1.05rem}
  .badge{display:inline-block;margin-top:1.25rem;padding:.3rem 1rem;background:rgba(125,211,252,.12);color:#bae6fd;font-size:.8rem;font-family:'JetBrains Mono',monospace;letter-spacing:.04em;border:1px solid rgba(125,211,252,.2)}
</style>
</head>
<body>
  <div class="card">
    <h1>Quick <span class="accent">Tunnel</span></h1>
    <p>Served from a sandbox and exposed on a trycloudflare.com URL.</p>
    <div class="badge">sandbox.tunnels.get(8081)</div>
  </div>
</body>
</html>`;
}
