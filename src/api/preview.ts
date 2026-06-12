import { Hono } from 'hono';

import { sandbox } from './sandbox';

// Dedicated docroot so the preview demo never collides with the tunnel demo,
// which serves its own page from a separate directory in the same sandbox.
const PREVIEW_DIR = '/workspace/preview';

const app = new Hono<{ Bindings: Env; Variables: { sandboxId: string } }>();

app.post('/start', async (c) => {
	const { command, port: portRaw } = await c.req.json<{
		command?: string;
		port?: number;
	}>();
	const sb = sandbox(c);
	// Use .host (includes port) so the SDK can construct correct local dev URLs
	const hostname = new URL(c.req.url).host;
	const cmd = command || 'python3 -m http.server 8080';
	const port = portRaw || 8080;

	// Always (over)write the demo page into the dedicated docroot so the
	// preview deterministically serves its own content regardless of order.
	await sb.mkdir(PREVIEW_DIR, { recursive: true });
	await sb.writeFile(`${PREVIEW_DIR}/index.html`, getDemoHTML());

	// Start server and wait for port readiness
	const proc = await sb.startProcess(cmd, { cwd: PREVIEW_DIR });
	await proc.waitForPort(port, { mode: 'tcp', timeout: 10_000 });

	// Reuse existing preview URL if the port is already exposed
	const exposedPorts = await sb.getExposedPorts(hostname);
	const existing = exposedPorts.find((p) => p.port === port);
	if (existing) {
		return c.json({ success: true, url: existing.url, port: existing.port });
	}

	const exposed = await sb.exposePort(port, { hostname });
	return c.json({ success: true, url: exposed.url, port: exposed.port });
});

app.post('/stop', async (c) => {
	const { port } = await c.req.json<{ port?: number }>();
	await sandbox(c).unexposePort(port || 8080);
	return c.json({ success: true });
});

app.post('/list', async (c) => {
	const hostname = new URL(c.req.url).host;
	const ports = await sandbox(c).getExposedPorts(hostname);
	return c.json({ ports });
});

export default app;

// -- Demo page served from inside the container --
function getDemoHTML(): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sandbox Preview</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:'Space Grotesk',sans-serif;background:#0a0a0f;color:#e8e6e3}
  .card{text-align:center;padding:3rem 4rem;border:1px solid #2a2a3a;background:#12121a}
  h1{font-size:2.5rem;margin-bottom:.5rem;font-weight:600;letter-spacing:-.02em}
  .accent{color:#ff6b35}
  p{color:#8a8a9a;margin-top:.75rem;font-size:1.05rem}
  .badge{display:inline-block;margin-top:1.25rem;padding:.3rem 1rem;background:rgba(255,107,53,.1);color:#ff8c5a;font-size:.8rem;font-family:'JetBrains Mono',monospace;letter-spacing:.04em;border:1px solid rgba(255,107,53,.2)}
</style>
</head>
<body>
  <div class="card">
    <h1>Hello from <span class="accent">Sandbox</span></h1>
    <p>Served from an isolated container on Cloudflare's edge network.</p>
    <div class="badge">sandbox.exposePort(8080)</div>
  </div>
</body>
</html>`;
}
