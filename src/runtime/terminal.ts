const size = (value: string | null, fallback: number) => Math.max(1, Math.min(500, Number(value) || fallback));

export async function openTerminal(container: Container, request: Request, environment: Record<string, string>) {
	if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket upgrade required', { status: 426 });
	const url = new URL(request.url);
	const session = url.searchParams.get('session') || 'main';
	if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(session)) return new Response('Invalid session', { status: 400 });
	const abort = new AbortController();
	const tmux = await container.exec(['tmux', 'new-session', '-A', '-s', session], {
		pty: { cols: size(url.searchParams.get('cols'), 120), rows: size(url.searchParams.get('rows'), 30) },
		env: { ...environment, TERM: 'xterm-256color' },
		cwd: '/workspace',
		signal: abort.signal,
	});
	const [client, server] = Object.values(new WebSocketPair());
	server.binaryType = 'arraybuffer';
	server.accept();
	server.send(JSON.stringify({ type: 'ready' }));
	const stdin = tmux.stdin!.getWriter();
	let exited = false;
	void tmux.exitCode.then(
		() => {
			exited = true;
		},
		() => {
			exited = true;
		},
	);
	server.addEventListener('message', (event) => {
		if (typeof event.data === 'string') {
			try {
				const message: { cols?: number; rows?: number } = JSON.parse(event.data);
				if (Number.isInteger(message.cols) && Number.isInteger(message.rows))
					tmux.resize(size(String(message.cols), 120), size(String(message.rows), 30));
			} catch {
				/* Ignore malformed resize controls. */
			}
		} else void stdin.write(new Uint8Array(event.data)).catch(() => abort.abort());
	});
	server.addEventListener('close', () => {
		if (!exited) abort.abort();
	});
	server.addEventListener('error', () => abort.abort());
	void (async () => {
		for await (const chunk of tmux.stdout!) server.send(chunk);
		server.close(1000, `Terminal closed with code ${await tmux.exitCode}`);
	})().catch(() => {
		try {
			server.close(1011, 'Terminal disconnected');
		} finally {
			abort.abort();
		}
	});
	return new Response(undefined, { status: 101, webSocket: client });
}
