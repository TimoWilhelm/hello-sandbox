/**
 * Shared sandbox accessor — resolves the per-user sandbox from Hono context
 */
import type { Context } from 'hono';

export function sandbox(c: Context<{ Bindings: Env; Variables: { sandboxId: string } }>) {
	const sandboxId = c.get('sandboxId');
	return c.env.Sandbox.getByName(sandboxId);
}
