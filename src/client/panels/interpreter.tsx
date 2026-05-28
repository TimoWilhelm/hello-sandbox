import { motion, AnimatePresence } from 'motion/react';
import { useState, useCallback, useRef } from 'react';

import { Badge } from '@/components/badge';
import { Callout } from '@/components/callout';
import { CodeBlock } from '@/components/code-block';
import { Output, Stdout, Stderr, Info, Dim } from '@/components/output';
import { api } from '@/lib/api';
import { highlightCode } from '@/lib/highlight';

interface CodeLogs {
	stdout: string[];
	stderr: string[];
}

interface CodeError {
	name: string;
	value: string;
	traceback: string[];
}

interface ResultEntry {
	type: string;
	text?: string;
	html?: string;
}

interface CodeResult {
	logs: CodeLogs;
	error: CodeError | null;
	results: ResultEntry[];
	executionCount: number;
	contextId: string;
	code: string;
}

type Language = 'python' | 'javascript';

const SDK_CODE = `const ctx = await sandbox.createCodeContext({ language: 'python' });
await sandbox.runCode('x = 42', { context: ctx });
const result = await sandbox.runCode('print(x * 2)', { context: ctx });`;

const PRESETS: Record<string, { label: string; python: string; javascript: string }> = {
	fibonacci: {
		label: 'Fibonacci',
		python: `def fib(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a

for i in range(1, 11):
    print(f"fib({i}) = {fib(i)}")`,
		javascript: `function fib(n) {
  let a = 0, b = 1;
  for (let i = 0; i < n; i++) [a, b] = [b, a + b];
  return a;
}

for (let i = 1; i <= 10; i++) {
  console.log(\`fib(\${i}) = \${fib(i)}\`);
}`,
	},
	data: {
		label: 'Data Analysis',
		python: String.raw`import pandas as pd
import json

data = {
    "name": ["Alice", "Bob", "Charlie", "Diana"],
    "age": [28, 35, 42, 31],
    "score": [92.5, 87.3, 95.1, 88.7]
}

df = pd.DataFrame(data)
print(df.to_string())
print(f"\nMean age: {df['age'].mean():.1f}")
print(f"Max score: {df['score'].max()}")`,
		javascript: `const data = [
  { name: "Alice", age: 28, score: 92.5 },
  { name: "Bob", age: 35, score: 87.3 },
  { name: "Charlie", age: 42, score: 95.1 },
  { name: "Diana", age: 31, score: 88.7 },
];

console.table(data);
const avgAge = data.reduce((s, d) => s + d.age, 0) / data.length;
const maxScore = Math.max(...data.map(d => d.score));
console.log(\`Mean age: \${avgAge.toFixed(1)}\`);
console.log(\`Max score: \${maxScore}\`);`,
	},
	state: {
		label: 'State test',
		python: `# Run this cell multiple times - the counter persists!
try:
    counter += 1
except NameError:
    counter = 1

print(f"This cell has been run {counter} time(s)")
print(f"State is persisted across executions!")`,
		javascript: `// Run this cell multiple times - the counter persists!
if (typeof globalThis.counter === 'undefined') {
  globalThis.counter = 0;
}
globalThis.counter++;

console.log(\`This cell has been run \${globalThis.counter} time(s)\`);
console.log("State is persisted across executions!");`,
	},
};

/* Animated code execution indicator -- bouncing brackets with cascading dots */
function CodeRunningIndicator() {
	return (
		<span className="inline-flex items-center gap-1">
			<motion.span
				className="font-mono text-base font-bold text-cf-orange"
				animate={{ x: [-2, 0, -2] }}
				transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
			>
				{'{ '}
			</motion.span>
			{[0, 1, 2].map((index) => (
				<motion.span
					key={index}
					className="inline-block size-1 rounded-full bg-cf-orange"
					animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
					transition={{ duration: 0.6, repeat: Infinity, delay: index * 0.15, ease: 'easeInOut' }}
				/>
			))}
			<motion.span
				className="font-mono text-base font-bold text-cf-orange"
				animate={{ x: [2, 0, 2] }}
				transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
			>
				{' }'}
			</motion.span>
		</span>
	);
}

/* Code running state for the output area */
function CodeExecutingState() {
	return (
		<Dim>
			<span className="flex items-center gap-2">
				<CodeRunningIndicator />
				<motion.span animate={{ opacity: [0.4, 0.9, 0.4] }} transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}>
					Executing...
				</motion.span>
			</span>
		</Dim>
	);
}

export function InterpreterPanel() {
	const [code, setCode] = useState(PRESETS.fibonacci.python);
	const [language, setLanguage] = useState<Language>('python');
	const [activePreset, setActivePreset] = useState<string>('fibonacci');
	const [contextId, setContextId] = useState<string | undefined>();
	const [result, setResult] = useState<CodeResult | undefined>();
	const [loading, setLoading] = useState(false);
	const preReference = useRef<HTMLPreElement>(null);
	const [error, setError] = useState<string | undefined>();

	const runCode = useCallback(async () => {
		if (!code.trim()) return;
		setLoading(true);
		setError(undefined);
		try {
			const data = await api<CodeResult>('/api/code', {
				code,
				language,
				contextId,
			});
			setResult({
				...data,
				logs: data.logs ?? { stdout: [], stderr: [] },
				results: Array.isArray(data.results) ? data.results : [],
			});
			setContextId(data.contextId);
		} catch (error_) {
			setError(error_ instanceof Error ? error_.message : 'Execution failed');
		} finally {
			setLoading(false);
		}
	}, [code, language, contextId]);

	function switchLanguage(lang: Language) {
		setLanguage(lang);
		setContextId(undefined);
		setResult(undefined);
		setError(undefined);
		// Always load the active preset's variant for the new language,
		// discarding any edits the user has made in the previous language.
		setCode(PRESETS[activePreset][lang]);
	}

	function loadPreset(key: string) {
		setActivePreset(key);
		setCode(PRESETS[key][language]);
		// Reset context so the preset starts with a clean execution environment.
		// This prevents "already declared" errors when re-running JS snippets
		// that use top-level let/const declarations.
		setContextId(undefined);
		setResult(undefined);
	}

	return (
		<section className="flex flex-col gap-6">
			<div>
				<h2 className="font-sans text-2xl font-medium text-cf-text">Code Interpreter</h2>
				<p className="mt-1 text-base text-cf-text-muted">
					Execute Python or JavaScript code with persistent state across executions using code contexts.
				</p>
			</div>

			<CodeBlock code={SDK_CODE} />

			<div className="flex flex-col gap-4">
				{/* Language toggle + context badge */}
				<div className="flex items-center justify-between">
					<div
						className="
							inline-flex rounded-full border border-cf-border bg-cf-bg-200 p-0.5
						"
					>
						<button
							onClick={() => switchLanguage('python')}
							className={`
								rounded-full px-4 py-1.5 text-sm font-medium transition-colors
								active:translate-y-px active:scale-[0.98]
								${language === 'python' ? 'bg-cf-orange text-[#fff]' : 'text-cf-text-muted hover:text-cf-text'}
							`}
						>
							Python
						</button>
						<button
							onClick={() => switchLanguage('javascript')}
							className={`
								rounded-full px-4 py-1.5 text-sm font-medium transition-colors
								active:translate-y-px active:scale-[0.98]
								${language === 'javascript' ? 'bg-cf-orange text-[#fff]' : 'text-cf-text-muted hover:text-cf-text'}
							`}
						>
							JavaScript
						</button>
					</div>
					<AnimatePresence>
						{contextId && (
							<motion.div
								initial={{ opacity: 0, scale: 0.8 }}
								animate={{ opacity: 1, scale: 1 }}
								exit={{ opacity: 0, scale: 0.8 }}
								transition={{ duration: 0.2 }}
							>
								<Badge variant="info">ctx: {contextId.slice(0, 8)}</Badge>
							</motion.div>
						)}
					</AnimatePresence>
				</div>

				{/* Syntax-highlighted code editor */}
				<div
					className="
						group relative min-h-[120px] overflow-hidden rounded-lg border
						border-cf-border bg-cf-bg-200 transition-[border-color,box-shadow]
						focus-within:border-cf-orange focus-within:shadow-focus
					"
				>
					<pre
						ref={preReference}
						aria-hidden
						className="
							pointer-events-none absolute inset-0 overflow-hidden
							p-[0.625rem_0.875rem] font-mono text-[0.9375rem] leading-relaxed
							wrap-break-word whitespace-pre-wrap text-cf-text
						"
						dangerouslySetInnerHTML={{ __html: highlightCode(code) + '\n' }}
					/>
					<textarea
						value={code}
						onChange={(event_) => setCode(event_.target.value)}
						onScroll={(event_) => {
							if (preReference.current) {
								preReference.current.scrollTop = event_.currentTarget.scrollTop;
								preReference.current.scrollLeft = event_.currentTarget.scrollLeft;
							}
						}}
						onKeyDown={(event_) => {
							if (event_.key === 'Enter' && (event_.metaKey || event_.ctrlKey)) {
								event_.preventDefault();
								void runCode();
							}
							if (event_.key === 'Tab') {
								event_.preventDefault();
								const target = event_.currentTarget;
								const start = target.selectionStart;
								const end = target.selectionEnd;
								const newCode = code.slice(0, start) + '    ' + code.slice(end);
								setCode(newCode);
								requestAnimationFrame(() => {
									target.selectionStart = target.selectionEnd = start + 4;
								});
							}
						}}
						rows={10}
						spellCheck={false}
						className="
							relative min-h-[120px] w-full resize-y bg-transparent
							p-[0.625rem_0.875rem] font-mono text-[0.9375rem] leading-relaxed
							wrap-break-word whitespace-pre-wrap text-transparent caret-cf-text
							outline-none
							selection:bg-[oklch(from_#ff4801_l_c_h/20%)] selection:text-transparent
						"
					/>
				</div>

				{/* Controls */}
				<div className="flex items-center justify-between">
					<div className="flex flex-wrap gap-2">
						{Object.entries(PRESETS).map(([key, preset]) => (
							<button key={key} onClick={() => loadPreset(key)} className="btn-preset">
								{preset.label}
							</button>
						))}
					</div>
					<button
						onClick={() => void runCode()}
						disabled={loading || !code.trim()}
						className="btn-base flex items-center gap-2 btn-primary"
					>
						{loading ? 'Running...' : 'Run'}
						<span className="text-xs opacity-70">{navigator.platform.includes('Mac') ? '\u2318' : 'Ctrl'}+Enter</span>
					</button>
				</div>

				{/* Output */}
				{(result || error || loading) && (
					<div className="flex flex-col gap-2">
						<AnimatePresence>
							{result && !loading && (
								<motion.div
									className="flex items-center gap-2"
									initial={{ opacity: 0, x: -10 }}
									animate={{ opacity: 1, x: 0 }}
									exit={{ opacity: 0 }}
									transition={{ duration: 0.25, delay: 0.05 }}
								>
									<Badge variant={result.error ? 'error' : 'success'}>#{result.executionCount}</Badge>
									{result.contextId && (
										<span className="font-mono text-sm text-cf-text-subtle">context: {result.contextId.slice(0, 12)}...</span>
									)}
								</motion.div>
							)}
						</AnimatePresence>
						<Output>
							{loading && <CodeExecutingState />}
							{error && <Stderr>{error}</Stderr>}
							{!loading &&
								result?.logs?.stdout?.map((line, index) => (
									<span key={`stdout-${index}`}>
										<Stdout>{line}</Stdout>
										{'\n'}
									</span>
								))}
							{!loading &&
								result?.logs?.stderr?.map((line, index) => (
									<span key={`stderr-${index}`}>
										<Stderr>{line}</Stderr>
										{'\n'}
									</span>
								))}
							{!loading && result?.error && (
								<Stderr>
									{result.error.name}: {result.error.value}
								</Stderr>
							)}
							{!loading &&
								result?.results?.map((r, index) => (
									<span key={`result-${index}`}>
										{r.html ? <Info>[HTML output available]</Info> : r.text ? <Info>{r.text}</Info> : undefined}
										{'\n'}
									</span>
								))}
							{!loading &&
								result &&
								(result.logs?.stdout?.length ?? 0) === 0 &&
								(result.logs?.stderr?.length ?? 0) === 0 &&
								!result.error &&
								(result.results?.length ?? 0) === 0 && <Dim>(no output)</Dim>}
						</Output>
					</div>
				)}
			</div>

			<Callout>
				Code contexts provide <span className="font-medium">stateful execution</span> — variables and imports persist between runs. The
				contextId identifies your session, so you can build up state incrementally just like a Jupyter notebook.
			</Callout>
		</section>
	);
}
