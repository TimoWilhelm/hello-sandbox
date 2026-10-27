import { motion, AnimatePresence } from 'motion/react';
import { useState, useRef, useEffect } from 'react';

import { Callout } from '@/components/callout';
import { CodeBlock } from '@/components/code-block';
import { sdkExamples } from '@/lib/sdk-examples';
import { TerminalConnection } from '@/lib/terminal-connection';
import { useSandboxId } from '@/lib/use-sandbox-id';

import type { Terminal as XTerminal } from '@xterm/xterm';

const SDK_CODE = sdkExamples.terminal;

const DEMO_COMMANDS = [
	{ label: 'System info', command: 'uname -a\r' },
	{ label: 'Python version', command: 'python3 --version\r' },
	{ label: 'Node version', command: 'node --version\r' },
	{ label: 'List workspace', command: 'ls -la /workspace\r' },
	{ label: 'Disk usage', command: 'df -h /\r' },
	{
		label: 'Cowsay',
		command: 'pip3 install cowsay -q && python3 -c \'import cowsay; cowsay.cow("Hello!")\'\r',
	},
	{
		label: 'Fetch URL',
		command: 'node -e "fetch(\'https://httpbin.org/ip\').then(r=>r.json()).then(console.log)"\r',
	},
	{
		label: 'Write & run Python',
		command: 'echo \'import math; print(f"Pi = {math.pi:.10f}")\' > /tmp/demo.py && python3 /tmp/demo.py\r',
	},
];

const TERMINAL_THEME = {
	background: '#2a1a0e',
	foreground: '#f5ede0',
	cursor: '#FF4801',
	cursorAccent: '#2a1a0e',
	selectionBackground: 'rgba(255, 72, 1, 0.3)',
	selectionInactiveBackground: 'rgba(255, 72, 1, 0.3)',
	selectionForeground: '#f5ede0',
	black: '#1a1008',
	red: '#dc2626',
	green: '#16a34a',
	yellow: '#eab308',
	blue: '#2563eb',
	magenta: '#9616ff',
	cyan: '#06b6d4',
	white: '#f5ede0',
	brightBlack: '#6b5c4d',
	brightRed: '#ef4444',
	brightGreen: '#22c55e',
	brightYellow: '#facc15',
	brightBlue: '#3b82f6',
	brightMagenta: '#a855f7',
	brightCyan: '#22d3ee',
	brightWhite: '#ffffff',
};

async function readClipboard(): Promise<string | undefined> {
	try {
		return await navigator.clipboard?.readText();
	} catch {
		return undefined;
	}
}

function writeClipboard(text: string): void {
	const promise = navigator.clipboard?.writeText(text);
	if (promise) {
		void promise.catch((error: unknown) => {
			console.error('Clipboard writeText failed:', error);
		});
	} else {
		console.warn('navigator.clipboard.writeText unavailable');
	}
}

/* Animated connection indicator -- signal bars bouncing */
function ConnectingAnimation() {
	return (
		<div className="flex flex-col items-center gap-4">
			{/* Signal wave animation */}
			<div className="flex h-6 items-end gap-[3px]">
				{[0, 1, 2, 3, 4].map((index) => (
					<motion.div
						key={index}
						className="w-[3px] rounded-full bg-cf-orange"
						animate={{
							height: [8 + index * 3, 16 + index * 2, 8 + index * 3],
							opacity: [0.3, 1, 0.3],
						}}
						transition={{
							duration: 1,
							repeat: Infinity,
							delay: index * 0.12,
							ease: 'easeInOut',
						}}
						style={{ height: 8 + index * 3 }}
					/>
				))}
			</div>

			<div className="flex flex-col items-center gap-1.5">
				<span className="text-sm font-medium text-surface-dark-text/80">Connecting to sandbox</span>
			</div>
		</div>
	);
}

export function TerminalPanel() {
	const containerReference = useRef<HTMLDivElement>(null);
	const terminalReference = useRef<XTerminal | undefined>(undefined);
	const [connected, setConnected] = useState(false);
	const sandboxId = useSandboxId();

	function sendInput(data: string) {
		const terminal = terminalReference.current;
		if (!terminal) return;

		terminal.input(data, true);
		terminal.focus();
	}

	useEffect(() => {
		const container = containerReference.current;
		if (!container || !sandboxId) return;

		let disposed = false;
		let terminal: XTerminal | undefined;
		let resizeObserver: ResizeObserver | undefined;

		void (async () => {
			// @ts-expect-error css module import
			await import('@xterm/xterm/css/xterm.css');

			const [{ Terminal }, { FitAddon }] = await Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')]);

			// If the effect was cleaned up while we were loading, bail out
			if (disposed) return;

			terminal = new Terminal({
				fontFamily: "ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, monospace",
				fontSize: 13,
				lineHeight: 1.4,
				cursorBlink: true,
				cursorStyle: 'bar',
				theme: TERMINAL_THEME,
				allowProposedApi: true,
			});

			// Add terminal copy/paste shortcuts.
			terminal.attachCustomKeyEventHandler((event) => {
				if (event.type !== 'keydown') return true;
				if (event.altKey || event.metaKey) return true;

				// Ctrl+C: if a selection exists, copy it (VS Code pattern);
				// otherwise fall through so the shell gets SIGINT.
				if (event.ctrlKey && !event.shiftKey && event.code === 'KeyC') {
					const selection = terminal?.getSelection() ?? '';
					if (!selection) return true;
					event.preventDefault();
					writeClipboard(selection);
					terminal?.clearSelection();
					return false;
				}

				if (!event.ctrlKey || !event.shiftKey) return true;

				// Ctrl+Shift+C: copy selection on platforms/browsers that deliver
				// this shortcut to the terminal.
				if (event.code === 'KeyC') {
					event.preventDefault();
					const selection = terminal?.getSelection() ?? '';
					if (selection) writeClipboard(selection);
					return false;
				}

				if (event.code === 'KeyV') {
					event.preventDefault();
					void readClipboard().then((text) => {
						if (text) terminal?.paste(text);
					});
					return false;
				}

				return true;
			});

			const fitAddon = new FitAddon();
			terminal.loadAddon(fitAddon);

			const connection = new TerminalConnection((connected) => {
				if (!disposed) setConnected(connected);
			});

			terminal.loadAddon(connection);
			terminal.open(container);
			fitAddon.fit();

			terminalReference.current = terminal;

			// Open the terminal WebSocket.
			connection.connect();

			resizeObserver = new ResizeObserver(() => {
				fitAddon.fit();
			});
			resizeObserver.observe(container);
		})();

		return () => {
			disposed = true;
			resizeObserver?.disconnect();
			if (terminal) {
				terminal.dispose();
			}
			terminalReference.current = undefined;
			setConnected(false);
		};
	}, [sandboxId]);

	function sendCommand(command: string) {
		sendInput(command);
	}

	return (
		<section className="flex flex-col gap-6">
			<div>
				<h2 className="font-sans text-2xl font-medium text-cf-text">Interactive Terminal</h2>
				<p className="mt-1 text-base text-cf-text-muted">
					Full interactive terminal session connected to the sandbox via WebSocket. Supports tab completion, history, and all shell
					features.
				</p>
			</div>

			<CodeBlock code={SDK_CODE} />

			<div className="flex flex-col gap-3">
				{/* Terminal container */}
				<div
					className="
						relative overflow-hidden rounded-lg border border-cf-border
						bg-surface-dark p-2
					"
				>
					<AnimatePresence>
						{!connected && (
							<motion.div
								className="
									absolute inset-0 z-10 flex flex-col items-center justify-center gap-3
									bg-surface-dark/95 backdrop-blur-sm
								"
								initial={{ opacity: 1 }}
								exit={{ opacity: 0, scale: 1.02 }}
								transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
							>
								<ConnectingAnimation />
							</motion.div>
						)}
					</AnimatePresence>
					<div ref={containerReference} className="h-[400px] overscroll-none" />
				</div>

				{/* Demo command buttons */}
				<div className="flex flex-wrap gap-2">
					{DEMO_COMMANDS.map((cmd, index) => (
						<motion.button
							key={cmd.label}
							onClick={() => sendCommand(cmd.command)}
							disabled={!connected}
							className="btn-preset"
							initial={{ opacity: 0, y: 8 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{
								duration: 0.3,
								delay: index * 0.04,
								ease: [0.16, 1, 0.3, 1],
							}}
						>
							{cmd.label}
						</motion.button>
					))}
				</div>
			</div>

			<Callout>
				The terminal uses <span className="font-medium">xterm.js</span> with a native PTY and tmux session in the container. It connects via
				WebSocket for real-time bidirectional I/O, supporting full PTY features including colors, cursor movement, and interactive programs.
			</Callout>
		</section>
	);
}
