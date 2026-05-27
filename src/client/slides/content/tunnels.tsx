import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, useRef } from 'react';

import { BrowserFrame } from '@/components/browser-frame';
import { Output, Stdout, Stderr, Dim } from '@/components/output';
import { api } from '@/lib/api';

import { CollapsibleCodeContext } from '../components/collapsible-code-context';
import { Reveal } from '../components/reveal';
import { SlideLayout } from '../components/slide-layout';
import { SlideTitle } from '../components/slide-title';

import type { SlideProperties } from '../types';

interface TunnelStartResult {
	success: boolean;
	url: string;
	port: number;
}

const CODE = `const proc = await sandbox.startProcess(
  "python3 -m http.server 8081", { cwd: "/workspace" }
);
await proc.waitForPort(8081, { mode: "tcp", timeout: 10_000 });
const tunnel = await sandbox.tunnels.get(8081);
return tunnel.url;`;

const FLOW_ITEMS = [
	{ label: 'Server starts in sandbox', sub: 'python3 -m http.server 8081' },
	{ label: 'Tunnel created', sub: 'sandbox.tunnels.get(8081)' },
	{ label: 'Public URL generated', sub: 'https://random.trycloudflare.com' },
];

export function TunnelsSlide({ step }: SlideProperties) {
	const [tunnelUrl, setTunnelUrl] = useState<string | undefined>();
	const [lines, setLines] = useState<string[]>([]);
	const [error, setError] = useState<string | undefined>();
	const started = useRef(false);

	useEffect(() => {
		if (step < 2 || started.current) return;
		started.current = true;
		api<TunnelStartResult>('/api/tunnels/start', { command: 'python3 -m http.server 8081', port: 8081 })
			.then((data) => {
				setLines((previous) => [...previous, `Server started on port ${data.port}`, `Tunnel URL: ${data.url}`]);
				setTunnelUrl(data.url);
			})
			.catch((error_) => {
				setError(error_ instanceof Error ? error_.message : 'Failed to start tunnel');
				started.current = false;
			});
	}, [step]);

	const loading = step >= 2 && !tunnelUrl && !error;

	return (
		<SlideLayout>
			<SlideTitle number="07" title="Cloudflare Tunnels" subtitle="Public trycloudflare URLs without preview DNS setup." step={step} />

			<div className="mt-6 flex min-h-0 flex-1 flex-col gap-5">
				{step >= 1 && (
					<div className="shrink-0">
						<CollapsibleCodeContext step={step} code={CODE} label="SDK" summary="sandbox.startProcess() → sandbox.tunnels.get(port)">
							<div className="mb-5 flex items-center gap-5">
								{FLOW_ITEMS.map((item, index) => (
									<div key={item.label} className="flex items-center gap-5">
										{index > 0 && (
											<Reveal visible direction="none" index={index}>
												<span className="text-3xl text-cf-text-subtle">&rarr;</span>
											</Reveal>
										)}
										<Reveal visible direction="up" index={index}>
											<div
												className="
													min-w-[180px] rounded-xl border border-cf-border bg-cf-bg-200 px-8
													py-5
												"
											>
												<div className="text-lg font-semibold text-cf-text">{item.label}</div>
												<div className="font-mono text-base text-cf-text-subtle">{item.sub}</div>
											</div>
										</Reveal>
									</div>
								))}
							</div>
						</CollapsibleCodeContext>
					</div>
				)}

				{step >= 2 && (
					<Reveal visible={step >= 2} className="flex min-h-0 flex-1 flex-col gap-4">
						<BrowserFrame url={tunnelUrl} className="relative" containerClassName="min-h-0 flex-1">
							<AnimatePresence>
								{!tunnelUrl && (
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
														animate={{
															height: [8 + index * 3, 16 + index * 2, 8 + index * 3],
															opacity: [0.3, 1, 0.3],
														}}
														transition={{ duration: 1, repeat: Infinity, delay: index * 0.12, ease: 'easeInOut' }}
														style={{ height: 8 + index * 3 }}
													/>
												))}
											</div>
											<span className="text-base text-surface-dark-text/80">Opening tunnel...</span>
										</div>
									</motion.div>
								)}
							</AnimatePresence>
							{tunnelUrl && (
								<iframe
									src={tunnelUrl}
									title="Sandbox tunnel"
									className="w-full flex-1 border-0"
									sandbox="allow-scripts allow-same-origin allow-forms"
								/>
							)}
						</BrowserFrame>

						<Output className="shrink-0 text-base/relaxed">
							{loading && lines.length === 0 && <Dim>Opening tunnel...</Dim>}
							{lines.map((line, index) => (
								<span key={index}>
									{line.startsWith('Tunnel URL:') ? <span className="text-surface-dark-info">{line}</span> : <Stdout>{line}</Stdout>}
									{'\n'}
								</span>
							))}
							{error && <Stderr>{error}</Stderr>}
							{!loading && lines.length === 0 && !error && <Dim>Opening tunnel...</Dim>}
						</Output>
					</Reveal>
				)}
			</div>
		</SlideLayout>
	);
}

TunnelsSlide.steps = 3;
