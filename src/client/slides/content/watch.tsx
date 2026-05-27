import { motion, AnimatePresence } from 'motion/react';
import { useState, useRef, useCallback, useEffect } from 'react';

import { Badge } from '@/components/badge';
import { FileTree } from '@/components/file-tree';
import { Output, Stdout, Dim } from '@/components/output';
import { api } from '@/lib/api';

import { Reveal } from '../components/reveal';
import { SlideLayout } from '../components/slide-layout';
import { SlideTitle } from '../components/slide-title';
import { RevealCode } from '../components/typewriter-code';

import type { SlideProperties } from '../types';

const EASE = [0.16, 1, 0.3, 1] as const;

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

const CODE = `const stream = await sandbox.watch("/workspace", {
  recursive: true,
  include: ["*.ts", "*.py"],
});
for await (const event of parseSSEStream(stream)) {
  console.log(event.eventType, event.path);
}`;

const EVENT_BADGE: Record<string, 'success' | 'error' | 'info' | 'warning' | 'neutral'> = {
	create: 'success',
	modify: 'info',
	delete: 'error',
	move_from: 'warning',
	move_to: 'warning',
	attrib: 'neutral',
};

// Matching the panel version's idempotent commands
const TRIGGERS = [
	{
		label: 'Create file',
		cmd: "if [ -f /workspace/test.txt ]; then echo 'File already exists at /workspace/test.txt'; else touch /workspace/test.txt && echo 'Created /workspace/test.txt'; fi",
	},
	{ label: 'Modify file', cmd: 'echo "updated" >> /workspace/test.txt' },
	{ label: 'Delete file', cmd: 'rm -f /workspace/test.txt' },
	{
		label: 'Create dir',
		cmd: "if [ -d /workspace/new-dir ]; then echo 'Directory already exists, recreating'; rm -rf /workspace/new-dir; fi; mkdir -p /workspace/new-dir && echo 'Created /workspace/new-dir'",
	},
	{ label: 'Move file', cmd: 'mv /workspace/test.txt /workspace/moved.txt' },
];

/**
 * Slide 9: File Watching
 * Steps: 0=title+subtitle, 1=code, 2=live demo (auto-starts watcher)
 */
export function WatchSlide({ step }: SlideProperties) {
	const [events, setEvents] = useState<WatchEvent[]>([]);
	const [watching, setWatching] = useState(false);
	const [triggerOutput, setTriggerOutput] = useState<string | undefined>();
	const [triggerLoading, setTriggerLoading] = useState(false);
	const [fileRefreshKey, setFileRefreshKey] = useState(0);
	const esReference = useRef<EventSource | undefined>(undefined);
	const idReference = useRef(0);
	const watcherStarted = useRef(false);

	const startWatching = useCallback(() => {
		if (esReference.current) esReference.current.close();
		setEvents([]);
		setWatching(true);

		const es = new EventSource('/api/watch?path=/workspace');
		esReference.current = es;

		es.addEventListener('message', (event) => {
			try {
				const data = JSON.parse(event.data);
				setEvents((previous) =>
					[
						{ id: idReference.current++, eventType: data.eventType, path: data.path, timestamp: new Date().toLocaleTimeString() },
						...previous,
					].slice(0, 20),
				);
			} catch {
				// ignore keepalive pings
			}
		});
		es.addEventListener('error', () => {
			if (es.readyState === EventSource.CLOSED) setWatching(false);
		});
	}, []);

	useEffect(() => {
		if (step >= 2 && !watcherStarted.current) {
			watcherStarted.current = true;
			startWatching();
		}
		return () => {
			esReference.current?.close();
			esReference.current = undefined;
		};
	}, [step >= 2]); // eslint-disable-line react-hooks/exhaustive-deps

	async function runTrigger(cmd: string) {
		setTriggerLoading(true);
		try {
			const data = await api<ExecResult>('/api/exec', { command: cmd });
			setTriggerOutput(data.stdout || data.stderr || `Done (exit ${data.exitCode})`);
			setFileRefreshKey((k) => k + 1);
		} catch (error) {
			setTriggerOutput(`Error: ${error instanceof Error ? error.message : 'Failed'}`);
		} finally {
			setTriggerLoading(false);
		}
	}

	return (
		<SlideLayout>
			<SlideTitle number="08" title="File Watching" subtitle="Real-time filesystem events via Server-Sent Events." step={step} />

			<div className="mt-6 flex flex-1 flex-col gap-5 overflow-hidden">
				<RevealCode code={CODE} visible={step >= 1} label="SDK" />

				{step >= 2 && (
					<Reveal visible={step >= 2} className="flex flex-1 gap-4 overflow-hidden">
						{/* File tree */}
						<FileTree initialPath="/workspace" refreshKey={fileRefreshKey} className="w-[200px] shrink-0" compact />

						{/* Event log */}
						<div
							className="
								flex flex-1 flex-col overflow-hidden rounded-lg border border-cf-border
								bg-cf-bg-200
							"
						>
							<div
								className="
									flex items-center justify-between border-b border-cf-border-light px-4
									py-2
								"
							>
								<div className="flex items-center gap-2">
									{watching && (
										<span className="relative flex size-2.5">
											<span
												className="
													absolute inline-flex size-full animate-ping rounded-full
													bg-cf-success opacity-75
												"
											/>
											<span className="relative inline-flex size-2.5 rounded-full bg-cf-success" />
										</span>
									)}
									<span className="text-base font-medium text-cf-text-subtle uppercase">Event Log</span>
								</div>
								<span className="font-mono text-sm text-cf-text-subtle">{events.length} events</span>
							</div>
							<div className="flex-1 overflow-y-auto">
								{events.length === 0 ? (
									<div
										className="
											flex h-full items-center justify-center text-base text-cf-text-subtle
										"
									>
										Waiting for events... Click a trigger to generate them.
									</div>
								) : (
									<div className="divide-y divide-cf-border-light">
										<AnimatePresence initial={false}>
											{events.map((event_) => (
												<motion.div
													key={event_.id}
													className="flex items-center justify-between px-4 py-2"
													initial={{ opacity: 0, x: -20, height: 0 }}
													animate={{ opacity: 1, x: 0, height: 'auto' }}
													exit={{ opacity: 0, x: 20, height: 0 }}
													transition={{ duration: 0.25, ease: EASE }}
												>
													<div className="flex items-center gap-2">
														<Badge variant={EVENT_BADGE[event_.eventType] ?? 'neutral'}>{event_.eventType}</Badge>
														<span className="truncate font-mono text-base">{event_.path}</span>
													</div>
													<span className="text-sm text-cf-text-subtle">{event_.timestamp}</span>
												</motion.div>
											))}
										</AnimatePresence>
									</div>
								)}
							</div>
						</div>
						<div className="flex w-[280px] shrink-0 flex-col gap-3">
							<div className="text-base font-medium text-cf-text-subtle uppercase">Trigger Changes</div>
							{TRIGGERS.map((t) => (
								<button key={t.label} onClick={() => void runTrigger(t.cmd)} disabled={triggerLoading} className="btn-preset text-base">
									{t.label}
								</button>
							))}
							<Output className="min-h-[60px] text-base">
								{triggerLoading && <Dim>Running...</Dim>}
								{!triggerLoading && triggerOutput && <Stdout>{triggerOutput}</Stdout>}
								{!triggerLoading && !triggerOutput && <Dim>Trigger output appears here</Dim>}
							</Output>
						</div>
					</Reveal>
				)}
			</div>
		</SlideLayout>
	);
}

WatchSlide.steps = 3;
