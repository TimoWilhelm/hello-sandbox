import { Hono } from 'hono';

import { sandbox } from './sandbox';

const app = new Hono<{ Bindings: Env; Variables: { sandboxId: string } }>();

app.post('/', async (c) => {
	const {
		code,
		language = 'python',
		contextId,
	} = await c.req.json<{ code: string; language?: 'python' | 'javascript'; contextId?: string }>();
	if (!code) return c.json({ error: 'code is required' }, 400);
	if (language !== 'python' && language !== 'javascript') return c.json({ error: 'Unsupported language' }, 400);
	const sb = sandbox(c);
	let result = await sb.runCode(code, language, contextId);
	if (language === 'javascript' && result.error?.message.includes('has already been declared')) result = await sb.runCode(code, language);
	return c.json(result);
});

export default app;
