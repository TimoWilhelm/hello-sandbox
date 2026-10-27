import { createServer } from 'node:http';
import { format, inspect } from 'node:util';
import { createContext, Script } from 'node:vm';

let stdout: string[] = [];
let stderr: string[] = [];
let executionCount = 0;
const context = createContext({
	console: {
		log: (...values: unknown[]) => stdout.push(format(...values)),
		info: (...values: unknown[]) => stdout.push(format(...values)),
		warn: (...values: unknown[]) => stderr.push(format(...values)),
		error: (...values: unknown[]) => stderr.push(format(...values)),
	},
	fetch,
	URL,
	URLSearchParams,
	TextEncoder,
	TextDecoder,
	Buffer,
	setTimeout,
	clearTimeout,
});
let queue = Promise.resolve();
createServer((request, response) => {
	if (request.method === 'GET') {
		response.end('ready');
		return;
	}
	queue = queue
		.then(async () => {
			stdout = [];
			stderr = [];
			executionCount++;
			const chunks: Buffer[] = [];
			for await (const chunk of request) chunks.push(Buffer.from(chunk));
			const code = Buffer.concat(chunks).toString();
			let error: { name: string; message: string; traceback: string[] } | undefined;
			const results: Record<string, unknown>[] = [];
			try {
				const value: unknown = await new Script(code).runInContext(context, { timeout: 55_000 });
				if (value !== undefined) {
					results.push({ text: typeof value === 'string' ? value : inspect(value) });
					try {
						if (typeof value === 'object' && value !== null) results.push({ json: structuredClone(value) });
					} catch {
						/* Non-JSON values still have text. */
					}
				}
			} catch (error_) {
				// VM errors belong to another realm and do not pass instanceof Error.
				const caught = typeof error_ === 'object' && error_ !== null ? error_ : {};
				const name = 'name' in caught ? String(caught.name) : 'Error';
				const message = 'message' in caught ? String(caught.message) : String(error_);
				const stack = 'stack' in caught ? String(caught.stack) : '';
				error = { name, message, traceback: stack.split('\n') };
			}
			response.setHeader('Content-Type', 'application/json');
			response.end(JSON.stringify({ logs: { stdout, stderr }, results, error, executionCount }));
		})
		.catch(() => {
			response.writeHead(500);
			response.end('Kernel request failed');
		});
}).listen(Number(process.argv[2]), '0.0.0.0');
