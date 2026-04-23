import { Sandbox as BaseSandbox, getSandbox, proxyToSandbox } from '@cloudflare/sandbox';
import { createOpencodeServer } from '@cloudflare/sandbox/opencode';
import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';

import api from './api';

export class Sandbox extends BaseSandbox {
	interceptHttps = true;
}

Sandbox.outboundByHost = {
	'httpbin.org': (request: Request) => {
		const requestWithAuth = new Request(request);
		requestWithAuth.headers.set('Authorization', 'Bearer sb_demo_secret_token_12345');
		requestWithAuth.headers.set('X-Sandbox-Auth', 'injected-by-outbound-worker');
		return fetch(requestWithAuth);
	},
};

const COOKIE_NAME = 'sandbox_id';

const app = new Hono<{ Bindings: Env; Variables: { sandboxId: string } }>();

// Assign a unique sandbox ID per user via a persistent cookie.
// If no cookie is present, generate a new UUID and set it.
app.use('*', async (c, next) => {
	let sandboxId = getCookie(c, COOKIE_NAME);
	if (!sandboxId) {
		sandboxId = crypto.randomUUID();
		setCookie(c, COOKIE_NAME, sandboxId, {
			path: '/',
			httpOnly: true,
			sameSite: 'Lax',
			maxAge: 60 * 60 * 24 * 365, // 1 year
		});
	}
	c.set('sandboxId', sandboxId);
	return next();
});

// Route preview-URL requests to the correct sandbox binding.
// Both Sandbox and OpencodeSandbox use the same Sandbox class, so proxyToSandbox
// can't distinguish them. We check the hostname for the OpenCode sandbox ID first
// and proxy with only that binding, then fall through to the default.
app.use('*', async (c, next) => {
	const host = new URL(c.req.url).hostname;

	// OpenCode preview URLs contain the sandbox ID prefix "oc-" in the subdomain.
	// Pass only the OpencodeSandbox binding so proxyToSandbox routes to the right DO.
	if (host.includes('-oc-')) {
		const response = await proxyToSandbox(c.req.raw, { Sandbox: c.env.OpencodeSandbox });
		if (response) return response;
	}

	// Default sandbox preview URLs
	const response = await proxyToSandbox(c.req.raw, { Sandbox: c.env.Sandbox });
	if (response) return response;

	return next();
});

// WebSocket terminal upgrade — must be handled before Hono JSON routing
app.get('/ws/terminal', async (c) => {
	if (c.req.header('Upgrade') !== 'websocket') {
		return c.text('WebSocket upgrade required', 426);
	}
	const sandboxId = c.get('sandboxId');
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any -- sandbox proxy typing not available
	const sb = getSandbox(c.env.Sandbox, sandboxId) as any;
	return await sb.terminal(c.req.raw, { cols: 120, rows: 30 });
});

// OpenCode: start the server, expose its port, return the preview URL for iframe embedding
app.get('/api/opencode/start', async (c) => {
	// Use .host (includes port) so the SDK constructs correct local dev URLs
	const hostname = new URL(c.req.url).host;
	const sandboxId = c.get('sandboxId');
	const sandbox = getSandbox(c.env.OpencodeSandbox, `oc-${sandboxId.slice(0, 8)}`);

	// Clone the agents repo into the working directory if it doesn't exist yet
	const { exists } = await sandbox.exists('/home/user/agents');
	if (!exists) {
		await sandbox.gitCheckout('https://github.com/cloudflare/agents', {
			targetDir: '/home/user/agents',
			depth: 1,
		});
	}

	const server = await createOpencodeServer(sandbox, {
		directory: '/home/user/agents',
	});

	// Reuse existing preview URL if the port is already exposed
	const exposedPorts = await sandbox.getExposedPorts(hostname);
	const existing = exposedPorts.find((p) => p.port === server.port);
	const exposed = existing ?? (await sandbox.exposePort(server.port, { hostname, name: 'opencode' }));
	const url = exposed.url;

	return c.json({ url });
});

// Mount all API routes
app.route('/api', api);

// Fall back to static assets for everything else (SPA)
app.all('*', async (c) => {
	return c.env.ASSETS.fetch(c.req.raw);
});

export default app;

export { ContainerProxy, Sandbox as OpencodeSandbox } from '@cloudflare/sandbox';
