/**
 * Central API router — mounts all sub-routers under /api
 */
import { Hono } from 'hono';
import { deleteCookie } from 'hono/cookie';
import { cors } from 'hono/cors';

import ai from './ai';
import auth from './auth';
import backup from './backup';
import exec from './exec';
import files from './files';
import interpreter from './interpreter';
import preview from './preview';
import watch from './watch';

const api = new Hono<{ Bindings: Env; Variables: { sandboxId: string } }>();

api.use('/*', cors());

// Mount sub-routers
api.route('/exec', exec);
api.route('/auth', auth);
api.route('/files', files);
api.route('/code', interpreter);
api.route('/ai', ai);
api.route('/preview', preview);
api.route('/watch', watch);
api.route('/backup', backup);

// Health / status — returns the per-user sandbox ID
api.get('/status', (c) =>
	c.json({
		sandbox: c.get('sandboxId'),
		status: 'ready',
		features: ['exec', 'files', 'code-interpreter', 'ai', 'terminal', 'preview', 'watch', 'backup', 'auth'],
	}),
);

// Session reset — clears the sandbox_id cookie so the next request gets a fresh sandbox
api.delete('/session', (c) => {
	deleteCookie(c, 'sandbox_id', { path: '/' });
	return c.json({ ok: true });
});

export default api;
