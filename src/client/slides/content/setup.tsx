import { Reveal } from '../components/reveal';
import { SlideLayout } from '../components/slide-layout';
import { SlideTitle } from '../components/slide-title';
import { RevealCode } from '../components/typewriter-code';

import type { SlideProperties } from '../types';

const STEPS = [
	{
		number: '1',
		label: 'Configure bindings',
		file: 'wrangler.jsonc',
		description: 'Define a container with the Sandbox class. Durable Objects handle lifecycle and routing automatically.',
		code: `{
  "containers": [{
    "class_name": "Sandbox",
    "image": "./Dockerfile",
    "instance_type": "lite",
    "max_instances": 5
  }],
  "durable_objects": {
    "bindings": [{
      "class_name": "Sandbox",
      "name": "Sandbox"
    }]
  }
}`,
	},
	{
		number: '2',
		label: 'Define your image',
		file: 'Dockerfile',
		description: 'Base image includes Python 3.11, Node.js 20, and common tools. Add your own dependencies on top.',
		code: `FROM docker.io/cloudflare/sandbox:0.10.3-python

RUN pip install pandas numpy requests
RUN npm install -g typescript

EXPOSE 8080`,
	},
	{
		number: '3',
		label: 'Write your Worker',
		file: 'src/index.ts',
		description:
			'Import the SDK, re-export the Sandbox class, and call getSandbox() to get a handle. Containers start lazily on first use.',
		code: `import { getSandbox } from "@cloudflare/sandbox";
export { Sandbox } from "@cloudflare/sandbox";

export default {
  async fetch(request, env) {
    const sandbox = getSandbox(env.Sandbox, "user-123");
    const result = await sandbox.exec("python3 --version");
    return Response.json(result);
  }
};`,
	},
];

/**
 * Slide: Setup / Getting Started
 * Steps: 0 = title + step 1, 1 = step 2, 2 = step 3
 *
 * Two-column layout: left has the step timeline, right shows the active code block.
 */
export function SetupSlide({ step }: SlideProperties) {
	const activeStep = STEPS[Math.min(step, STEPS.length - 1)];

	return (
		<SlideLayout>
			<SlideTitle number="00" title="Getting Started" subtitle="Three files. That's all you need." step={step} />

			<div className="mt-6 flex flex-1 gap-8 overflow-hidden">
				{/* Left: Step timeline */}
				<div className="flex w-[280px] shrink-0 flex-col gap-2 pt-2">
					{STEPS.map((s, index) => {
						const isActive = step === index;
						const isRevealed = step >= index;
						return (
							<Reveal key={s.number} visible={isRevealed} direction="left" index={0}>
								<div
									className={`
										rounded-xl border px-5 py-4 transition-colors duration-300
										${isActive ? 'border-cf-orange bg-cf-orange/5' : 'border-cf-border bg-cf-bg-200'}
									`}
								>
									<div className="flex items-center gap-3">
										<span
											className={`
												flex size-7 shrink-0 items-center justify-center rounded-full
												text-base font-bold
												${isActive ? 'bg-cf-orange text-[#fff]' : 'bg-cf-bg-300 text-cf-text-subtle'}
											`}
										>
											{s.number}
										</span>
										<div>
											<div
												className={`
													text-base font-semibold
													${isActive ? 'text-cf-orange' : 'text-cf-text'}
												`}
											>
												{s.label}
											</div>
											<div className="font-mono text-sm text-cf-text-subtle">{s.file}</div>
										</div>
									</div>
									{isActive && <p className="mt-3 text-base/relaxed text-cf-text-muted">{s.description}</p>}
								</div>
							</Reveal>
						);
					})}
				</div>

				{/* Right: Active code block */}
				<div className="flex min-w-0 flex-1 flex-col gap-3 pt-2">
					<RevealCode key={activeStep.file} code={activeStep.code} visible label={activeStep.file} />
				</div>
			</div>
		</SlideLayout>
	);
}

SetupSlide.steps = 3;
