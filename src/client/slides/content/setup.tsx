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
		description: 'Choose Durable Object scheduling and define a named image for your class.',
		code: `{
  "containers": [{
    "class_name": "Sandbox",
    "scheduling_policy": "durable_object",
    "images": { "sandbox": { "dockerfile": "./Dockerfile" } }
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
		description: 'Choose your Linux image and tools, then copy the matching SDK helper into it.',
		code: `FROM node:24-trixie-slim
RUN apt-get update && apt-get install -y python3 git ca-certificates
COPY --from=cloudflare/sandbox:1.0.3 /usr/local/bin/sandbox-shim /usr/local/bin/sandbox-shim
WORKDIR /workspace
CMD ["sleep", "infinity"]`,
	},
	{
		number: '3',
		label: 'Write your Worker',
		file: 'src/index.ts',
		description: 'Define your Durable Object methods. Start a container lazily and wait for command output.',
		code: `import { DurableObject } from 'cloudflare:workers';
export class Sandbox extends DurableObject {
  async version() {
    const container = this.ctx.container;
    if (!container.running) {
      container.start({ image: container.images.sandbox, instance: 'basic', enableInternet: true });
      await container.setInactivityTimeout(600000);
    }
    const process = await container.exec(['python3', '--version']);
    const result = await process.output();
    return new TextDecoder().decode(result.stdout);
  }
}
// Worker: await env.Sandbox.getByName('user-123').version()`,
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
