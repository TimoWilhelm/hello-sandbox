import { useState } from 'react';

import { api } from '@/lib/api';
import { sdkExamples } from '@/lib/sdk-examples';

import { DemoStrip } from '../components/demo-strip';
import { SlideLayout } from '../components/slide-layout';
import { SlideTitle } from '../components/slide-title';
import { RevealCode } from '../components/typewriter-code';

import type { SlideProperties } from '../types';

interface ExecResult {
	stdout: string;
	stderr: string;
	exitCode: number;
	success: boolean;
	command: string;
	duration: number;
}

const CODE = sdkExamples.commands;

const PRESETS = ['python3 --version', 'node --version', 'uname -a', 'whoami && pwd', 'ls -la /workspace'];

/**
 * Slide 3: Execute Commands
 * Steps: 0=title+subtitle, 1=code, 2=live demo
 */
export function CommandsSlide({ step }: SlideProperties) {
	const [command, setCommand] = useState('');
	const [result, setResult] = useState<ExecResult | undefined>();
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | undefined>();
	const [lastCmd, setLastCmd] = useState('');

	async function run(cmd: string) {
		const trimmed = cmd.trim();
		if (!trimmed) return;
		setCommand(trimmed);
		setLastCmd(trimmed);
		setLoading(true);
		setError(undefined);
		setResult(undefined);
		try {
			const data = await api<ExecResult>('/api/exec', { command: trimmed });
			setResult(data);
		} catch (error_) {
			setError(error_ instanceof Error ? error_.message : 'Failed');
		} finally {
			setLoading(false);
		}
	}

	return (
		<SlideLayout>
			<SlideTitle number="01" title="Execute Commands" subtitle="Run any shell command. Get stdout, stderr, exit codes." step={step} />

			<div className="mt-8 flex flex-1 flex-col gap-6">
				<RevealCode code={CODE} visible={step >= 1} label="SDK" />

				<DemoStrip
					visible={step >= 2}
					customInput={{ value: command, onChange: setCommand, placeholder: 'Enter a shell command...' }}
					onCustomSubmit={() => void run(command)}
					presets={PRESETS}
					onPreset={(p) => {
						setCommand(p);
						void run(p);
					}}
					loading={loading}
					lastCommand={lastCmd}
					output={result ? result.stdout || result.stderr || '(no output)' : undefined}
					error={error}
					exitCode={result?.exitCode}
					duration={result?.duration}
					success={result?.success}
				/>
			</div>
		</SlideLayout>
	);
}

CommandsSlide.steps = 3;
