import { motion } from 'motion/react';
import { useState } from 'react';

import { Badge } from '@/components/badge';
import { Output, Stderr, Dim } from '@/components/output';
import { api } from '@/lib/api';

import { CollapsibleCodeContext } from '../components/collapsible-code-context';
import { Reveal } from '../components/reveal';
import { SlideLayout } from '../components/slide-layout';
import { SlideTitle } from '../components/slide-title';

import type { SlideProperties } from '../types';

interface AuthResult {
	headers: Record<string, string>;
	exitCode: number;
	success: boolean;
	duration: number;
}

const CODE = `import { Sandbox, ContainerProxy } from '@cloudflare/sandbox';
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

const EASE = [0.16, 1, 0.3, 1] as const;

// Headers injected by the outbound Worker
const INJECTED_HEADERS = new Set(['Authorization', 'X-Sandbox-Auth']);

function HeaderLine({ name, value, injected, delay }: { name: string; value: string; injected: boolean; delay: number }) {
	return (
		<motion.div
			className="flex gap-2"
			initial={{ opacity: 0, x: -8 }}
			animate={{ opacity: 1, x: 0 }}
			transition={{ duration: 0.3, delay, ease: EASE }}
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

/**
 * Slide 10: Outbound Auth
 * Steps: 0=title+subtitle, 1=code, 2=live demo
 */
export function AuthSlide({ step }: SlideProperties) {
	const [result, setResult] = useState<AuthResult | undefined>();
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | undefined>();

	async function makeRequest() {
		setLoading(true);
		setError(undefined);
		setResult(undefined);
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
				const aInjected = INJECTED_HEADERS.has(a);
				const bInjected = INJECTED_HEADERS.has(b);
				if (aInjected && !bInjected) return -1;
				if (!aInjected && bInjected) return 1;
				return a.localeCompare(b);
			})
		: [];

	return (
		<SlideLayout>
			<SlideTitle number="10" title="Outbound Auth" subtitle="Intercept outgoing requests. Inject credentials transparently." step={step} />

			<div className="mt-8 flex flex-1 flex-col gap-6">
				{step >= 1 && (
					<CollapsibleCodeContext
						step={step}
						code={CODE}
						label="OUTBOUND WORKER"
						summary='MySandbox.outboundByHost = { "httpbin.org": (req, env) => fetch(withAuth(req)) }'
					/>
				)}

				<Reveal visible={step >= 2} direction="up">
					<div className="flex flex-col gap-3">
						<div className="flex items-center gap-3">
							<code className="flex-1 font-mono text-base text-cf-text-muted">
								<span className="text-surface-dark-success">$ </span>
								curl https://httpbin.org/headers
							</code>
							<button onClick={() => void makeRequest()} disabled={loading} className="btn-base btn-primary text-base">
								{loading ? 'Running...' : 'Make Request'}
							</button>
						</div>

						<div className="flex min-h-7 items-center gap-3">
							{result && !loading ? (
								<>
									<Badge variant={result.success ? 'success' : 'error'}>exit {result.exitCode}</Badge>
									<span className="font-mono text-base text-cf-text-subtle">{result.duration}ms</span>
								</>
							) : loading ? (
								<span className="font-mono text-sm text-cf-text-subtle">Request in progress...</span>
							) : error ? (
								<Badge variant="error">request failed</Badge>
							) : (
								<span className="font-mono text-sm text-transparent select-none">placeholder</span>
							)}
						</div>

						<Output className="min-h-[140px] text-base/relaxed">
							{loading ? (
								<Dim>
									<motion.span animate={{ opacity: [0.45, 0.8, 0.45] }} transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}>
										Running curl inside sandbox...
									</motion.span>
								</Dim>
							) : result ? (
								sortedHeaders.map(([name, value], index) => (
									<HeaderLine key={name} name={name} value={value} injected={INJECTED_HEADERS.has(name)} delay={index * 0.05} />
								))
							) : error ? (
								<Stderr>{error}</Stderr>
							) : (
								<Dim>Make a request to see injected headers</Dim>
							)}
						</Output>
					</div>
				</Reveal>
			</div>
		</SlideLayout>
	);
}

AuthSlide.steps = 3;
