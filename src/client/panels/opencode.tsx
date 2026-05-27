import { motion, AnimatePresence } from 'motion/react';
import { useState } from 'react';

import { BrowserFrame } from '@/components/browser-frame';
import { Callout } from '@/components/callout';
import { CodeBlock } from '@/components/code-block';

const SDK_CODE = `import { createOpencodeServer } from '@cloudflare/sandbox/opencode';

const sandbox = getSandbox(env.OpencodeSandbox, 'opencode');
const server = await createOpencodeServer(sandbox, {
  directory: '/home/user/agents',
});
// Expose the OpenCode port on its own preview URL
const { url } = await sandbox.exposePort(server.port, { hostname });`;

const DOCKERFILE_CODE = `# Uses the official OpenCode base image — includes the OpenCode CLI out of the box
FROM docker.io/cloudflare/sandbox:0.10.3-opencode
EXPOSE 8080`;

function ConnectingBars() {
	return (
		<div className="flex items-end gap-[3px]">
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
	);
}

export function OpencodePanel() {
	const [iframeUrl, setIframeUrl] = useState<string | undefined>();
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | undefined>();

	async function launch() {
		setLoading(true);
		setError(undefined);
		try {
			const response = await fetch('/api/opencode/start');
			if (!response.ok) throw new Error(`Failed to start OpenCode (${response.status})`);
			const data: { url: string } = await response.json();
			setIframeUrl(data.url);
		} catch (error_) {
			setError(error_ instanceof Error ? error_.message : 'Failed to start OpenCode');
			setLoading(false);
		}
	}

	if (iframeUrl) {
		// Full-bleed layout: fixed positioning fills the main content area
		// (sidebar is 240px, status bar is 40px, this sits on top of the scrollable area)
		return (
			<div
				className="
					fixed inset-0 bottom-[40px] left-[240px] z-20 flex flex-col gap-2
					bg-cf-bg-100 p-3
				"
			>
				<div className="flex shrink-0 items-center gap-3">
					<button onClick={() => setIframeUrl(undefined)} className="btn-base btn-ghost">
						Stop
					</button>
					<h2 className="text-sm font-medium text-cf-text">AI Coding Agents</h2>
				</div>
				<BrowserFrame url={iframeUrl} className="relative" containerClassName="min-h-0 min-w-0 flex-1">
					<AnimatePresence>
						{loading && (
							<motion.div
								className="
									absolute inset-0 z-10 flex flex-col items-center justify-center gap-4
									bg-surface-dark/95 backdrop-blur-sm
								"
								initial={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								transition={{ duration: 0.5, ease: 'easeOut' }}
							>
								<ConnectingBars />
								<span className="text-sm font-medium text-surface-dark-text/80">Starting OpenCode...</span>
							</motion.div>
						)}
					</AnimatePresence>
					<iframe
						src={iframeUrl}
						className="min-h-[300px] w-full min-w-[400px] flex-1 border-0"
						onLoad={() => setLoading(false)}
						title="OpenCode"
						allow="clipboard-read; clipboard-write"
					/>
				</BrowserFrame>
			</div>
		);
	}

	return (
		<section className="flex flex-col gap-6">
			<div>
				<h2 className="font-sans text-2xl font-medium text-cf-text">AI Coding Agents</h2>
				<p className="mt-1 text-base text-cf-text-muted">
					Run the full OpenCode web experience inside a Cloudflare Sandbox. A second container with the official <code>-opencode</code> base
					image runs the OpenCode server, exposed via a preview URL and embedded here.
				</p>
			</div>

			<CodeBlock code={SDK_CODE} label="WORKER CODE" />
			<CodeBlock code={DOCKERFILE_CODE} label="DOCKERFILE" />

			<div className="flex items-center gap-3">
				<button onClick={() => void launch()} disabled={loading} className="btn-base btn-primary">
					{loading ? 'Starting...' : 'Launch OpenCode'}
				</button>
				{error && <span className="text-sm text-cf-error">{error}</span>}
			</div>

			<Callout>
				<a href="https://opencode.ai" target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
					OpenCode
				</a>{' '}
				is an open-source AI coding agent that runs in your terminal or browser. The Sandbox SDK provides a dedicated <code>-opencode</code>{' '}
				base image with the CLI pre-installed, and helpers to start and proxy the OpenCode server from a Worker.
			</Callout>
		</section>
	);
}
