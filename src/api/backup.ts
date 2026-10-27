import { Hono } from 'hono';

import { sandbox } from './sandbox';

const app = new Hono<{ Bindings: Env; Variables: { sandboxId: string } }>();
const DEFAULT_PATH = '/data';

app.post('/mount', async (c) => {
	const { path = DEFAULT_PATH } = await c.req.json<{ path?: string }>();
	await sandbox(c).mountData(path);
	return c.json({ success: true, path, mode: 'production' });
});

app.post('/write', async (c) => {
	const { path = `${DEFAULT_PATH}/results.json`, content } = await c.req.json<{ path?: string; content?: string }>();
	if (content === undefined) return c.json({ error: 'content is required' }, 400);
	await sandbox(c).writeFile(path, content);
	return c.json({ success: true, path });
});

app.post('/unmount', async (c) => {
	const { path = DEFAULT_PATH } = await c.req.json<{ path?: string }>();
	await sandbox(c).unmountData(path);
	return c.json({ success: true, path });
});

app.post('/status', (c) =>
	c.json({
		available: Boolean(c.env.S3_ACCESS_KEY_ID && c.env.S3_SECRET_ACCESS_KEY),
		message: 'S3Mount mounts your sandbox prefix in R2. Its bucket-scoped credentials stay in the Worker.',
		mode: 'production',
	}),
);

export default app;
