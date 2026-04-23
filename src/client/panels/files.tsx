import { useState, useEffect, useCallback, useRef } from 'react';

import { Callout } from '@/components/callout';
import { Card, CardHeader, CardBody } from '@/components/card';
import { CodeBlock } from '@/components/code-block';
import { Output, Stdout, Stderr, Dim } from '@/components/output';
import { Spinner } from '@/components/spinner';
import { api } from '@/lib/api';
import { formatBytes } from '@/lib/format';

interface FileEntry {
	name: string;
	absolutePath: string;
	relativePath: string;
	type: 'file' | 'directory';
	size: number;
}

interface ListResult {
	files: FileEntry[];
	count: number;
	path: string;
}

interface ReadResult {
	content: string;
	path: string;
	mimeType: string;
	size: number;
}

const SDK_CODE = `await sandbox.mkdir('/workspace/project', { recursive: true });
await sandbox.writeFile('/workspace/project/main.py', code);
const file = await sandbox.readFile('/workspace/project/main.py');
const list = await sandbox.listFiles('/workspace');`;

export function FilesPanel() {
	const [currentPath, setCurrentPath] = useState('/workspace');
	const [files, setFiles] = useState<FileEntry[]>([]);
	const [fileContent, setFileContent] = useState<string | undefined>();
	const [selectedFile, setSelectedFile] = useState<string | undefined>();
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | undefined>();

	const [mkdirPath, setMkdirPath] = useState('/workspace/new-dir');
	const [writePath, setWritePath] = useState('/workspace/hello.txt');
	const [writeContent, setWriteContent] = useState('Hello from the Sandbox SDK!');
	const [actionOutput, setActionOutput] = useState<string | undefined>();
	const hasFetched = useRef(false);

	const listDirectory = useCallback(async (path: string) => {
		setLoading(true);
		setError(undefined);
		try {
			const data = await api<ListResult>('/api/files/list', { path });
			setFiles(data.files);
			setCurrentPath(data.path);
			setFileContent(undefined);
			setSelectedFile(undefined);
		} catch (error_) {
			setError(error_ instanceof Error ? error_.message : 'Failed to list directory');
		} finally {
			setLoading(false);
		}
	}, []);

	async function readFile(path: string) {
		setLoading(true);
		setError(undefined);
		try {
			const data = await api<ReadResult>('/api/files/read', { path });
			setFileContent(data.content);
			setSelectedFile(data.path);
		} catch (error_) {
			setError(error_ instanceof Error ? error_.message : 'Failed to read file');
		} finally {
			setLoading(false);
		}
	}

	async function handleMkdir() {
		if (!mkdirPath.trim()) return;
		try {
			const data = await api<{ success: boolean; path: string }>('/api/files/mkdir', { path: mkdirPath });
			setActionOutput(`Created directory: ${data.path}`);
			setMkdirPath('');
			void listDirectory(currentPath);
		} catch (error_) {
			setActionOutput(`Error: ${error_ instanceof Error ? error_.message : 'mkdir failed'}`);
		}
	}

	async function handleWrite() {
		if (!writePath.trim()) return;
		try {
			const data = await api<{ success: boolean; path: string }>('/api/files/write', { path: writePath, content: writeContent });
			setActionOutput(`Wrote file: ${data.path}`);
			setWritePath('');
			setWriteContent('');
			void listDirectory(currentPath);
		} catch (error_) {
			setActionOutput(`Error: ${error_ instanceof Error ? error_.message : 'write failed'}`);
		}
	}

	function navigateUp() {
		const parent = currentPath.replace(/\/[^/]+\/?$/, '') || '/';
		void listDirectory(parent);
	}

	function handleEntryClick(entry: FileEntry) {
		if (entry.type === 'directory') {
			void listDirectory(entry.absolutePath);
		} else {
			void readFile(entry.absolutePath);
		}
	}

	useEffect(() => {
		if (!hasFetched.current) {
			hasFetched.current = true;
			void listDirectory('/workspace');
		}
	}, [listDirectory]);

	return (
		<section className="flex flex-col gap-6">
			<div>
				<h2 className="font-sans text-2xl font-medium text-cf-text">File Manager</h2>
				<p className="mt-1 text-base text-cf-text-muted">Browse, read, create, and write files in the sandbox filesystem.</p>
			</div>

			<CodeBlock code={SDK_CODE} />

			<div
				className="
					grid grid-cols-1 gap-4
					lg:grid-cols-2
				"
			>
				{/* Left: File tree */}
				<Card>
					<CardHeader right={<span className="font-mono text-[11px] text-cf-text-subtle">{files.length} items</span>}>
						{currentPath}
					</CardHeader>
					<CardBody className="p-0">
						{loading && files.length === 0 ? (
							<div className="flex items-center justify-center p-8">
								<Spinner />
							</div>
						) : (
							<div
								className={`
									divide-y divide-cf-border-light
									${loading ? 'pointer-events-none opacity-50' : ''}
								`}
							>
								{currentPath !== '/' && (
									<button
										onClick={navigateUp}
										className="
											flex w-full items-center gap-2 px-4 py-2 text-left font-mono text-sm
											text-cf-text-muted
											hover:bg-cf-bg-300
										"
									>
										<span className="text-cf-orange">..</span>
										<span className="text-cf-text-subtle">(parent)</span>
									</button>
								)}
								{files.map((entry) => (
									<button
										key={entry.absolutePath}
										onClick={() => handleEntryClick(entry)}
										className={`
											flex w-full items-center justify-between px-4 py-2.5 text-left
											text-sm
											hover:bg-cf-bg-300
											${selectedFile === entry.absolutePath ? 'bg-cf-bg-300' : ''}
										`}
									>
										<span className="flex items-center gap-2 font-mono text-cf-text">
											<span className={entry.type === 'directory' ? 'text-cf-orange' : 'text-cf-text-muted'}>
												{entry.type === 'directory' ? '📁' : '📄'}
											</span>
											{entry.name}
											{entry.type === 'directory' && '/'}
										</span>
										{entry.type === 'file' && <span className="text-sm text-cf-text-subtle">{formatBytes(entry.size)}</span>}
									</button>
								))}
								{files.length === 0 && !loading && <div className="px-4 py-6 text-center text-sm text-cf-text-subtle">Empty directory</div>}
							</div>
						)}
					</CardBody>
				</Card>

				{/* Right: Actions + output */}
				<div className="flex flex-col gap-4">
					{/* mkdir */}
					<div className="flex gap-2">
						<input
							type="text"
							value={mkdirPath}
							onChange={(event_) => setMkdirPath(event_.target.value)}
							placeholder="Directory path to create..."
							className="
								input-field flex-1
								placeholder:text-cf-text-subtle
							"
						/>
						<button onClick={handleMkdir} disabled={!mkdirPath.trim()} className="btn-base btn-primary whitespace-nowrap">
							mkdir
						</button>
					</div>

					{/* write file */}
					<div className="flex flex-col gap-2">
						<input
							type="text"
							value={writePath}
							onChange={(event_) => setWritePath(event_.target.value)}
							placeholder="File path to write..."
							className="
								input-field
								placeholder:text-cf-text-subtle
							"
						/>
						<textarea
							value={writeContent}
							onChange={(event_) => setWriteContent(event_.target.value)}
							placeholder="File content..."
							rows={4}
							className="
								min-h-[120px] input-field resize-y
								placeholder:text-cf-text-subtle
							"
						/>
						<button onClick={handleWrite} disabled={!writePath.trim()} className="btn-base self-end btn-primary">
							Write File
						</button>
					</div>

					{/* Action output */}
					{actionOutput && (
						<Output>
							<Stdout>{actionOutput}</Stdout>
						</Output>
					)}

					{/* File content */}
					{error && (
						<Output>
							<Stderr>{error}</Stderr>
						</Output>
					)}
					{fileContent !== undefined && selectedFile && (
						<div className="flex flex-col gap-1">
							<span className="font-mono text-sm text-cf-text-subtle">{selectedFile}</span>
							<Output>
								<Stdout>{fileContent}</Stdout>
							</Output>
						</div>
					)}
					{!fileContent && !error && !actionOutput && (
						<Output>
							<Dim>Click a file to view its contents, or use the actions above to create files and directories.</Dim>
						</Output>
					)}
				</div>
			</div>

			<Callout>
				The sandbox filesystem is fully writable. Use <span className="font-medium">listFiles()</span>,{' '}
				<span className="font-medium">readFile()</span>, <span className="font-medium">writeFile()</span>, and{' '}
				<span className="font-medium">mkdir()</span> to manage files programmatically. All paths are absolute within the sandbox.
			</Callout>
		</section>
	);
}
