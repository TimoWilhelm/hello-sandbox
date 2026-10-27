import { useState } from 'react';

import { Badge } from '@/components/badge';
import { BrowserFrame } from '@/components/browser-frame';
import { Callout } from '@/components/callout';
import { CodeBlock } from '@/components/code-block';
import { Output, Stdout, Stderr, Info } from '@/components/output';
import { Spinner } from '@/components/spinner';
import { api } from '@/lib/api';
import { sdkExamples } from '@/lib/sdk-examples';

interface PreviewStartResult {
	success: boolean;
	url: string;
	port: number;
}

interface PreviewStopResult {
	success: boolean;
}

const SDK_CODE = sdkExamples.preview;

export function PreviewPanel() {
	const [command, setCommand] = useState('python3 /opt/http-server.py 8080');
	const [port, setPort] = useState('8080');
	const [previewUrl, setPreviewUrl] = useState<string | undefined>();
	const [loading, setLoading] = useState(false);
	const [stopping, setStopping] = useState(false);
	const [output, setOutput] = useState<string[]>([]);
	const [error, setError] = useState<string | undefined>();

	async function start() {
		if (!command.trim() || !port.trim()) return;
		setLoading(true);
		setError(undefined);
		setOutput((previous) => [...previous, `Starting: ${command}`]);
		try {
			const data = await api<PreviewStartResult>('/api/preview/start', {
				command,
				port: Number.parseInt(port, 10),
			});
			setOutput((previous) => [...previous, `Server started on port ${data.port}`, `Preview URL: ${data.url}`]);
			setPreviewUrl(data.url);
		} catch (error_) {
			setError(error_ instanceof Error ? error_.message : 'Failed to start preview');
		} finally {
			setLoading(false);
		}
	}

	async function stop() {
		if (!port.trim()) return;
		setStopping(true);
		try {
			await api<PreviewStopResult>('/api/preview/stop', {
				port: Number.parseInt(port, 10),
			});
			setOutput((previous) => [...previous, `Stopped server on port ${port}`]);
			setPreviewUrl(undefined);
		} catch (error_) {
			setError(error_ instanceof Error ? error_.message : 'Failed to stop preview');
		} finally {
			setStopping(false);
		}
	}

	return (
		<section className="flex flex-col gap-6">
			<div>
				<h2 className="font-sans text-2xl font-medium text-cf-text">Preview URLs</h2>
				<p className="mt-1 text-base text-cf-text-muted">
					Start a server process in the sandbox, expose a port, and preview it live in an iframe with a public URL.
				</p>
			</div>

			<CodeBlock code={SDK_CODE} />

			<div className="flex flex-col gap-4">
				{/* Controls */}
				<div
					className="
						flex flex-col gap-2
						sm:flex-row
					"
				>
					<input
						type="text"
						value={command}
						onChange={(event_) => setCommand(event_.target.value)}
						placeholder="Server command..."
						className="
							input-field flex-1
							placeholder:text-cf-text-subtle
						"
					/>
					<input
						type="text"
						value={port}
						onChange={(event_) => setPort(event_.target.value)}
						placeholder="Port"
						className="
							input-field w-24 text-center
							placeholder:text-cf-text-subtle
						"
					/>
					<div className="flex gap-2">
						<button
							onClick={start}
							disabled={loading || !command.trim() || !port.trim()}
							className="
								btn-base flex items-center gap-2 btn-primary whitespace-nowrap
							"
						>
							{loading ? <Spinner className="size-4" /> : undefined}
							Start & Expose
						</button>
						<button onClick={stop} disabled={stopping || !previewUrl} className="btn-base flex items-center gap-2 btn-ghost">
							{stopping ? <Spinner className="size-4" /> : undefined}
							Stop
						</button>
					</div>
				</div>

				{/* Status output */}
				{(output.length > 0 || error) && (
					<Output>
						{output.map((line, index) => (
							<span key={index}>
								{line.startsWith('Preview URL:') ? <Info>{line}</Info> : <Stdout>{line}</Stdout>}
								{'\n'}
							</span>
						))}
						{error && <Stderr>{error}</Stderr>}
					</Output>
				)}

				{/* Preview iframe */}
				{previewUrl && (
					<div className="flex flex-col gap-2">
						<Badge variant="success">Live Preview</Badge>
						<BrowserFrame url={previewUrl}>
							<iframe
								src={previewUrl}
								title="Sandbox preview"
								className="min-h-[400px] w-full flex-1 border-0"
								sandbox="allow-scripts allow-same-origin allow-forms"
							/>
						</BrowserFrame>
					</div>
				)}

				{!previewUrl && !loading && output.length === 0 && (
					<div
						className="
							flex h-[200px] items-center justify-center rounded-lg border
							border-dashed border-cf-border bg-cf-bg-200
						"
					>
						<span className="text-sm text-cf-text-subtle">Start a server to see the live preview</span>
					</div>
				)}
			</div>

			<Callout>
				<span className="font-medium">exposePort()</span> creates a publicly accessible URL for any port in the sandbox. Combined with{' '}
				<span className="font-medium">waitForPort()</span>, you can reliably start a server and get its preview URL once it&apos;s ready to
				accept connections. For zero-config public URLs on local dev or <code>.workers.dev</code>, see{' '}
				<span className="font-medium">Cloudflare Tunnels</span>.
			</Callout>
		</section>
	);
}
