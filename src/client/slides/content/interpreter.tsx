import { motion, AnimatePresence } from 'motion/react';
import { useState, useRef, useEffect } from 'react';

import { Badge } from '@/components/badge';
import { Output, Stdout, Stderr, Dim, Info } from '@/components/output';
import { api } from '@/lib/api';
import { highlightCode } from '@/lib/highlight';

import { CollapsibleCodeContext } from '../components/collapsible-code-context';
import { Reveal } from '../components/reveal';
import { SlideLayout } from '../components/slide-layout';
import { SlideTitle } from '../components/slide-title';

import type { SlideProperties } from '../types';

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

const SDK_CODE = `const ctx = await sandbox.createCodeContext({ language: "python" });
await sandbox.runCode("x = 42", { context: ctx });
const result = await sandbox.runCode("print(x * 2)", { context: ctx });`;

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

/**
 * Slide 5: Code Interpreter
 * Steps:
 *   0 = title + subtitle
 *   1 = SDK code block
 *   2 = interactive editor + presets + output (auto-runs first preset)
 */
export function InterpreterSlide({ step }: SlideProperties) {
	const [code, setCode] = useState(PRESETS.fibonacci.python);
	const [language, setLanguage] = useState<Language>('python');
	const [activePreset, setActivePreset] = useState<string>('fibonacci');
	const [contextId, setContextId] = useState<string | undefined>();
	const [result, setResult] = useState<CodeResult | undefined>();
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | undefined>();
	const autoRan = useRef(false);
	const debounceReference = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const runIdReference = useRef(0);
	const contextIdReference = useRef(contextId);
	const preReference = useRef<HTMLPreElement>(null);

	useEffect(() => {
		contextIdReference.current = contextId;
	}, [contextId]);

	// Single execute function that takes explicit code+language+contextId.
	// Uses a run ID to discard stale responses.
	async function execute(codeToRun: string, lang: Language, contextId_?: string) {
		if (!codeToRun.trim()) return;
		clearTimeout(debounceReference.current);
		const thisRunId = ++runIdReference.current;
		setResult(undefined);
		setError(undefined);
		setLoading(true);
		try {
			const data = await api<CodeResult>('/api/code', {
				code: codeToRun,
				language: lang,
				contextId: contextId_,
			});
			if (runIdReference.current !== thisRunId) return;
			setResult({
				...data,
				logs: data.logs ?? { stdout: [], stderr: [] },
				results: Array.isArray(data.results) ? data.results : [],
			});
			setContextId(data.contextId);
		} catch (error_) {
			if (runIdReference.current !== thisRunId) return;
			setError(error_ instanceof Error ? error_.message : 'Execution failed');
		} finally {
			if (runIdReference.current === thisRunId) setLoading(false);
		}
	}

	// Auto-run when the editor step is first reached
	useEffect(() => {
		if (step >= 2 && !autoRan.current) {
			autoRan.current = true;
			void execute(code, language, contextIdReference.current);
		}
	}, [step]); // eslint-disable-line react-hooks/exhaustive-deps

	// Debounced auto-run when code changes via typing (not presets/language switch)
	const skipNextDebounce = useRef(false);
	useEffect(() => {
		if (step < 2 || !autoRan.current) return;
		if (skipNextDebounce.current) {
			skipNextDebounce.current = false;
			return;
		}
		// Clear output immediately on code change
		setResult(undefined);
		setError(undefined);
		clearTimeout(debounceReference.current);
		debounceReference.current = setTimeout(() => {
			void execute(code, language, contextIdReference.current);
		}, 600);
		return () => clearTimeout(debounceReference.current);
	}, [code]); // eslint-disable-line react-hooks/exhaustive-deps

	function switchLanguage(lang: Language) {
		setLanguage(lang);
		// Clear context -- new language needs a fresh context
		setContextId(undefined);
		contextIdReference.current = undefined;
		setResult(undefined);
		setError(undefined);
		skipNextDebounce.current = true;
		// Always load the active preset's variant for the new language,
		// discarding any edits the user has made in the previous language.
		const newCode = PRESETS[activePreset][lang];
		setCode(newCode);
		void execute(newCode, lang);
	}

	function loadPreset(key: string) {
		setActivePreset(key);
		const newCode = PRESETS[key][language];
		skipNextDebounce.current = true;
		setCode(newCode);
		void execute(newCode, language, contextIdReference.current);
	}

	return (
		<SlideLayout>
			<SlideTitle
				number="03"
				title="Code Interpreter"
				subtitle="Python & JavaScript with persistent state across executions."
				step={step}
			/>

			<div className="mt-6 flex flex-1 flex-col gap-5 overflow-y-auto">
				{/* SDK code: full block at step 1, collapses to compact strip at step 2 */}
				{step >= 1 && (
					<CollapsibleCodeContext
						step={step}
						code={SDK_CODE}
						label="SDK"
						summary="sandbox.createCodeContext() → sandbox.runCode(code, { context })"
					/>
				)}

				{step >= 2 && (
					<Reveal visible={step >= 2}>
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
											rounded-full px-4 py-1.5 text-base font-medium transition-colors
											active:translate-y-px active:scale-[0.98]
											${language === 'python' ? 'bg-cf-orange text-[#fff]' : 'text-cf-text-muted hover:text-cf-text'}`}
									>
										Python
									</button>
									<button
										onClick={() => switchLanguage('javascript')}
										className={`
											rounded-full px-4 py-1.5 text-base font-medium transition-colors
											active:translate-y-px active:scale-[0.98]
											${language === 'javascript' ? 'bg-cf-orange text-[#fff]' : 'text-cf-text-muted hover:text-cf-text'}`}
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
											void execute(code, language, contextIdReference.current);
										}
										if (event_.key === 'Tab') {
											event_.preventDefault();
											const target = event_.currentTarget;
											const start = target.selectionStart;
											const end = target.selectionEnd;
											setCode(code.slice(0, start) + '    ' + code.slice(end));
											requestAnimationFrame(() => {
												target.selectionStart = target.selectionEnd = start + 4;
											});
										}
									}}
									rows={8}
									spellCheck={false}
									className="
										relative min-h-[120px] w-full resize-y bg-transparent
										p-[0.625rem_0.875rem] font-mono text-[0.9375rem] leading-relaxed
										wrap-break-word whitespace-pre-wrap text-transparent caret-cf-text
										outline-none
										selection:bg-[oklch(from_#ff4801_l_c_h/20%)]
										selection:text-transparent
									"
								/>
							</div>

							{/* Controls */}
							<div className="flex items-center justify-between">
								<div className="flex flex-wrap gap-2">
									{Object.entries(PRESETS).map(([key, preset]) => (
										<button key={key} onClick={() => loadPreset(key)} className="btn-preset text-base">
											{preset.label}
										</button>
									))}
								</div>
								<button
									onClick={() => void execute(code, language, contextIdReference.current)}
									disabled={loading || !code.trim()}
									className="btn-base flex items-center gap-2 btn-primary text-base"
								>
									{loading ? 'Running...' : result ? 'Run Again' : 'Run'}
								</button>
							</div>

							{/* Output */}
							<div className="flex flex-col gap-2">
								{/* Stable badge row -- always takes space, opacity-controlled */}
								<div
									className={`
										flex items-center gap-2 transition-opacity duration-200
										${result && !loading ? 'opacity-100' : 'opacity-0'}
									`}
								>
									<Badge variant={result?.error ? 'error' : 'success'}>#{result?.executionCount ?? ' '}</Badge>
									<span className="font-mono text-base text-cf-text-subtle">
										{result?.contextId ? `context: ${result.contextId.slice(0, 12)}...` : '\u00A0'}
									</span>
								</div>
								<Output className="min-h-[80px] text-base/relaxed">
									{loading && <Dim>Executing...</Dim>}
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
												{r.text ? <Info>{r.text}</Info> : undefined}
												{'\n'}
											</span>
										))}
									{!loading && !result && !error && <Dim>Run code to see output</Dim>}
									{!loading &&
										result &&
										(result.logs?.stdout?.length ?? 0) === 0 &&
										(result.logs?.stderr?.length ?? 0) === 0 &&
										!result.error &&
										(result.results?.length ?? 0) === 0 && <Dim>(no output)</Dim>}
								</Output>
							</div>
						</div>
					</Reveal>
				)}
			</div>
		</SlideLayout>
	);
}

InterpreterSlide.steps = 3;
