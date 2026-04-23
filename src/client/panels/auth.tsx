import { motion, AnimatePresence } from 'motion/react';
import { useState } from 'react';

import { Badge } from '@/components/badge';
import { Callout } from '@/components/callout';
import { CodeBlock } from '@/components/code-block';
import { Output, Stderr, Dim } from '@/components/output';
import { api } from '@/lib/api';

interface AuthResult {
	headers: Record<string, string>;
	exitCode: number;
	success: boolean;
	duration: number;
}

const SDK_CODE = `import { Sandbox, ContainerProxy } from '@cloudflare/sandbox';
export { ContainerProxy };

export class MySandbox extends Sandbox {
  interceptHttps = true;
}

MySandbox.outboundByHost = {
  "httpbin.org": (request, env, ctx) => {
    const requestWithAuth = new Request(request);
    requestWithAuth.headers.set("Authorization", "Bearer sb_demo_secret_token_12345");
    requestWithAuth.headers.set("X-Sandbox-Auth", "injected-by-outbound-worker");
    return fetch(requestWithAuth);
  },
};`;

const COMMAND = 'curl https://httpbin.org/headers';

// Headers that are injected by the outbound Worker
const INJECTED_HEADERS = new Set(['Authorization', 'X-Sandbox-Auth']);

function HeaderLine({ name, value, injected, delay }: { name: string; value: string; injected: boolean; delay: number }) {
	return (
		<motion.div
			className="flex gap-2"
			initial={{ opacity: 0, x: -8 }}
			animate={{ opacity: 1, x: 0 }}
			transition={{ duration: 0.3, delay, ease: [0.16, 1, 0.3, 1] }}
		>
			{injected ? (
				<>
					<span className="font-semibold text-cf-orange">{name}:</span>
					<span className="text-cf-orange">{value}</span>
					<span
						className="
							ml-1 inline-flex items-center rounded-sm bg-cf-orange/10 px-1.5 py-px
							text-[10px] font-medium text-cf-orange
						"
					>
						INJECTED
					</span>
				</>
			) : (
				<>
					<span className="font-semibold text-surface-dark-text">{name}:</span>
					<span className="text-surface-dark-muted">{value}</span>
				</>
			)}
		</motion.div>
	);
}

export function AuthPanel() {
	const [result, setResult] = useState<AuthResult | undefined>();
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | undefined>();

	async function makeRequest() {
		setLoading(true);
		setError(undefined);
		try {
			const data = await api<AuthResult>('/api/auth/request', {});
			setResult(data);
		} catch (error_) {
			setResult(undefined);
			setError(error_ instanceof Error ? error_.message : 'Request failed');
		} finally {
			setLoading(false);
		}
	}

	const sortedHeaders = result
		? Object.entries(result.headers).toSorted(([a], [b]) => {
				// Put injected headers first
				const aInjected = INJECTED_HEADERS.has(a);
				const bInjected = INJECTED_HEADERS.has(b);
				if (aInjected && !bInjected) return -1;
				if (!aInjected && bInjected) return 1;
				return a.localeCompare(b);
			})
		: [];

	return (
		<section className="flex flex-col gap-6">
			<div>
				<h2 className="font-sans text-2xl font-medium text-cf-text">Outbound Auth</h2>
				<p className="mt-1 text-base text-cf-text-muted">
					Outbound Workers intercept HTTP traffic leaving the sandbox and inject credentials transparently. The sandbox code never sees the
					secret.
				</p>
			</div>

			<CodeBlock code={SDK_CODE} label="OUTBOUND WORKER" />

			<div className="flex flex-col gap-4">
				<div className="flex items-center gap-3">
					<code
						className="
							flex-1 rounded-md border border-cf-border bg-cf-bg-200 px-4 py-2.5
							font-mono text-sm text-cf-text-muted
						"
					>
						<span className="text-cf-text-subtle">$</span> {COMMAND}
					</code>
					<button onClick={() => void makeRequest()} disabled={loading} className="btn-base btn-primary">
						{loading ? 'Running...' : 'Make Request'}
					</button>
				</div>

				<AnimatePresence mode="wait">
					{loading && (
						<motion.div
							key="loading"
							initial={{ opacity: 0, y: 8 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -4 }}
							transition={{ duration: 0.25 }}
						>
							<Output>
								<Dim>
									<motion.span animate={{ opacity: [0.4, 0.8, 0.4] }} transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}>
										Running curl inside sandbox...
									</motion.span>
								</Dim>
							</Output>
						</motion.div>
					)}

					{result && !loading && (
						<motion.div
							key="result"
							className="flex flex-col gap-3"
							initial={{ opacity: 0, y: 16 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -8 }}
							transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
						>
							<div className="flex items-center gap-2">
								<Badge variant={result.success ? 'success' : 'error'}>exit {result.exitCode}</Badge>
								<span className="font-mono text-sm text-cf-text-subtle">{result.duration}ms</span>
							</div>

							<div className="flex flex-col gap-1">
								<span
									className="
										text-xs font-medium tracking-wider text-cf-text-subtle uppercase
									"
								>
									Response Headers (echoed by httpbin.org)
								</span>
								<Output>
									{sortedHeaders.map(([name, value], index) => (
										<HeaderLine key={name} name={name} value={value} injected={INJECTED_HEADERS.has(name)} delay={index * 0.05} />
									))}
								</Output>
							</div>
						</motion.div>
					)}

					{error && (
						<motion.div
							key="error"
							initial={{ opacity: 0, scale: 0.96 }}
							animate={{ opacity: 1, scale: 1 }}
							exit={{ opacity: 0, scale: 0.96 }}
							transition={{ duration: 0.25 }}
						>
							<Output>
								<Stderr>{error}</Stderr>
							</Output>
						</motion.div>
					)}
				</AnimatePresence>
			</div>

			<Callout>
				The sandbox ran <span className="font-medium">curl</span> with no authentication headers. The{' '}
				<span className="font-medium">outbound Worker</span> intercepted the request to httpbin.org and injected{' '}
				<span className="font-medium">Authorization</span> and <span className="font-medium">X-Sandbox-Auth</span> headers before forwarding
				it. The sandbox never had access to the credentials — this is zero-trust credential injection. httpbin.org is a public HTTP
				inspection service that echoes back the headers it receives, making it easy to verify the injection worked.
			</Callout>
		</section>
	);
}
