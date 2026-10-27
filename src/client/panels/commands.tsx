import { motion, AnimatePresence } from 'motion/react';
import { useState } from 'react';

import { Badge } from '@/components/badge';
import { Callout } from '@/components/callout';
import { CodeBlock } from '@/components/code-block';
import { Output, Stdout, Stderr, Dim } from '@/components/output';
import { api } from '@/lib/api';
import { sdkExamples } from '@/lib/sdk-examples';

interface ExecResult {
	stdout: string;
	stderr: string;
	exitCode: number;
	success: boolean;
	command: string;
	duration: number;
}

const SDK_CODE = sdkExamples.commands;

const PRESETS = ['python3 --version', 'node --version', 'ls -la /workspace', 'cat /etc/os-release', 'uname -a', 'whoami && pwd'];

/* Blinking block cursor like a real terminal */
function TerminalCursor() {
	return (
		<motion.span
			className="
				inline-block h-3.5 w-[7px] translate-y-px rounded-[1px] bg-cf-orange
			"
			animate={{ opacity: [1, 0.15, 1] }}
			transition={{ duration: 0.9, repeat: Infinity, ease: 'linear', times: [0, 0.5, 1] }}
		/>
	);
}

/* Animated loading state that looks like a terminal prompt running */
function CommandRunningIndicator({ command }: { command: string }) {
	return (
		<Dim>
			<span className="flex items-center gap-0">
				<motion.span
					className="text-surface-dark-success"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ duration: 0.15 }}
				>
					${' '}
				</motion.span>
				<motion.span
					initial={{ width: 0 }}
					animate={{ width: 'auto' }}
					transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
					className="inline-block overflow-hidden whitespace-nowrap"
				>
					{command || 'running'}
				</motion.span>
				<TerminalCursor />
			</span>
		</Dim>
	);
}

export function CommandsPanel() {
	const [command, setCommand] = useState('');
	const [result, setResult] = useState<ExecResult | undefined>();
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | undefined>();

	async function run(cmd: string) {
		const trimmed = cmd.trim();
		if (!trimmed) return;
		setLoading(true);
		setError(undefined);
		try {
			const data = await api<ExecResult>('/api/exec', { command: trimmed });
			setResult(data);
		} catch (error_) {
			setResult(undefined);
			setError(error_ instanceof Error ? error_.message : 'Execution failed');
		} finally {
			setLoading(false);
		}
	}

	return (
		<section className="flex flex-col gap-6">
			<div>
				<h2 className="font-sans text-2xl font-medium text-cf-text">Execute Commands</h2>
				<p className="mt-1 text-base text-cf-text-muted">
					Run shell commands directly in the sandbox environment with full stdout/stderr capture and exit code tracking.
				</p>
			</div>

			<CodeBlock code={SDK_CODE} />

			<div className="flex flex-col gap-4">
				<div className="flex gap-2">
					<input
						type="text"
						value={command}
						onChange={(event_) => setCommand(event_.target.value)}
						onKeyDown={(event_) => {
							if (event_.key === 'Enter') void run(command);
						}}
						placeholder="Enter a shell command..."
						className="
							input-field flex-1
							placeholder:text-cf-text-subtle
						"
					/>
					<button onClick={() => void run(command)} disabled={loading || !command.trim()} className="btn-base btn-primary">
						{loading ? 'Running...' : 'Run'}
					</button>
				</div>

				<div className="flex flex-wrap gap-2">
					{PRESETS.map((preset) => (
						<button
							key={preset}
							onClick={() => {
								setCommand(preset);
								void run(preset);
							}}
							className="btn-preset"
						>
							{preset}
						</button>
					))}
				</div>

				{(result || error || loading) && (
					<div className="flex flex-col gap-2">
						<AnimatePresence>
							{result && !loading && (
								<motion.div
									className="flex items-center gap-2"
									initial={{ opacity: 0, x: -10 }}
									animate={{ opacity: 1, x: 0 }}
									exit={{ opacity: 0 }}
									transition={{ duration: 0.3, delay: 0.05 }}
								>
									<Badge variant={result.success ? 'success' : 'error'}>exit {result.exitCode}</Badge>
									<span className="font-mono text-sm text-cf-text-subtle">{result.command}</span>
									<motion.span
										className="text-sm text-cf-text-subtle"
										initial={{ opacity: 0 }}
										animate={{ opacity: 1 }}
										transition={{ delay: 0.15 }}
									>
										{result.duration}ms
									</motion.span>
								</motion.div>
							)}
						</AnimatePresence>
						<Output>
							{loading && <CommandRunningIndicator command={command} />}
							{error && <Stderr>{error}</Stderr>}
							{!loading && result?.stdout && <Stdout>{result.stdout}</Stdout>}
							{!loading && result?.stderr && <Stderr>{result.stderr}</Stderr>}
							{!loading && result && !result.stdout && !result.stderr && <Dim>(no output)</Dim>}
						</Output>
					</div>
				)}
			</div>

			<Callout>
				<span className="font-medium">sandbox.exec()</span> runs a command to completion and captures all output. It returns stdout, stderr,
				the exit code, and execution duration. Commands run with the default shell in the sandbox environment.
			</Callout>
		</section>
	);
}
