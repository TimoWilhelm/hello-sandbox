import type { IDisposable, ITerminalAddon, Terminal } from '@xterm/xterm';

/** Connect xterm to the application's native PTY/tmux WebSocket bridge. */
export class TerminalConnection implements ITerminalAddon {
	private terminal?: Terminal;
	private socket?: WebSocket;
	private timer?: ReturnType<typeof setTimeout>;
	private subscriptions: IDisposable[] = [];
	private disposed = false;
	private attempts = 0;

	constructor(private readonly onConnected: (connected: boolean) => void) {}

	activate(terminal: Terminal) {
		this.terminal = terminal;
		this.subscriptions.push(
			terminal.onData((data) => this.send(new TextEncoder().encode(data))),
			terminal.onBinary((data) => this.send(Uint8Array.from(data, (character) => character.codePointAt(0)!))),
			terminal.onResize(({ cols, rows }) => this.send(JSON.stringify({ type: 'resize', cols, rows }))),
		);
	}

	private send(data: string | Uint8Array<ArrayBuffer>) {
		if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(data);
	}

	connect() {
		if (this.disposed || !this.terminal) return;
		const terminal = this.terminal;
		const url = new URL('/ws/terminal', location.href);
		url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
		url.searchParams.set('cols', String(terminal.cols));
		url.searchParams.set('rows', String(terminal.rows));
		const socket = new WebSocket(url);
		this.socket = socket;
		socket.binaryType = 'arraybuffer';
		socket.addEventListener('open', () => terminal.reset());
		socket.addEventListener('message', (event: MessageEvent<string | ArrayBuffer>) => {
			if (typeof event.data === 'string') {
				if (event.data === '{"type":"ready"}') {
					this.attempts = 0;
					this.onConnected(true);
					this.send(JSON.stringify({ type: 'resize', cols: terminal.cols, rows: terminal.rows }));
				}
				return;
			}
			terminal.write(new Uint8Array(event.data));
		});
		socket.addEventListener('close', (event) => {
			this.onConnected(false);
			if (this.disposed || event.code === 1000 || this.attempts >= 10) return;
			this.timer = setTimeout(() => this.connect(), Math.min(1000 * 2 ** this.attempts++, 30_000));
		});
	}

	dispose() {
		this.disposed = true;
		clearTimeout(this.timer);
		this.socket?.close(1000);
		for (const subscription of this.subscriptions) subscription.dispose();
		this.onConnected(false);
	}
}
