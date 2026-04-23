import { Hono } from 'hono';
import { z } from 'zod';

import { sandbox } from './sandbox';

const httpbinSchema = z.object({
	headers: z.record(z.string(), z.string()),
});

const app = new Hono<{ Bindings: Env; Variables: { sandboxId: string } }>();

app.post('/request', async (c) => {
	const sb = sandbox(c);
	const result = await sb.exec('curl https://httpbin.org/headers');

	if (!result.success || !result.stdout.trim()) {
		console.error('auth request failed', {
			exitCode: result.exitCode,
			stdout: result.stdout,
			stderr: result.stderr,
			duration: result.duration,
		});
		return c.json({ error: 'Request failed', exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr }, 500);
	}

	const parsed = httpbinSchema.safeParse(JSON.parse(result.stdout));
	if (!parsed.success) {
		console.error('auth response parse failed', { stdout: result.stdout, stderr: result.stderr });
		return c.json({ error: 'Failed to parse response', stdout: result.stdout, stderr: result.stderr }, 500);
	}

	return c.json({
		headers: parsed.data.headers,
		exitCode: result.exitCode,
		success: result.success,
		duration: result.duration,
	});
});

export default app;
