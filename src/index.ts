import { WorkerEntrypoint } from 'cloudflare:workers';
import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';

import api from './api';

export { Sandbox, OpencodeSandbox } from './runtime/sandbox';
export { S3Gateway } from '@cloudflare/sandbox';

export class Outbound extends WorkerEntrypoint {
	async fetch(request: Request) {
		if (new URL(request.url).hostname !== 'httpbin.org') return new Response('Origin is disallowed', { status: 403 });
		const headers = new Headers(request.headers);
		headers.set('Authorization', 'Bearer sb_demo_secret_token_12345');
		headers.set('X-Sandbox-Auth', 'injected-by-outbound-worker');
		return fetch(new Request(request, { headers }));
	}
}

const app = new Hono<{ Bindings: Env; Variables: { sandboxId: string } }>();

// A preview token grants access to one port of one user's container.
app.use('*', async (c, next) => {
	const host = new URL(c.req.url).hostname;
	const preview = /^(\d+)-((?:oc-)?[a-f0-9-]{36})-([a-z0-9]{16})\.(?:sandbox-sdk\.site|localhost)$/.exec(host);
	if (!preview) return next();
	const [, port, name, token] = preview;
	const namespace = name.startsWith('oc-') ? c.env.OpencodeSandbox : c.env.Sandbox;
	const headers = new Headers(c.req.raw.headers);
	// Replace visitor-supplied controls with the values authenticated by the hostname.
	headers.set('X-Sandbox-Port', port);
	headers.set('X-Sandbox-Token', token);
	return namespace.getByName(name).fetch(new Request(c.req.raw, { headers }));
});

app.use('*', async (c, next) => {
	let sandboxId = getCookie(c, 'sandbox_id');
	if (!sandboxId || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(sandboxId)) {
		sandboxId = crypto.randomUUID();
		setCookie(c, 'sandbox_id', sandboxId, {
			path: '/',
			httpOnly: true,
			secure: new URL(c.req.url).protocol === 'https:',
			sameSite: 'Lax',
			maxAge: 60 * 60 * 24 * 365,
		});
	}
	c.set('sandboxId', sandboxId);
	return next();
});

app.get('/ws/terminal', async (c) => {
	const headers = new Headers(c.req.raw.headers);
	headers.delete('X-Sandbox-Port');
	headers.delete('X-Sandbox-Token');
	return c.env.Sandbox.getByName(c.get('sandboxId')).fetch(new Request(c.req.raw, { headers }));
});

app.get('/api/opencode/start', async (c) => {
	const sandbox = c.env.OpencodeSandbox.getByName(`oc-${c.get('sandboxId')}`);
	const { url } = await sandbox.startOpencode(new URL(c.req.url).host);
	return c.json({ url });
});

app.route('/api', api);
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));
export default app;
