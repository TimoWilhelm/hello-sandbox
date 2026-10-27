import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, useRef } from 'react';

import { BrowserFrame } from '@/components/browser-frame';
import { Output, Stdout, Stderr, Dim } from '@/components/output';
import { api } from '@/lib/api';
import { sdkExamples } from '@/lib/sdk-examples';

import { CollapsibleCodeContext } from '../components/collapsible-code-context';
import { Reveal } from '../components/reveal';
import { SlideLayout } from '../components/slide-layout';
import { SlideTitle } from '../components/slide-title';

import type { SlideProperties } from '../types';

interface PreviewStartResult {
	success: boolean;
	url: string;
	port: number;
}

const CODE = sdkExamples.preview;

const FLOW_ITEMS = [
	{ label: 'Server starts in sandbox', sub: 'python3 /opt/http-server.py 8080' },
	{ label: 'Port exposed', sub: 'sandbox.exposePort(8080)' },
	{ label: 'Public URL generated', sub: 'https://8080-demo-xxx.domain.com' },
];

/**
 * Slide 8: Preview URLs
 * Steps: 0=title+subtitle, 1=flow+code, 2=live demo (auto-starts)
 */
export function PreviewSlide({ step }: SlideProperties) {
	const [previewUrl, setPreviewUrl] = useState<string | undefined>();
	const [lines, setLines] = useState<string[]>([]);
	const [error, setError] = useState<string | undefined>();
	const started = useRef(false);

	useEffect(() => {
		if (step < 2 || started.current) return;
		started.current = true;
		api<PreviewStartResult>('/api/preview/start', { command: 'python3 /opt/http-server.py 8080', port: 8080 })
			.then((data) => {
				setLines((p) => [...p, `Server started on port ${data.port}`, `Preview URL: ${data.url}`]);
				setPreviewUrl(data.url);
			})
			.catch((error_) => {
				setError(error_ instanceof Error ? error_.message : 'Failed to start preview');
				started.current = false;
			});
	}, [step]);

	const loading = step >= 2 && !previewUrl && !error;

	return (
		<SlideLayout>
			<SlideTitle number="06" title="Preview URLs" subtitle="Start a server. Expose a port. Get a public URL. Instantly." step={step} />

			<div className="mt-6 flex min-h-0 flex-1 flex-col gap-5">
				{/* Flow + code: full block at step 1, collapses to compact strip at step 2 */}
				{step >= 1 && (
					<div className="shrink-0">
						<CollapsibleCodeContext step={step} code={CODE} label="SDK" summary="sandbox.startServer() → sandbox.exposePort(port)">
							{/* Flow diagram */}
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
						<BrowserFrame url={previewUrl} className="relative" containerClassName="min-h-0 flex-1">
							<AnimatePresence>
								{!previewUrl && (
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
											<span className="text-base text-surface-dark-text/80">Starting server...</span>
										</div>
									</motion.div>
								)}
							</AnimatePresence>
							{previewUrl && (
								<iframe
									src={previewUrl}
									title="Sandbox preview"
									className="w-full flex-1 border-0"
									sandbox="allow-scripts allow-same-origin allow-forms"
								/>
							)}
						</BrowserFrame>

						<Output className="shrink-0 text-base/relaxed">
							{loading && lines.length === 0 && <Dim>Starting server...</Dim>}
							{lines.map((line, index) => (
								<span key={index}>
									{line.startsWith('$') ? (
										<span className="text-surface-dark-success">{line}</span>
									) : line.startsWith('Preview URL:') ? (
										<span className="text-surface-dark-info">{line}</span>
									) : (
										<Stdout>{line}</Stdout>
									)}
									{'\n'}
								</span>
							))}
							{error && <Stderr>{error}</Stderr>}
							{!loading && lines.length === 0 && !error && <Dim>Starting server...</Dim>}
						</Output>
					</Reveal>
				)}
			</div>
		</SlideLayout>
	);
}

PreviewSlide.steps = 3;
