import { useEffect, useState } from 'react';

import { Badge } from '@/components/badge';
import { Callout } from '@/components/callout';
import { CodeBlock } from '@/components/code-block';
import { FileTree } from '@/components/file-tree';
import { Output, Stdout, Stderr, Info } from '@/components/output';
import { Spinner } from '@/components/spinner';
import { api } from '@/lib/api';

interface MountStatus {
	available: boolean;
	message: string;
	mode: 'local' | 'production';
}

interface MountResult {
	success: boolean;
	path: string;
	mode: 'local' | 'production';
}

interface WriteResult {
	success: boolean;
	path: string;
}

interface UnmountResult {
	success: boolean;
	path: string;
}

const MOUNT_PATH = '/data';

const SDK_CODE = `await sandbox.mountBucket('BACKUP_BUCKET', '/data');
await sandbox.writeFile('/data/results.json', JSON.stringify(results, null, 2));
await sandbox.unmountBucket('/data');`;

const WRANGLER_CONFIG_EXAMPLE = `// wrangler.jsonc
{
  "r2_buckets": [
    { "binding": "BACKUP_BUCKET", "bucket_name": "my-backup-bucket" }
  ]
}

// src/index.ts
export { ContainerProxy } from '@cloudflare/sandbox';`;

export function BackupPanel() {
	const [status, setStatus] = useState<MountStatus | undefined>();
	const [statusLoading, setStatusLoading] = useState(true);
	const [mounted, setMounted] = useState(false);
	const [loading, setLoading] = useState(false);
	const [writing, setWriting] = useState(false);
	const [unmounting, setUnmounting] = useState(false);
	const [output, setOutput] = useState<string[]>([]);
	const [error, setError] = useState<string | undefined>();
	const [refreshKey, setRefreshKey] = useState(0);

	useEffect(() => {
		let cancelled = false;

		async function checkStatus() {
			try {
				const nextStatus = await api<MountStatus>('/api/backup/status');
				if (!cancelled) setStatus(nextStatus);
			} catch {
				if (!cancelled) {
					setStatus({
						available: false,
						message: 'Unable to check R2 mount configuration. The server may not be running.',
						mode: 'local',
					});
				}
			} finally {
				if (!cancelled) setStatusLoading(false);
			}
		}

		void checkStatus();
		return () => {
			cancelled = true;
		};
	}, []);

	async function mountBucket() {
		setLoading(true);
		setError(undefined);
		try {
			const data = await api<MountResult>('/api/backup/mount', { path: MOUNT_PATH });
			setMounted(true);
			setOutput((previous) => [...previous, `Mounted BACKUP_BUCKET at ${data.path}`, `Mode: ${data.mode}`]);
			setRefreshKey((key) => key + 1);
		} catch (error_) {
			setError(error_ instanceof Error ? error_.message : 'Failed to mount bucket');
		} finally {
			setLoading(false);
		}
	}

	async function writeDemoFile() {
		setWriting(true);
		setError(undefined);
		const timestamp = new Date().toISOString();
		const filePath = `${MOUNT_PATH}/results-${timestamp.replaceAll(':', '-').replaceAll('.', '-')}.json`;
		const content = JSON.stringify(
			{
				generatedAt: timestamp,
				source: 'hello-sandbox',
				feature: 'sandbox.mountBucket',
				results: ['mount binding', 'write file', 'persist in R2'],
			},
			undefined,
			2,
		);

		try {
			const data = await api<WriteResult>('/api/backup/write', { path: filePath, content });
			setOutput((previous) => [...previous, `Wrote ${data.path}`]);
			setRefreshKey((key) => key + 1);
		} catch (error_) {
			setError(error_ instanceof Error ? error_.message : 'Failed to write file');
		} finally {
			setWriting(false);
		}
	}

	async function unmountBucket() {
		setUnmounting(true);
		setError(undefined);
		try {
			const data = await api<UnmountResult>('/api/backup/unmount', { path: MOUNT_PATH });
			setMounted(false);
			setOutput((previous) => [...previous, `Unmounted ${data.path}`]);
		} catch (error_) {
			setError(error_ instanceof Error ? error_.message : 'Failed to unmount bucket');
		} finally {
			setUnmounting(false);
		}
	}

	const isConfigured = status?.available;

	return (
		<section className="flex flex-col gap-6">
			<div>
				<h2 className="font-sans text-2xl font-medium text-cf-text">Mount R2 Buckets</h2>
				<p className="mt-1 text-base text-cf-text-muted">
					Mount an R2 bucket into the sandbox filesystem, then read and write objects with standard file operations.
				</p>
			</div>

			<CodeBlock code={SDK_CODE} />

			{statusLoading && (
				<div className="flex items-center gap-2 text-sm text-cf-text-muted">
					<Spinner className="size-4" />
					Checking R2 mount configuration...
				</div>
			)}

			{status && (
				<div className="rounded-lg border border-cf-border bg-cf-bg-300 p-4">
					<div className="flex flex-wrap items-center gap-2">
						<Badge variant={status.available ? 'success' : 'neutral'}>{status.available ? 'R2 Binding Ready' : 'Binding Missing'}</Badge>
						<Badge variant="neutral">{status.mode === 'local' ? 'Local dev mode' : 'Production mode'}</Badge>
					</div>
					<p className="mt-3 text-sm text-cf-text-muted">{status.message}</p>
					<details className="mt-3">
						<summary
							className="
								cursor-pointer text-xs font-medium text-cf-text
								hover:text-cf-text-muted
							"
						>
							Show wrangler.jsonc example
						</summary>
						<pre
							className="
								mt-2 overflow-x-auto rounded-sm bg-cf-bg-200 p-2 font-mono text-xs
								text-cf-text-muted
							"
						>
							{WRANGLER_CONFIG_EXAMPLE}
						</pre>
					</details>
				</div>
			)}

			<div className="flex flex-col gap-4">
				<div
					className="
						flex flex-col gap-2
						sm:flex-row
					"
				>
					<div
						className="
							flex flex-1 items-center rounded-lg border border-cf-border bg-cf-bg-200
							px-3 font-mono text-sm text-cf-text
						"
					>
						{MOUNT_PATH}
					</div>
					<div className="flex gap-2">
						<button onClick={mountBucket} disabled={loading || !isConfigured} className="btn-base flex items-center gap-2 btn-primary">
							{loading ? <Spinner className="size-4" /> : undefined}
							Mount Bucket
						</button>
						<button onClick={writeDemoFile} disabled={writing || !mounted} className="btn-base flex items-center gap-2 btn-ghost">
							{writing ? <Spinner className="size-4" /> : undefined}
							Write JSON
						</button>
						<button onClick={unmountBucket} disabled={unmounting || !mounted} className="btn-base flex items-center gap-2 btn-ghost">
							{unmounting ? <Spinner className="size-4" /> : undefined}
							Unmount
						</button>
					</div>
				</div>

				{mounted && (
					<div className="flex items-center gap-2">
						<Badge variant="success">Mounted</Badge>
						<span className="font-mono text-sm text-cf-text-muted">BACKUP_BUCKET → {MOUNT_PATH}</span>
					</div>
				)}

				{(output.length > 0 || error) && (
					<Output className={loading || writing || unmounting ? 'opacity-50' : ''}>
						{output.map((line, index) => (
							<span key={index}>
								{line.startsWith('Mounted') || line.startsWith('Wrote') || line.startsWith('Unmounted') ? (
									<Info>{line}</Info>
								) : (
									<Stdout>{line}</Stdout>
								)}
								{'\n'}
							</span>
						))}
						{error && <Stderr>{error}</Stderr>}
					</Output>
				)}

				{mounted ? (
					<FileTree initialPath={MOUNT_PATH} refreshKey={refreshKey} className="max-h-[280px]" />
				) : (
					<div
						className="
							flex h-[200px] items-center justify-center rounded-lg border
							border-dashed border-cf-border bg-cf-bg-200
						"
					>
						<span className="text-sm text-cf-text-subtle">Mount the bucket to browse files stored in R2</span>
					</div>
				)}
			</div>

			<Callout>
				<span className="font-medium">sandbox.mountBucket()</span> mounts your Worker&apos;s R2 binding directly into the sandbox. That lets
				agents and services read or write persistent files with normal filesystem APIs, without generating or managing storage credentials
				in the Worker.
			</Callout>
		</section>
	);
}
