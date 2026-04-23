import { motion, AnimatePresence } from 'motion/react';
import { useState, useRef, useEffect, useCallback } from 'react';

import { Badge } from '@/components/badge';
import { Callout } from '@/components/callout';
import { Card, CardHeader, CardBody } from '@/components/card';
import { CodeBlock } from '@/components/code-block';
import { FileTree } from '@/components/file-tree';
import { Output, Stdout } from '@/components/output';
import { api } from '@/lib/api';

interface WatchEvent {
	id: number;
	eventType: string;
	path: string;
	timestamp: string;
}

interface ExecResult {
	stdout: string;
	stderr: string;
	exitCode: number;
	success: boolean;
}

const SDK_CODE = `const stream = await sandbox.watch('/workspace', {
  recursive: true,
  include: ['*.ts', '*.py'],
});
for await (const event of parseSSEStream(stream)) {
  console.log(event.eventType, event.path);
}`;

const EVENT_BADGE_VARIANT: Record<string, 'success' | 'error' | 'info' | 'warning' | 'ai' | 'neutral'> = {
	create: 'success',
	modify: 'info',
	delete: 'error',
	move_from: 'warning',
	move_to: 'warning',
	attrib: 'ai',
};

const TRIGGER_PRESETS = [
	{
		label: 'Create file',
		command:
			"if [ -f /workspace/test.txt ]; then echo 'File already exists at /workspace/test.txt'; else touch /workspace/test.txt && echo 'Created /workspace/test.txt'; fi",
	},
	{ label: 'Modify file', command: 'echo "updated" >> /workspace/test.txt' },
	{ label: 'Delete file', command: 'rm -f /workspace/test.txt' },
	{
		label: 'Create dir',
		command:
			"if [ -d /workspace/new-dir ]; then echo 'Directory already exists, recreating'; rm -rf /workspace/new-dir; fi; mkdir -p /workspace/new-dir && echo 'Created /workspace/new-dir'",
	},
	{
		label: 'Move file',
		command: 'mv /workspace/test.txt /workspace/moved.txt',
	},
];

export function WatchPanel() {
	const [watchPath, setWatchPath] = useState('/workspace');
	const [includeFilter, setIncludeFilter] = useState('');
	const [watching, setWatching] = useState(false);
	const [events, setEvents] = useState<WatchEvent[]>([]);
	const [triggerCommand, setTriggerCommand] = useState('');
	const [triggerOutput, setTriggerOutput] = useState<string | undefined>();
	const [triggerLoading, setTriggerLoading] = useState(false);
	const [fileRefreshKey, setFileRefreshKey] = useState(0);
	const eventSourceReference = useRef<EventSource | undefined>(undefined);
	const eventIdReference = useRef(0);
	const watcherStarted = useRef(false);

	const startWatching = useCallback(() => {
		if (eventSourceReference.current) {
			eventSourceReference.current.close();
		}
		setEvents([]);
		setWatching(true);

		const parameters = new URLSearchParams({ path: watchPath });
		if (includeFilter.trim()) {
			parameters.set('include', includeFilter.trim());
		}

		const es = new EventSource(`/api/watch?${parameters}`);
		eventSourceReference.current = es;

		es.addEventListener('message', (event) => {
			try {
				const data = JSON.parse(event.data);
				const newEvent: WatchEvent = {
					id: eventIdReference.current++,
					eventType: data.eventType,
					path: data.path,
					timestamp: new Date().toLocaleTimeString(),
				};
				setEvents((previous) => [newEvent, ...previous]);
			} catch {
				// ignore parse errors from keepalive pings
			}
		});

		es.addEventListener('error', () => {
			// EventSource auto-reconnects, but if it closes we update state
			if (es.readyState === EventSource.CLOSED) {
				setWatching(false);
			}
		});
	}, [watchPath, includeFilter]);

	function stopWatching() {
		if (eventSourceReference.current) {
			eventSourceReference.current.close();
			eventSourceReference.current = undefined;
		}
		setWatching(false);
	}

	async function runTrigger(cmd: string) {
		const trimmed = cmd.trim();
		if (!trimmed) return;
		setTriggerLoading(true);
		try {
			const data = await api<ExecResult>('/api/exec', { command: trimmed });
			if (data.stdout || data.stderr) {
				setTriggerOutput(data.stdout || data.stderr);
			} else {
				setTriggerOutput(data.success ? `Done (exit ${data.exitCode})` : `Failed (exit ${data.exitCode})`);
			}
			// Refresh file tree after trigger
			setFileRefreshKey((k) => k + 1);
		} catch (error) {
			setTriggerOutput(`Error: ${error instanceof Error ? error.message : 'Command failed'}`);
		} finally {
			setTriggerLoading(false);
		}
	}

	useEffect(() => {
		if (!watcherStarted.current) {
			watcherStarted.current = true;
			startWatching();
		}
		return () => {
			if (eventSourceReference.current) {
				eventSourceReference.current.close();
			}
		};
	}, [startWatching]);

	return (
		<section className="flex flex-col gap-6">
			<div>
				<h2 className="font-sans text-2xl font-medium text-cf-text">File Watcher</h2>
				<p className="mt-1 text-base text-cf-text-muted">
					Watch for filesystem changes in real-time using Server-Sent Events. Create, modify, or delete files to see events appear
					instantly.
				</p>
			</div>

			<CodeBlock code={SDK_CODE} />

			<div className="flex flex-col gap-4">
				{/* Watch controls */}
				<div
					className="
						flex flex-col gap-2
						sm:flex-row
					"
				>
					<input
						type="text"
						value={watchPath}
						onChange={(event_) => setWatchPath(event_.target.value)}
						placeholder="Watch path..."
						className="
							input-field flex-1
							placeholder:text-cf-text-subtle
						"
					/>
					<input
						type="text"
						value={includeFilter}
						onChange={(event_) => setIncludeFilter(event_.target.value)}
						placeholder="*.py, *.ts, *.txt"
						className="
							input-field
							placeholder:text-cf-text-subtle
							sm:w-48
						"
					/>
					<div className="flex gap-2">
						{watching ? (
							<button onClick={stopWatching} className="btn-base btn-ghost">
								Stop
							</button>
						) : (
							<button onClick={startWatching} disabled={!watchPath.trim()} className="btn-base btn-primary">
								Start Watching
							</button>
						)}
					</div>
				</div>

				<AnimatePresence>
					{watching && (
						<motion.div
							className="flex items-center gap-2"
							initial={{ opacity: 0, height: 0 }}
							animate={{ opacity: 1, height: 'auto' }}
							exit={{ opacity: 0, height: 0 }}
							transition={{ duration: 0.25 }}
						>
							<span className="relative flex size-2.5">
								<span
									className="
										absolute inline-flex size-full animate-ping rounded-full bg-cf-success
										opacity-75
									"
								/>
								<span className="relative inline-flex size-2.5 rounded-full bg-cf-success" />
							</span>
							<span className="text-sm text-cf-text-muted">Watching {watchPath}</span>
						</motion.div>
					)}
				</AnimatePresence>

				{/* Split view */}
				<div
					className="
						grid grid-cols-1 gap-4
						lg:grid-cols-[240px_1fr_1fr]
					"
				>
					{/* Left: File tree */}
					<FileTree initialPath={watchPath} refreshKey={fileRefreshKey} className="max-h-[400px]" compact />

					{/* Center: Event log */}
					<Card>
						<CardHeader right={<span className="font-mono text-[11px]">{events.length} events</span>}>Event Log</CardHeader>
						<CardBody className="max-h-[350px] p-0">
							{events.length === 0 ? (
								<div
									className="
										flex items-center justify-center p-8 text-sm text-cf-text-subtle
									"
								>
									{watching ? 'Waiting for filesystem events...' : 'Start watching to capture events'}
								</div>
							) : (
								<div className="divide-y divide-cf-border-light">
									<AnimatePresence initial={false}>
										{events.map((event) => (
											<motion.div
												key={event.id}
												initial={{ opacity: 0, x: -20, height: 0 }}
												animate={{ opacity: 1, x: 0, height: 'auto' }}
												exit={{ opacity: 0, x: 20, height: 0 }}
												transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
												className="flex items-center justify-between px-4 py-2"
											>
												<div className="flex min-w-0 items-center gap-2">
													<Badge variant={EVENT_BADGE_VARIANT[event.eventType] ?? 'neutral'}>{event.eventType}</Badge>
													<span className="truncate font-mono text-sm text-cf-text">{event.path}</span>
												</div>
												<span className="ml-2 text-[10px] whitespace-nowrap text-cf-text-subtle">{event.timestamp}</span>
											</motion.div>
										))}
									</AnimatePresence>
								</div>
							)}
						</CardBody>
					</Card>

					{/* Right: Trigger panel */}
					<Card>
						<CardHeader>Trigger Changes</CardHeader>
						<CardBody>
							<div className="flex flex-col gap-3">
								<div className="flex gap-2">
									<input
										type="text"
										value={triggerCommand}
										onChange={(event_) => setTriggerCommand(event_.target.value)}
										onKeyDown={(event_) => {
											if (event_.key === 'Enter') void runTrigger(triggerCommand);
										}}
										placeholder="Command to trigger events..."
										className="
											input-field flex-1
											placeholder:text-cf-text-subtle
										"
									/>
									<button
										onClick={() => void runTrigger(triggerCommand)}
										disabled={triggerLoading || !triggerCommand.trim()}
										className="btn-base btn-primary"
									>
										{triggerLoading ? 'Running...' : 'Run'}
									</button>
								</div>
								<div className="flex flex-wrap gap-2">
									{TRIGGER_PRESETS.map((preset) => (
										<button
											key={preset.label}
											onClick={() => {
												setTriggerCommand(preset.command);
												void runTrigger(preset.command);
											}}
											className="btn-preset"
										>
											{preset.label}
										</button>
									))}
								</div>
								<AnimatePresence>
									{triggerOutput && (
										<motion.div
											initial={{ opacity: 0, y: 8 }}
											animate={{ opacity: 1, y: 0 }}
											exit={{ opacity: 0, y: -4 }}
											transition={{ duration: 0.25 }}
										>
											<Output className="min-h-[60px]">
												<Stdout>{triggerOutput}</Stdout>
											</Output>
										</motion.div>
									)}
								</AnimatePresence>
							</div>
						</CardBody>
					</Card>
				</div>
			</div>

			<Callout>
				<span className="font-medium">sandbox.watch()</span> returns a readable stream of filesystem events via SSE. Events include create,
				modify, delete, move, and attribute changes. Use the <span className="font-medium">include</span> filter to watch specific file
				patterns.
			</Callout>
		</section>
	);
}
