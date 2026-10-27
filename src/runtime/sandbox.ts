import { Files, S3Mount, SandboxFileError } from '@cloudflare/sandbox';
import { DurableObject } from 'cloudflare:workers';

import { openTerminal } from './terminal';
import { bridgeWebSocket } from './websocket-bridge';

const IDLE_MS = 10 * 60_000;
const LIFETIME_MS = 3 * 60 * 60_000;
const CA = '/etc/cloudflare/certs/cloudflare-containers-ca.crt';
const BUNDLE = '/etc/ssl/certs/ca-certificates.crt';
const EXEC_ENV = { HOME: '/root', NODE_EXTRA_CA_CERTS: BUNDLE, REQUESTS_CA_BUNDLE: BUNDLE, MPLBACKEND: 'Agg' };
const PROCESS_ROOT = '/tmp/demo-processes';

type PortToken = { token: string; name?: string };
type CodeContext = { id: string; port: number; language: 'python' | 'javascript' };
type Execution = {
	logs: { stdout: string[]; stderr: string[] };
	results: Record<string, string | object>[];
	error?: { name: string; message: string; traceback: string[] } | null;
	executionCount: number;
};

function checkPort(port: number) {
	if (!Number.isInteger(port) || port < 1024 || port > 65_535) throw new Error('Invalid port');
}

function previewUrl(port: number, name: string, token: string, hostname: string) {
	hostname = hostname.replace('127.0.0.1', 'localhost');
	const protocol = hostname.includes('localhost') ? 'http' : 'https';
	return `${protocol}://${port}-${name}-${token}.${hostname}/`;
}

/** Application methods built on the native container API and Sandbox SDK 1.0 Files/S3Mount. */
export class Sandbox extends DurableObject<Env> {
	private setup: Promise<void> | undefined;
	private queues = new Map<string, Promise<unknown>>();

	constructor(context: DurableObjectState, environment: Env) {
		super(context, environment);
		if (context.container?.running) void context.blockConcurrencyWhile(() => context.container!.setInactivityTimeout(IDLE_MS));
	}

	private get container(): Container {
		if (!this.ctx.container) throw new Error('No container configured');
		return this.ctx.container;
	}

	private get files() {
		return new Files(this.container);
	}

	private readonly mounts = new S3Mount(this.container, this.ctx.exports.S3Gateway);

	private async serial<T>(key: string, operation: () => Promise<T>): Promise<T> {
		const previous = this.queues.get(key) ?? Promise.resolve();
		const next = previous.catch(() => {}).then(operation);
		this.queues.set(key, next);
		try {
			return await next;
		} finally {
			if (this.queues.get(key) === next) this.queues.delete(key);
		}
	}

	private async ensureRunning() {
		if (!this.setup || !this.container.running) {
			this.setup = this.startContainer().catch((error: unknown) => {
				this.setup = undefined;
				throw error;
			});
		}
		await this.setup;
	}

	private async startContainer() {
		const fresh = !this.container.running;
		if (fresh) {
			this.container.start({ image: this.container.images.sandbox, instance: 'basic', enableInternet: true });
			await this.ctx.storage.setAlarm(Date.now() + LIFETIME_MS);
		}
		try {
			// A hostname-specific intercept leaves S3Mount's HTTP gateway independent.
			await this.container.interceptOutboundHttps('httpbin.org', this.ctx.exports.Outbound({ props: {} }));
			const trust = await this.container.exec([
				'sh',
				'-c',
				`system=${BUNDLE}.system; [ -e "$system" ] || cp ${BUNDLE} "$system";
timeout 10 sh -c 'until [ -s ${CA} ]; do sleep 0.1; done' && cat "$system" ${CA} > ${BUNDLE}.tmp && mv ${BUNDLE}.tmp ${BUNDLE}`,
			]);
			if ((await trust.exitCode) !== 0) throw new Error('Could not install the outbound intercept certificate');
			await this.container.setInactivityTimeout(IDLE_MS);
		} catch (error) {
			await this.container.destroy();
			throw error;
		}
	}

	async alarm() {
		await this.container.destroy();
		this.setup = undefined;
	}

	private async run(argv: string[], cwd = '/workspace') {
		const process = await this.container.exec(argv, { cwd, env: EXEC_ENV });
		const output = await process.output();
		return { stdout: new TextDecoder().decode(output.stdout), stderr: new TextDecoder().decode(output.stderr), exitCode: output.exitCode };
	}

	async exec(command: string) {
		await this.ensureRunning();
		const started = Date.now();
		const result = await this.run(['timeout', '-k', '5', '120', 'bash', '-lc', command]);
		return { ...result, command, duration: Date.now() - started, success: result.exitCode === 0 };
	}

	async writeFile(path: string, content: string) {
		await this.ensureRunning();
		await this.files.writeFile(path, content);
		return { success: true, path };
	}

	async readFile(path: string) {
		await this.ensureRunning();
		const response = await this.files.readFile(path);
		const content = await response.text();
		return {
			success: true,
			path,
			content,
			size: new TextEncoder().encode(content).length,
			mimeType: response.headers.get('Content-Type') ?? 'text/plain',
		};
	}

	async mkdir(path: string, options: { recursive: boolean }) {
		await this.ensureRunning();
		await this.files.mkdir(path, options);
		return { success: true, path };
	}

	async listFiles(path: string) {
		await this.ensureRunning();
		const files = await this.files.readDirectory(path);
		return { success: true, path, files, count: files.length };
	}

	async deleteFile(path: string) {
		await this.ensureRunning();
		await this.files.remove(path, { recursive: true });
		return { success: true, path };
	}

	async exists(path: string) {
		await this.ensureRunning();
		try {
			await this.files.stat(path);
			return { path, exists: true };
		} catch (error) {
			if (SandboxFileError.is(error) && error.code === 'ENOENT') return { path, exists: false };
			throw error;
		}
	}

	private async portReady(port: number) {
		const result = await this.run([
			'python3',
			'-c',
			'import socket,sys; s=socket.socket(); s.settimeout(.25); sys.exit(s.connect_ex(("127.0.0.1",int(sys.argv[1]))))',
			String(port),
		]);
		return result.exitCode === 0;
	}

	private async launch(id: string, command: string, cwd = '/workspace') {
		await this.run(['mkdir', '-p', PROCESS_ROOT]);
		await this.container.exec(
			[
				'bash',
				'-c',
				'echo $$ > "$1.pid"; exec >"$1.log" 2>&1; cd -- "$2"; exec bash -lc "$3"',
				'bash',
				`${PROCESS_ROOT}/${id}`,
				cwd,
				command,
			],
			{ env: EXEC_ENV, stdout: 'ignore', stderr: 'ignore' },
		);
	}

	async startServer(command: string, port: number, cwd: string) {
		checkPort(port);
		await this.ensureRunning();
		await this.serial(`server:${port}`, async () => {
			if (await this.portReady(port)) return;
			await this.launch(`server-${port}`, command, cwd);
			const deadline = Date.now() + 30_000;
			while (Date.now() < deadline) {
				if (await this.portReady(port)) return;
				await scheduler.wait(250);
			}
			const log = await this.run(['tail', '-c', '4000', `${PROCESS_ROOT}/server-${port}.log`]);
			throw new Error(`Server did not open port ${port}: ${log.stdout}`);
		});
	}

	async exposePort(port: number, options: { hostname: string; name?: string }) {
		checkPort(port);
		const key = `port:${port}`;
		let stored = await this.ctx.storage.get<PortToken>(key);
		if (!stored) {
			const token = [...crypto.getRandomValues(new Uint8Array(16))].map((byte) => (byte % 36).toString(36)).join('');
			stored = { token, name: options.name };
			await this.ctx.storage.put(key, stored);
		}
		return { port, name: stored.name, url: previewUrl(port, this.ctx.id.name!, stored.token, options.hostname) };
	}

	async getExposedPorts(hostname: string) {
		const tokens = await this.ctx.storage.list<PortToken>({ prefix: 'port:' });
		return [...tokens].map(([key, entry]) => ({
			port: Number(key.slice(5)),
			name: entry.name,
			url: previewUrl(Number(key.slice(5)), this.ctx.id.name!, entry.token, hostname),
		}));
	}

	async unexposePort(port: number) {
		await this.ctx.storage.delete(`port:${port}`);
	}

	async fetch(request: Request): Promise<Response> {
		const port = Number(request.headers.get('X-Sandbox-Port'));
		if (!port) {
			await this.ensureRunning();
			return openTerminal(this.container, request, EXEC_ENV);
		}
		const supplied = new TextEncoder().encode(request.headers.get('X-Sandbox-Token') ?? '');
		const stored = await this.ctx.storage.get<PortToken>(`port:${port}`);
		const expected = new TextEncoder().encode(stored?.token ?? '');
		if (!stored || supplied.length !== expected.length || !crypto.subtle.timingSafeEqual(supplied, expected))
			return new Response('Not found', { status: 404 });
		await this.ensureRunning();
		const headers = new Headers(request.headers);
		headers.delete('X-Sandbox-Port');
		headers.delete('X-Sandbox-Token');
		const url = new URL(request.url);
		url.protocol = 'http:';
		try {
			const response = await this.container.getTcpPort(port).fetch(new Request(url, new Request(request, { headers })));
			return response.webSocket ? bridgeWebSocket(response) : response;
		} catch {
			return new Response('Nothing is listening on this port', { status: 503 });
		}
	}

	async openTunnel(port: number) {
		checkPort(port);
		await this.ensureRunning();
		return this.serial(`tunnel:${port}`, async () => {
			const id = `tunnel-${port}`;
			const status = () =>
				this.run([
					'bash',
					'-c',
					String.raw`kill -0 "$(cat "$1.pid")" 2>/dev/null && grep -q "Registered tunnel connection" "$1.log" && grep -o -m1 -E "https://[a-z0-9-]+\.trycloudflare\.com" "$1.log"`,
					'bash',
					`${PROCESS_ROOT}/${id}`,
				]);
			const existing = await status();
			if (existing.exitCode === 0) return { port, url: existing.stdout.trim() };
			await this.stopProcess(id);
			await this.launch(id, `exec cloudflared tunnel --no-autoupdate --url http://127.0.0.1:${port}`);
			const deadline = Date.now() + 30_000;
			while (Date.now() < deadline) {
				const result = await status();
				if (result.exitCode === 0) return { port, url: result.stdout.trim() };
				await scheduler.wait(500);
			}
			await this.stopProcess(id);
			throw new Error('The tunnel did not connect within 30 seconds');
		});
	}

	private async stopProcess(id: string) {
		await this.run([
			'bash',
			'-c',
			'if [ -f "$1.pid" ]; then pid=$(cat "$1.pid"); kill -TERM "$pid" 2>/dev/null || true; rm -f "$1.pid"; fi',
			'bash',
			`${PROCESS_ROOT}/${id}`,
		]);
	}

	async closeTunnel(port: number) {
		checkPort(port);
		if (this.container.running) await this.stopProcess(`tunnel-${port}`);
	}

	async runCode(code: string, language: CodeContext['language'], contextId?: string) {
		await this.ensureRunning();
		const selected = await this.serial('context-allocation', async () => {
			const existing = contextId ? await this.ctx.storage.get<CodeContext>(`context:${contextId}`) : undefined;
			if (existing?.language === language) return existing;
			const contexts = await this.ctx.storage.list<CodeContext>({ prefix: 'context:' });
			if (contexts.size >= 32) throw new Error('Maximum of 32 code contexts per sandbox reached; start a new sandbox session.');
			const ports = new Set([...contexts.values()].map((c) => c.port));
			let port = 8800;
			while (ports.has(port)) port++;
			const context = { id: crypto.randomUUID(), port, language };
			await this.ctx.storage.put(`context:${context.id}`, context);
			return context;
		});
		return this.serial(`kernel:${selected.id}`, async () => {
			const command =
				language === 'python'
					? `exec python3 /opt/python-kernel.py ${selected.port}`
					: `exec node /opt/javascript-kernel.ts ${selected.port}`;
			await this.startServer(command, selected.port, '/workspace');
			try {
				const response = await this.container
					.getTcpPort(selected.port)
					.fetch('http://kernel/', { method: 'POST', body: code, signal: AbortSignal.timeout(60_000) });
				const result = await response.json<Execution>();
				// eslint-disable-next-line unicorn/no-null -- Preserve the existing HTTP interpreter contract.
				return { ...result, error: result.error ? { ...result.error, value: result.error.message } : null, contextId: selected.id, code };
			} catch (error) {
				// Stop timed-out or lost kernels so a later cell cannot overlap one still running.
				await this.stopProcess(`server-${selected.port}`);
				throw error;
			}
		});
	}

	async mountData(path: string) {
		await this.ensureRunning();
		if (!this.env.S3_ACCESS_KEY_ID || !this.env.S3_SECRET_ACCESS_KEY) throw new Error('R2 mount credentials are not configured');
		await this.mounts.mount({
			mountPath: path,
			access: 'read-write',
			keyPrefix: `sandboxes/${this.ctx.id.name}`,
			source: {
				type: 's3',
				endpoint: this.env.S3_ENDPOINT,
				region: 'auto',
				bucket: this.env.S3_BUCKET,
				credentials: { type: 'static', accessKeyId: this.env.S3_ACCESS_KEY_ID, secretAccessKey: this.env.S3_SECRET_ACCESS_KEY },
			},
		});
	}

	async unmountData(path: string) {
		if (this.container.running) await this.mounts.unmount(path);
	}

	async watch(path: string, options: { recursive: boolean; include?: string[] }) {
		await this.ensureRunning();
		const abort = new AbortController();
		const process = await this.container.exec(
			[
				'inotifywait',
				'-m',
				...(options.recursive ? ['-r'] : []),
				'-e',
				'create,modify,delete,moved_from,moved_to,attrib',
				'--format',
				'%e|%w%f',
				'--',
				path,
			],
			{ signal: abort.signal },
		);
		void process.exitCode.catch(() => {});
		// Do not announce readiness until inotify has installed the watches.
		const startup = process.stderr!.pipeThrough(new TextDecoderStream()).getReader();
		const timer = setTimeout(() => abort.abort(new Error('File watcher startup timed out')), 10_000);
		try {
			let status = '';
			while (!status.includes('Watches established.')) {
				const message = await startup.read();
				if (message.done) throw new Error(`File watcher failed: ${status}`);
				status += message.value;
			}
		} finally {
			clearTimeout(timer);
			startup.releaseLock();
		}
		const reader = process.stdout!.pipeThrough(new TextDecoderStream()).getReader();
		const encoder = new TextEncoder();
		let buffered = '';
		const filters = options.include?.map(
			(pattern) =>
				new RegExp(
					`^${pattern
						.split('*')
						.map((part) => part.replaceAll(/[.+?^${}()|[\]\\]/g, String.raw`\$&`))
						.join('.*')}$`,
				),
		);
		const types: Record<string, string> = {
			CREATE: 'create',
			MODIFY: 'modify',
			DELETE: 'delete',
			MOVED_FROM: 'move_from',
			MOVED_TO: 'move_to',
			ATTRIB: 'attrib',
		};
		return new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(encoder.encode(': watching\n\n'));
			},
			async pull(controller) {
				try {
					let emitted = false;
					while (!emitted) {
						const { value, done } = await reader.read();
						if (done) {
							controller.close();
							return;
						}
						buffered += value;
						const lines = buffered.split('\n');
						buffered = lines.pop() ?? '';
						for (const line of lines) {
							const split = line.indexOf('|');
							const filePath = line.slice(split + 1);
							const eventType = types[line.slice(0, split).split(',')[0]];
							if (eventType && (!filters?.length || filters.some((filter) => filter.test(filePath.split('/').pop() ?? '')))) {
								controller.enqueue(encoder.encode(`data: ${JSON.stringify({ eventType, path: filePath })}\n\n`));
								emitted = true;
							}
						}
					}
				} catch (error) {
					controller.error(error);
					abort.abort();
				}
			},
			async cancel() {
				abort.abort();
				await reader.cancel();
			},
		});
	}

	async startOpencode(hostname: string) {
		await this.ensureRunning();
		return this.serial('opencode', async () => {
			const directory = await this.exists('/home/user/agents');
			if (!directory.exists) {
				await this.run(['mkdir', '-p', '/home/user']);
				const cloned = await this.run([
					'timeout',
					'120',
					'git',
					'clone',
					'--depth',
					'1',
					'--',
					'https://github.com/cloudflare/agents',
					'/home/user/agents',
				]);
				if (cloned.exitCode !== 0) throw new Error(`Repository clone failed: ${cloned.stderr}`);
			}
			await this.startServer('exec opencode serve --hostname 0.0.0.0 --port 4096', 4096, '/home/user/agents');
			return this.exposePort(4096, { hostname, name: 'opencode' });
		});
	}
}

export class OpencodeSandbox extends Sandbox {}
