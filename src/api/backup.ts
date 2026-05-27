import { Hono } from 'hono';

import { sandbox } from './sandbox';

const app = new Hono<{ Bindings: Env; Variables: { sandboxId: string } }>();

const DEFAULT_MOUNT_PATH = '/data';

function isBackupConfigured(environment: Env): boolean {
	return 'BACKUP_BUCKET' in environment && environment.BACKUP_BUCKET != undefined;
}

function shouldUseLocalBucket(c: { env: Env & { LOCAL_DEV?: string }; req: { url: string } }): boolean {
	if (c.env.LOCAL_DEV === 'true') return true;

	const hostname = new URL(c.req.url).hostname;
	return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.localhost');
}

function parseMountError(error: unknown): { error: string; code?: string } {
	const message = error instanceof Error ? error.message : String(error);

	if (message.includes('BACKUP_BUCKET')) {
		return {
			error: 'Mounting R2 requires a BACKUP_BUCKET binding in wrangler.jsonc.',
			code: 'BACKUP_NOT_CONFIGURED',
		};
	}

	if (message.includes('ContainerProxy')) {
		return {
			error: 'Mounting R2 requires exporting ContainerProxy from the Worker entrypoint.',
			code: 'CONTAINER_PROXY_REQUIRED',
		};
	}

	if (message.includes('already in use') || message.includes('already mounted')) {
		return {
			error: 'That mount path is already in use. Unmount it first or choose a different path.',
			code: 'MOUNT_PATH_IN_USE',
		};
	}

	return { error: message };
}

app.post('/mount', async (c) => {
	const { path } = await c.req.json<{ path?: string }>();
	const mountPath = path || DEFAULT_MOUNT_PATH;

	if (!isBackupConfigured(c.env)) {
		return c.json({ error: 'Mounting R2 requires a BACKUP_BUCKET binding in wrangler.jsonc.' }, 400);
	}

	try {
		const localMode = shouldUseLocalBucket(c);
		await (localMode
			? sandbox(c).mountBucket('BACKUP_BUCKET', mountPath, { localBucket: true })
			: sandbox(c).mountBucket('BACKUP_BUCKET', mountPath, {}));
		return c.json({ success: true, path: mountPath, mode: localMode ? 'local' : 'production' });
	} catch (error) {
		const parsed = parseMountError(error);
		if (parsed.code === 'MOUNT_PATH_IN_USE') {
			return c.json({ success: true, path: mountPath, mode: shouldUseLocalBucket(c) ? 'local' : 'production' });
		}
		return c.json(parsed, parsed.code ? 400 : 500);
	}
});

app.post('/write', async (c) => {
	const { path, content } = await c.req.json<{ path?: string; content?: string }>();
	const filePath = path || `${DEFAULT_MOUNT_PATH}/results.json`;

	if (!content) {
		return c.json({ error: 'content is required' }, 400);
	}

	try {
		await sandbox(c).writeFile(filePath, content);
		return c.json({ success: true, path: filePath });
	} catch (error) {
		const parsed = parseMountError(error);
		return c.json(parsed, parsed.code ? 400 : 500);
	}
});

app.post('/unmount', async (c) => {
	const { path } = await c.req.json<{ path?: string }>();
	const mountPath = path || DEFAULT_MOUNT_PATH;

	try {
		await sandbox(c).unmountBucket(mountPath);
		return c.json({ success: true, path: mountPath });
	} catch (error) {
		const parsed = parseMountError(error);
		return c.json(parsed, parsed.code ? 400 : 500);
	}
});

app.post('/status', (c) => {
	if (!isBackupConfigured(c.env)) {
		return c.json({
			available: false,
			message: 'Add a BACKUP_BUCKET R2 binding to wrangler.jsonc to mount the bucket into your sandbox.',
			mode: shouldUseLocalBucket(c) ? 'local' : 'production',
		});
	}

	return c.json({
		available: true,
		message:
			'Mount BACKUP_BUCKET into the sandbox filesystem with sandbox.mountBucket(). Files written under the mount path persist in R2.',
		mode: shouldUseLocalBucket(c) ? 'local' : 'production',
	});
});

export default app;
