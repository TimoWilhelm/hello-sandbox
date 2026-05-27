import { useState } from 'react';

import { Badge } from '@/components/badge';
import { BrowserFrame } from '@/components/browser-frame';
import { Callout } from '@/components/callout';
import { CodeBlock } from '@/components/code-block';
import { Output, Stdout, Stderr, Info } from '@/components/output';
import { Spinner } from '@/components/spinner';
import { api } from '@/lib/api';

interface TunnelStartResult {
	success: boolean;
	url: string;
	port: number;
}

interface TunnelStopResult {
	success: boolean;
}

const SDK_CODE = `const proc = await sandbox.startProcess('python3 -m http.server 8081', {
  cwd: '/workspace',
});
await proc.waitForPort(8081, { mode: 'tcp', timeout: 10_000 });
const tunnel = await sandbox.tunnels.get(8081);
return tunnel.url;`;

export function TunnelsPanel() {
	const [command, setCommand] = useState('python3 -m http.server 8081');
	const [port, setPort] = useState('8081');
	const [tunnelUrl, setTunnelUrl] = useState<string | undefined>();
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
			const data = await api<TunnelStartResult>('/api/tunnels/start', {
				command,
				port: Number.parseInt(port, 10),
			});
			setOutput((previous) => [...previous, `Server started on port ${data.port}`, `Tunnel URL: ${data.url}`]);
			setTunnelUrl(data.url);
		} catch (error_) {
			setError(error_ instanceof Error ? error_.message : 'Failed to start tunnel');
		} finally {
			setLoading(false);
		}
	}

	async function stop() {
		if (!port.trim()) return;
		setStopping(true);
		try {
			await api<TunnelStopResult>('/api/tunnels/stop', {
				port: Number.parseInt(port, 10),
			});
			setOutput((previous) => [...previous, `Tunnel closed for port ${port}`]);
			setTunnelUrl(undefined);
		} catch (error_) {
			setError(error_ instanceof Error ? error_.message : 'Failed to stop tunnel');
		} finally {
			setStopping(false);
		}
	}

	return (
		<section className="flex flex-col gap-6">
			<div>
				<h2 className="font-sans text-2xl font-medium text-cf-text">Cloudflare Tunnels</h2>
				<p className="mt-1 text-base text-cf-text-muted">
					Expose a sandbox service on a public <code>*.trycloudflare.com</code> URL with zero DNS or hostname setup.
				</p>
			</div>

			<CodeBlock code={SDK_CODE} />

			<div className="flex flex-col gap-4">
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
							Start & Tunnel
						</button>
						<button onClick={stop} disabled={stopping || !tunnelUrl} className="btn-base flex items-center gap-2 btn-ghost">
							{stopping ? <Spinner className="size-4" /> : undefined}
							Stop
						</button>
					</div>
				</div>

				{(output.length > 0 || error) && (
					<Output>
						{output.map((line, index) => (
							<span key={index}>
								{line.startsWith('Tunnel URL:') ? <Info>{line}</Info> : <Stdout>{line}</Stdout>}
								{'\n'}
							</span>
						))}
						{error && <Stderr>{error}</Stderr>}
					</Output>
				)}

				{tunnelUrl && (
					<div className="flex flex-col gap-2">
						<Badge variant="success">Tunnel Active</Badge>
						<BrowserFrame url={tunnelUrl}>
							<iframe
								src={tunnelUrl}
								title="Sandbox tunnel"
								className="min-h-[400px] w-full flex-1 border-0"
								sandbox="allow-scripts allow-same-origin allow-forms"
							/>
						</BrowserFrame>
					</div>
				)}

				{!tunnelUrl && !loading && output.length === 0 && (
					<div
						className="
							flex h-[200px] items-center justify-center rounded-lg border
							border-dashed border-cf-border bg-cf-bg-200
						"
					>
						<span className="text-sm text-cf-text-subtle">Start a server to open a trycloudflare tunnel</span>
					</div>
				)}
			</div>

			<Callout>
				<span className="font-medium">sandbox.tunnels.get()</span> is the zero-config option for local development, demos, and{' '}
				<code>.workers.dev</code> deployments. Tunnel URLs change when the container restarts, and <code>text/event-stream</code> is not
				supported through <code>trycloudflare.com</code>. For stable production hostnames, use{' '}
				<span className="font-medium">exposePort()</span>.
			</Callout>
		</section>
	);
}
