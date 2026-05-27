import { Database, HardDriveDownload, FileJson } from 'lucide-react';
import { useState, useEffect } from 'react';

import { FileTree } from '@/components/file-tree';
import { Output, Stdout, Stderr, Info, Dim } from '@/components/output';
import { api } from '@/lib/api';

import { CollapsibleCodeContext } from '../components/collapsible-code-context';
import { Reveal } from '../components/reveal';
import { SlideLayout } from '../components/slide-layout';
import { SlideTitle } from '../components/slide-title';

import type { SlideProperties } from '../types';

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

const MOUNT_PATH = '/data';

const CODE = `await sandbox.mountBucket('BACKUP_BUCKET', '/data');
await sandbox.writeFile('/data/results.json', JSON.stringify(results, null, 2));
await sandbox.unmountBucket('/data');`;

const FLOW_ITEMS = [
	{ icon: Database, label: 'Worker binding', sub: 'BACKUP_BUCKET' },
	{ icon: HardDriveDownload, label: 'Bucket mount', sub: "sandbox.mountBucket('/data')" },
	{ icon: FileJson, label: 'Standard file I/O', sub: '/data/results.json' },
];

export function BackupSlide({ step }: SlideProperties) {
	const [status, setStatus] = useState<MountStatus | undefined>();
	const [mounted, setMounted] = useState(false);
	const [lines, setLines] = useState<string[]>([]);
	const [action, setAction] = useState<'mount' | 'write' | 'unmount' | undefined>();
	const [error, setError] = useState<string | undefined>();
	const [refreshKey, setRefreshKey] = useState(0);

	useEffect(() => {
		api<MountStatus>('/api/backup/status')
			.then(setStatus)
			.catch(() =>
				setStatus({
					available: false,
					message: 'Unable to check config',
					mode: 'local',
				}),
			);
	}, []);

	async function mountBucket() {
		setAction('mount');
		setError(undefined);
		try {
			const data = await api<MountResult>('/api/backup/mount', { path: MOUNT_PATH });
			setMounted(true);
			setLines((previous) => [...previous, `$ sandbox.mountBucket('BACKUP_BUCKET', '${MOUNT_PATH}')`, `Mounted in ${data.mode} mode`]);
			setRefreshKey((key) => key + 1);
		} catch (error_) {
			setError(error_ instanceof Error ? error_.message : 'Failed');
		} finally {
			setAction(undefined);
		}
	}

	async function writeFile() {
		setAction('write');
		setError(undefined);
		const timestamp = new Date().toISOString();
		const path = `${MOUNT_PATH}/slide-${timestamp.replaceAll(':', '-').replaceAll('.', '-')}.json`;

		try {
			const data = await api<WriteResult>('/api/backup/write', {
				path,
				content: JSON.stringify({ generatedAt: timestamp, slide: 'Mount R2 Buckets', persisted: true }, undefined, 2),
			});
			setLines((previous) => [...previous, '', `$ sandbox.writeFile('${data.path}', json)`, `Wrote ${data.path}`]);
			setRefreshKey((key) => key + 1);
		} catch (error_) {
			setError(error_ instanceof Error ? error_.message : 'Failed');
		} finally {
			setAction(undefined);
		}
	}

	async function unmountBucket() {
		setAction('unmount');
		setError(undefined);
		try {
			await api('/api/backup/unmount', { path: MOUNT_PATH });
			setMounted(false);
			setLines((previous) => [...previous, '', `$ sandbox.unmountBucket('${MOUNT_PATH}')`, `Unmounted ${MOUNT_PATH}`]);
		} catch (error_) {
			setError(error_ instanceof Error ? error_.message : 'Failed');
		} finally {
			setAction(undefined);
		}
	}

	return (
		<SlideLayout>
			<SlideTitle
				number="10"
				title="Mount R2 Buckets"
				subtitle="Mount a Worker binding and use normal filesystem operations."
				step={step}
			/>

			<div className="mt-6 flex min-h-0 flex-1 flex-col gap-5">
				{step >= 1 && (
					<div className="shrink-0">
						<CollapsibleCodeContext step={step} code={CODE} label="SDK" summary="sandbox.mountBucket() → sandbox.writeFile()">
							<div className="mb-5 flex items-center justify-center gap-5">
								{FLOW_ITEMS.map((item, index) => {
									const Icon = item.icon;
									return (
										<div key={item.label} className="flex items-center gap-5">
											{index > 0 && (
												<Reveal visible direction="none" index={index}>
													<span className="text-3xl text-cf-text-subtle">&rarr;</span>
												</Reveal>
											)}
											<Reveal visible direction="up" index={index}>
												<div
													className="
														flex min-w-[180px] flex-col items-center rounded-xl border
														border-cf-border bg-cf-bg-200 px-8 py-5 text-center
													"
												>
													<Icon className="size-8 text-cf-orange" strokeWidth={1.75} />
													<div className="mt-3 text-lg font-semibold text-cf-text">{item.label}</div>
													<div className="font-mono text-base text-cf-text-subtle">{item.sub}</div>
												</div>
											</Reveal>
										</div>
									);
								})}
							</div>
						</CollapsibleCodeContext>
					</div>
				)}

				{step >= 2 && (
					<Reveal visible={step >= 2} className="flex min-h-0 flex-1 flex-col">
						{status && !status.available ? (
							<div
								className="
									rounded-lg border border-cf-border bg-cf-bg-200 px-5 py-4 text-base
									text-cf-text-muted
								"
							>
								{status.message}
							</div>
						) : (
							<div className="flex min-h-0 flex-1 flex-col gap-4">
								<div className="flex items-center gap-3">
									<button onClick={mountBucket} disabled={action !== undefined || mounted} className="btn-base btn-primary text-base">
										{action === 'mount' ? 'Mounting...' : mounted ? 'Bucket Mounted' : 'Mount Bucket'}
									</button>
									<button onClick={writeFile} disabled={action !== undefined || !mounted} className="btn-base btn-ghost text-base">
										{action === 'write' ? 'Writing...' : 'Write JSON'}
									</button>
									<button onClick={unmountBucket} disabled={action !== undefined || !mounted} className="btn-base btn-primary text-base">
										{action === 'unmount' ? 'Unmounting...' : 'Unmount'}
									</button>
									{status && (
										<span className="text-sm text-cf-text-subtle">{status.mode === 'local' ? 'Local dev mode' : 'Production mode'}</span>
									)}
								</div>
								<div className="flex min-h-0 flex-1 gap-4">
									{mounted ? (
										<FileTree initialPath={MOUNT_PATH} refreshKey={refreshKey} compact className="w-72 shrink-0" />
									) : (
										<div
											className="
												flex w-72 shrink-0 items-center justify-center rounded-xl border
												border-dashed border-cf-border bg-cf-bg-200 px-4 text-center text-sm
												text-cf-text-subtle
											"
										>
											Mount the bucket to browse persisted files
										</div>
									)}
									<Output className="min-h-0 flex-1 text-base/relaxed">
										{action !== undefined && lines.length === 0 && <Dim>Waiting for action...</Dim>}
										{lines.map((line, index) => (
											<span key={index}>
												{line.startsWith('$') ? (
													<span className="text-surface-dark-success">{line}</span>
												) : line.startsWith('Mounted') || line.startsWith('Wrote') || line.startsWith('Unmounted') ? (
													<Info>{line}</Info>
												) : (
													<Stdout>{line}</Stdout>
												)}
												{'\n'}
											</span>
										))}
										{error && <Stderr>{error}</Stderr>}
										{action === undefined && lines.length === 0 && !error && <Dim>Mount the bucket, then write a JSON file into R2</Dim>}
									</Output>
								</div>
							</div>
						)}
					</Reveal>
				)}
			</div>
		</SlideLayout>
	);
}

BackupSlide.steps = 3;
