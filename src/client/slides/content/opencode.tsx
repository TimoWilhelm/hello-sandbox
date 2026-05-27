import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, useRef } from 'react';

import { BrowserFrame } from '@/components/browser-frame';

import { CollapsibleCodeContext } from '../components/collapsible-code-context';
import { Reveal } from '../components/reveal';
import { SlideLayout } from '../components/slide-layout';
import { SlideTitle } from '../components/slide-title';

import type { SlideProperties } from '../types';

const CODE = `// Uses the official -opencode base image
// FROM cloudflare/sandbox:0.10.3-opencode

const sandbox = getSandbox(env.OpencodeSandbox, "opencode");
const server = await createOpencodeServer(sandbox, {
  directory: "/home/user/agents",
});
const { url } = await sandbox.exposePort(server.port, { hostname });`;

/**
 * Slide 10: OpenCode / AI Coding Agents
 * Steps: 0=title+subtitle, 1=code, 2=iframe (auto-launches)
 */
export function OpencodeSlide({ step }: SlideProperties) {
	const [iframeUrl, setIframeUrl] = useState<string | undefined>();
	const [failed, setFailed] = useState(false);
	const launched = useRef(false);

	useEffect(() => {
		if (step < 2 || launched.current) return;
		launched.current = true;
		fetch('/api/opencode/start')
			.then(async (response) => {
				if (!response.ok) throw new Error(`Failed (${response.status})`);
				const data: { url: string } = await response.json();
				setIframeUrl(data.url);
			})
			.catch(() => {
				launched.current = false;
				setFailed(true);
			});
	}, [step]);

	const [iframeLoaded, setIframeLoaded] = useState(false);
	const loading = step >= 2 && !iframeLoaded && !failed;

	return (
		<SlideLayout>
			<SlideTitle
				number="09"
				title="AI Coding Agents"
				subtitle="Run AI assistants like OpenCode directly in sandbox containers."
				step={step}
			/>

			<div className="mt-6 flex min-h-0 flex-1 flex-col gap-5">
				{/* Setup code: full block at step 1, collapses to compact strip at step 2 */}
				{step >= 1 && (
					<div className="shrink-0">
						<CollapsibleCodeContext
							step={step}
							code={CODE}
							label="WORKER"
							summary="createOpencodeServer(sandbox) → sandbox.exposePort(port)"
						/>
					</div>
				)}

				{step >= 2 && (
					<Reveal visible={step >= 2} className="flex min-h-0 flex-1 flex-col">
						<BrowserFrame url={iframeUrl} className="relative" containerClassName="min-h-0 flex-1">
							<AnimatePresence>
								{loading && (
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
											<span className="text-base text-surface-dark-text/80">Starting OpenCode...</span>
										</div>
									</motion.div>
								)}
							</AnimatePresence>
							{iframeUrl && (
								<iframe
									src={iframeUrl}
									className="w-full flex-1 border-0"
									onLoad={() => setIframeLoaded(true)}
									title="OpenCode"
									allow="clipboard-read; clipboard-write"
								/>
							)}
						</BrowserFrame>
					</Reveal>
				)}
			</div>
		</SlideLayout>
	);
}

OpencodeSlide.steps = 3;
