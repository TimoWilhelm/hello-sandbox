import { FolderOpen, FileText, FolderUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, useCallback, useRef } from 'react';

import { Output, Stdout, Stderr, Dim } from '@/components/output';
import { api } from '@/lib/api';
import { sdkExamples } from '@/lib/sdk-examples';

import { Reveal } from '../components/reveal';
import { SlideLayout } from '../components/slide-layout';
import { SlideTitle } from '../components/slide-title';
import { RevealCode } from '../components/typewriter-code';

import type { SlideProperties } from '../types';

const CODE = sdkExamples.files;

interface FileEntry {
	name: string;
	type: string;
}

/**
 * Slide 4: File System -- full interactive file browser
 * Steps: 0=title+subtitle, 1=code+filebrowser, 2=write/mkdir actions
 */
export function FilesSlide({ step }: SlideProperties) {
	const [cwd, setCwd] = useState('/workspace');
	const [files, setFiles] = useState<FileEntry[]>([]);
	const [filesLoading, setFilesLoading] = useState(false);
	const [selectedContent, setSelectedContent] = useState<string | undefined>();
	const [selectedFile, setSelectedFile] = useState<string | undefined>();
	const [lines, setLines] = useState<string[]>([]);
	const [error, setError] = useState<string | undefined>();
	const [actionLoading, setActionLoading] = useState(false);
	const [writePath, setWritePath] = useState('/workspace/hello.txt');
	const [writeContent, setWriteContent] = useState('Hello from the Sandbox SDK!');
	const [mkdirPath, setMkdirPath] = useState('/workspace/new-dir');
	const hasFetched = useRef(false);

	const fetchFiles = useCallback(async (path: string) => {
		setFilesLoading(true);
		try {
			const data = await api<{ files: FileEntry[]; count: number }>('/api/files/list', { path });
			setFiles(data.files);
			setCwd(path);
		} catch (error_) {
			setError(error_ instanceof Error ? error_.message : 'Failed to list files');
		} finally {
			setFilesLoading(false);
		}
	}, []);

	// Auto-fetch on first reveal of the file browser
	useEffect(() => {
		if (step >= 1 && !hasFetched.current) {
			hasFetched.current = true;
			void fetchFiles('/workspace');
		}
	}, [step, fetchFiles]);

	async function readFile(path: string) {
		setSelectedFile(path);
		setSelectedContent(undefined);
		try {
			const data = await api<{ content: string }>('/api/files/read', { path });
			setSelectedContent(data.content);
			setLines((p) => [...p, `$ readFile("${path}")`]);
		} catch (error_) {
			setSelectedContent(`Error: ${error_ instanceof Error ? error_.message : 'Failed'}`);
		}
	}

	async function navigate(directory: string) {
		setSelectedFile(undefined);
		setSelectedContent(undefined);
		await fetchFiles(directory);
	}

	async function writeFile() {
		if (!writePath.trim()) return;
		setActionLoading(true);
		setError(undefined);
		try {
			await api<{ success: boolean }>('/api/files/write', { path: writePath, content: writeContent });
			setLines((p) => [...p, `$ writeFile("${writePath}", "${writeContent.slice(0, 40)}${writeContent.length > 40 ? '...' : ''}")`]);
			setLines((p) => [...p, 'Written successfully.']);
			void fetchFiles(cwd); // refresh
		} catch (error_) {
			setError(error_ instanceof Error ? error_.message : 'Failed');
		} finally {
			setActionLoading(false);
		}
	}

	async function mkdir() {
		if (!mkdirPath.trim()) return;
		setActionLoading(true);
		setError(undefined);
		try {
			await api<{ success: boolean }>('/api/files/mkdir', { path: mkdirPath });
			setLines((p) => [...p, `$ mkdir("${mkdirPath}")`]);
			setLines((p) => [...p, 'Directory created.']);
			void fetchFiles(cwd);
		} catch (error_) {
			setError(error_ instanceof Error ? error_.message : 'Failed');
		} finally {
			setActionLoading(false);
		}
	}

	const parentDirectory = cwd === '/' ? undefined : cwd.split('/').slice(0, -1).join('/') || '/';

	return (
		<SlideLayout>
			<SlideTitle number="02" title="File System" subtitle="Read, write, and manage files inside the sandbox." step={step} />

			<div className="mt-6 flex flex-1 gap-6 overflow-hidden">
				{/* Left: Live file browser */}
				{step >= 1 && (
					<Reveal visible={step >= 1} className="flex w-[320px] shrink-0 flex-col overflow-hidden">
						<div
							className="
								flex flex-1 flex-col overflow-hidden rounded-xl border border-cf-border
								bg-cf-bg-200
							"
						>
							<div
								className="
									flex items-center justify-between border-b border-cf-border-light px-4
									py-2
								"
							>
								<span
									className="
										text-sm font-medium tracking-wider text-cf-text-subtle uppercase
									"
								>
									Files
								</span>
								<span className="truncate font-mono text-sm text-cf-text-subtle">{cwd}</span>
							</div>
							<div className="flex-1 overflow-y-auto p-2">
								{filesLoading && <div className="p-3 text-base text-cf-text-subtle">Loading...</div>}
								{!filesLoading && (
									<div className="flex flex-col gap-0.5">
										{parentDirectory && (
											<button
												onClick={() => void navigate(parentDirectory)}
												className="
													flex items-center gap-2 rounded-md px-3 py-2 text-left text-base
													text-cf-text-muted transition-colors
													hover:bg-cf-bg-300
												"
											>
												<FolderUp className="size-4 text-cf-text-subtle" strokeWidth={1.75} />
												..
											</button>
										)}
										<AnimatePresence initial={false}>
											{files.map((f) => {
												const isDirectory = f.type === 'directory';
												const fullPath = `${cwd === '/' ? '' : cwd}/${f.name}`;
												return (
													<motion.button
														key={f.name}
														initial={{ opacity: 0, x: -10 }}
														animate={{ opacity: 1, x: 0 }}
														exit={{ opacity: 0 }}
														transition={{ duration: 0.2 }}
														onClick={() => (isDirectory ? void navigate(fullPath) : void readFile(fullPath))}
														className={`
															flex items-center gap-2 rounded-md px-3 py-2 text-left text-base
															transition-colors
															hover:bg-cf-bg-300
															${selectedFile === fullPath ? 'bg-cf-orange/10 text-cf-orange' : 'text-cf-text'}
														`}
													>
														{isDirectory ? (
															<FolderOpen className="size-4 text-cf-orange" strokeWidth={1.75} />
														) : (
															<FileText className="size-4 text-cf-text-muted" strokeWidth={1.75} />
														)}
														<span className="truncate font-mono">{f.name}</span>
													</motion.button>
												);
											})}
										</AnimatePresence>
										{!filesLoading && files.length === 0 && <div className="px-3 py-2 text-base text-cf-text-subtle">Empty directory</div>}
									</div>
								)}
							</div>
						</div>
					</Reveal>
				)}

				{/* Right: Code + actions + output */}
				<div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto">
					<RevealCode code={CODE} visible={step >= 1} label="SDK" />

					{step >= 2 && (
						<Reveal visible={step >= 2}>
							<div className="flex flex-col gap-3">
								{/* Write file */}
								<div className="flex gap-2">
									<input
										type="text"
										value={writePath}
										onChange={(event_) => setWritePath(event_.target.value)}
										placeholder="File path..."
										className="input-field flex-1 text-base"
									/>
									<input
										type="text"
										value={writeContent}
										onChange={(event_) => setWriteContent(event_.target.value)}
										placeholder="Content..."
										className="input-field flex-1 text-base"
									/>
									<button onClick={writeFile} disabled={actionLoading} className="btn-base btn-primary text-base whitespace-nowrap">
										Write
									</button>
								</div>
								{/* Mkdir */}
								<div className="flex gap-2">
									<input
										type="text"
										value={mkdirPath}
										onChange={(event_) => setMkdirPath(event_.target.value)}
										placeholder="Directory path..."
										className="input-field flex-1 text-base"
									/>
									<button onClick={mkdir} disabled={actionLoading} className="btn-base btn-ghost text-base whitespace-nowrap">
										mkdir
									</button>
								</div>

								{/* Output area */}
								<Output className="min-h-[100px] text-base/relaxed">
									{selectedContent !== undefined && (
										<>
											<Dim>{selectedFile}:</Dim>
											{'\n'}
											<Stdout>{selectedContent}</Stdout>
										</>
									)}
									{lines.map((line, index) => (
										<span key={index}>
											{line.startsWith('$') ? <span className="text-surface-dark-success">{line}</span> : <Stdout>{line}</Stdout>}
											{'\n'}
										</span>
									))}
									{error && <Stderr>{error}</Stderr>}
									{!selectedContent && lines.length === 0 && !error && <Dim>Click a file to read it, or use the controls above</Dim>}
								</Output>
							</div>
						</Reveal>
					)}
				</div>
			</div>
		</SlideLayout>
	);
}

FilesSlide.steps = 3;
