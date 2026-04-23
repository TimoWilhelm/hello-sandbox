import { AISlide } from './content/ai';
import { ArchitectureSlide } from './content/architecture';
import { AuthSlide } from './content/auth';
import { BackupSlide } from './content/backup';
import { ClosingSlide } from './content/closing';
import { CommandsSlide } from './content/commands';
import { FilesSlide } from './content/files';
import { InterpreterSlide } from './content/interpreter';
import { OpencodeSlide } from './content/opencode';
import { PreviewSlide } from './content/preview';
import { ProblemSlide } from './content/problem';
import { SetupSlide } from './content/setup';
import { TerminalSlide } from './content/terminal';
import { TitleSlide } from './content/title';
import { UseCasesSlide } from './content/use-cases';
import { WatchSlide } from './content/watch';

import type { SlideDefinition } from './types';

export const SLIDES: SlideDefinition[] = [
	// Intro arc: what, why, how
	{ id: 'title', title: 'Sandbox SDK', component: TitleSlide, steps: TitleSlide.steps },
	{ id: 'problem', title: 'Why Sandboxes', component: ProblemSlide, steps: ProblemSlide.steps },
	{ id: 'use-cases', title: 'Use Cases', component: UseCasesSlide, steps: UseCasesSlide.steps },
	{ id: 'architecture', title: 'How it Works', component: ArchitectureSlide, steps: ArchitectureSlide.steps },
	{ id: 'setup', title: 'Getting Started', component: SetupSlide, steps: SetupSlide.steps },

	// Feature demos
	{ id: 'commands', title: 'Execute Commands', component: CommandsSlide, steps: CommandsSlide.steps },
	{ id: 'files', title: 'File System', component: FilesSlide, steps: FilesSlide.steps },
	{ id: 'interpreter', title: 'Code Interpreter', component: InterpreterSlide, steps: InterpreterSlide.steps },
	{ id: 'ai', title: 'AI Code Execution', component: AISlide, steps: AISlide.steps },
	{ id: 'terminal', title: 'Interactive Terminal', component: TerminalSlide, steps: TerminalSlide.steps },
	{ id: 'preview', title: 'Preview URLs', component: PreviewSlide, steps: PreviewSlide.steps },
	{ id: 'watch', title: 'File Watching', component: WatchSlide, steps: WatchSlide.steps },
	{ id: 'opencode', title: 'AI Coding Agents', component: OpencodeSlide, steps: OpencodeSlide.steps },
	{ id: 'backup', title: 'Backup & Restore', component: BackupSlide, steps: BackupSlide.steps },
	{ id: 'auth', title: 'Outbound Auth', component: AuthSlide, steps: AuthSlide.steps },

	// Closing
	{ id: 'closing', title: 'Get Started', component: ClosingSlide, steps: ClosingSlide.steps },
];
