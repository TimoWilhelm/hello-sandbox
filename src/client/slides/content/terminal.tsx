import { motion, AnimatePresence } from 'motion/react';
import { useState, useRef, useEffect } from 'react';

import { SlideLayout } from '../components/slide-layout';
import { SlideTitle } from '../components/slide-title';

import type { SlideProperties } from '../types';
import type { Terminal as XTerminal } from '@xterm/xterm';

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

const QUICK_CMDS = [
	{ label: 'Cowsay', cmd: 'pip3 install cowsay -q && python3 -c \'import cowsay; cowsay.cow("Hello from Sandbox!")\'\r' },
	{ label: 'System info', cmd: 'uname -a\r' },
	{ label: 'Python', cmd: 'python3 --version\r' },
	{ label: 'Node', cmd: 'node --version\r' },
	{ label: 'Files', cmd: 'ls -la /workspace\r' },
];

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
		void promise.catch(() => {});
	}
}

/**
 * Slide 7: Interactive Terminal
 * Steps: 0=title+subtitle, 1=terminal
 */
export function TerminalSlide({ step }: SlideProperties) {
	const containerReference = useRef<HTMLDivElement>(null);
	const termReference = useRef<XTerminal | undefined>(undefined);
	const [connected, setConnected] = useState(false);

	const showTerminal = step >= 1;

	function sendInput(data: string) {
		const terminal = termReference.current;
		if (!terminal) return;

		terminal.paste(data);
		terminal.focus();
	}

	useEffect(() => {
		if (!showTerminal || !containerReference.current) return;
		const container = containerReference.current;

		let disposed = false;
		let terminal: XTerminal | undefined;
		let resizeObserver: ResizeObserver | undefined;

		void (async () => {
			// @ts-expect-error css module import
			await import('@xterm/xterm/css/xterm.css');
			const [{ Terminal }, { FitAddon }, { SandboxAddon }] = await Promise.all([
				import('@xterm/xterm'),
				import('@xterm/addon-fit'),
				import('@cloudflare/sandbox/xterm'),
			]);
			if (disposed) return;

			terminal = new Terminal({
				fontFamily: "ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, monospace",
				fontSize: 16,
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

				// Ctrl+Shift+C: copy selection (note: on Windows Chrome this also
				// opens DevTools and can't always be suppressed by the page).
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
			const sandboxAddon = new SandboxAddon({
				getWebSocketUrl: ({ sandboxId, sessionId, origin }) => {
					const parameters = new URLSearchParams({ id: sandboxId });
					if (sessionId) parameters.set('session', sessionId);
					return `${origin}/ws/terminal?${parameters}`;
				},
				onStateChange: (state) => {
					if (!disposed) setConnected(state === 'connected');
				},
			});
			terminal.loadAddon(sandboxAddon);
			terminal.open(container);
			fitAddon.fit();
			termReference.current = terminal;
			sandboxAddon.connect({ sandboxId: 'demo-sandbox' });
			resizeObserver = new ResizeObserver(() => fitAddon.fit());
			resizeObserver.observe(container);
		})();

		return () => {
			disposed = true;
			resizeObserver?.disconnect();
			terminal?.dispose();
			termReference.current = undefined;
			setConnected(false);
		};
	}, [showTerminal]);

	function sendCmd(cmd: string) {
		sendInput(cmd);
	}

	return (
		<SlideLayout>
			<SlideTitle
				number="05"
				title="Interactive Terminal"
				subtitle="Full PTY terminal via WebSocket. Tab completion, history, colors."
				step={step}
			/>

			<div className="mt-4 flex flex-1 flex-col gap-3 overflow-hidden">
				{showTerminal && (
					<motion.div
						className="flex flex-1 flex-col gap-3 overflow-hidden"
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
					>
						<div
							className="
								relative flex-1 overflow-hidden rounded-lg border border-cf-border
								bg-surface-dark p-2
							"
						>
							<AnimatePresence>
								{!connected && (
									<motion.div
										className="
											absolute inset-0 z-10 flex items-center justify-center
											bg-surface-dark/90 backdrop-blur-sm
										"
										initial={{ opacity: 1 }}
										exit={{ opacity: 0 }}
										transition={{ duration: 0.5 }}
									>
										<div className="flex flex-col items-center gap-3">
											<div className="flex h-6 items-end gap-[3px]">
												{[0, 1, 2, 3, 4].map((index) => (
													<motion.div
														key={index}
														className="w-[3px] rounded-full bg-cf-orange"
														animate={{ height: [8 + index * 3, 16 + index * 2, 8 + index * 3], opacity: [0.3, 1, 0.3] }}
														transition={{ duration: 1, repeat: Infinity, delay: index * 0.12, ease: 'easeInOut' }}
														style={{ height: 8 + index * 3 }}
													/>
												))}
											</div>
											<span className="text-base text-surface-dark-text/80">Connecting to sandbox...</span>
										</div>
									</motion.div>
								)}
							</AnimatePresence>
							<div ref={containerReference} className="h-full overscroll-none" />
						</div>
						<div className="flex flex-wrap gap-2">
							{QUICK_CMDS.map((c) => (
								<button key={c.label} onClick={() => sendCmd(c.cmd)} disabled={!connected} className="btn-preset text-base">
									{c.label}
								</button>
							))}
						</div>
					</motion.div>
				)}
			</div>
		</SlideLayout>
	);
}

TerminalSlide.steps = 2;
