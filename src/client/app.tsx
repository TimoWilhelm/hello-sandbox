import {
	Play,
	FolderOpen,
	Code,
	Sparkles,
	TerminalSquare,
	Globe,
	Eye,
	MonitorCog,
	Archive,
	KeyRound,
	Presentation,
	Github,
	Menu,
	X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, useCallback, type ReactNode, type ComponentType } from 'react';

import { ErrorBoundary } from './components/error-boundary';
import { ReconnectModal } from './components/reconnect-modal';
import { useSandboxId } from './lib/use-sandbox-id';
import { AIPanel } from './panels/ai';
import { AuthPanel } from './panels/auth';
import { BackupPanel } from './panels/backup';
import { CommandsPanel } from './panels/commands';
import { FilesPanel } from './panels/files';
import { InterpreterPanel } from './panels/interpreter';
import { OpencodePanel } from './panels/opencode';
import { PreviewPanel } from './panels/preview';
import { TerminalPanel } from './panels/terminal';
import { WatchPanel } from './panels/watch';
import { SlidesMode } from './slides';

import type { LucideProps } from 'lucide-react';

interface PanelDefinition {
	id: string;
	label: string;
	icon: ComponentType<LucideProps>;
	component: () => ReactNode;
}

const PANELS: PanelDefinition[] = [
	{ id: 'commands', label: 'Execute', icon: Play, component: CommandsPanel },
	{ id: 'files', label: 'Files', icon: FolderOpen, component: FilesPanel },
	{ id: 'interpreter', label: 'Code', icon: Code, component: InterpreterPanel },
	{ id: 'ai', label: 'AI Exec', icon: Sparkles, component: AIPanel },
	{ id: 'terminal', label: 'Terminal', icon: TerminalSquare, component: TerminalPanel },
	{ id: 'preview', label: 'Preview', icon: Globe, component: PreviewPanel },
	{ id: 'watch', label: 'Watch', icon: Eye, component: WatchPanel },
	{ id: 'opencode', label: 'OpenCode', icon: MonitorCog, component: OpencodePanel },
	{ id: 'backup', label: 'Backup', icon: Archive, component: BackupPanel },
	{ id: 'auth', label: 'Auth', icon: KeyRound, component: AuthPanel },
];

function getInitialPanel(): string {
	const hash = globalThis.location.hash.slice(1);
	if (hash && PANELS.some((p) => p.id === hash)) return hash;
	return PANELS[0].id;
}

function isSlidesMode(): boolean {
	return new URLSearchParams(globalThis.location.search).get('mode') === 'slides';
}

export function App() {
	const [slidesMode, setSlidesMode] = useState(isSlidesMode);

	// Listen for popstate (triggered by slides exit)
	useEffect(() => {
		const onPopState = () => setSlidesMode(isSlidesMode());
		globalThis.addEventListener('popstate', onPopState);
		return () => globalThis.removeEventListener('popstate', onPopState);
	}, []);

	if (slidesMode) return <SlidesMode />;

	return <Explorer />;
}

function Explorer() {
	const [activePanel, setActivePanel] = useState(getInitialPanel);
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const [reconnectOpen, setReconnectOpen] = useState(false);
	const sandboxId = useSandboxId();

	useEffect(() => {
		const onHash = () => {
			const hash = globalThis.location.hash.slice(1);
			if (hash && PANELS.some((p) => p.id === hash)) setActivePanel(hash);
		};
		globalThis.addEventListener('hashchange', onHash);
		return () => globalThis.removeEventListener('hashchange', onHash);
	}, []);

	const navigate = useCallback((id: string) => {
		setActivePanel(id);
		globalThis.location.hash = id;
		setSidebarOpen(false);
	}, []);

	const ActiveComponent = PANELS.find((p) => p.id === activePanel)?.component;

	return (
		<div
			className="
				grid h-screen w-screen grid-cols-[1fr] grid-rows-[1fr_40px] overflow-hidden
				md:grid-cols-[240px_1fr]
			"
		>
			{/* Mobile sidebar backdrop */}
			<AnimatePresence>
				{sidebarOpen && (
					<motion.div
						className="
							fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]
							md:hidden
						"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
						onClick={() => setSidebarOpen(false)}
					/>
				)}
			</AnimatePresence>

			{/* Sidebar */}
			<aside
				className={`
					fixed inset-y-0 left-0 z-50 flex w-[240px] flex-col overflow-hidden
					border-r border-cf-border bg-cf-bg-100 transition-transform duration-200
					ease-out
					md:static md:z-auto md:row-span-1 md:translate-x-0 md:transition-none
					${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
				`}
			>
				<div className="flex items-center gap-3 border-b border-cf-border px-5 py-4">
					<svg viewBox="0 0 66 30" fill="currentColor" className="h-3.5 w-auto shrink-0 text-cf-orange">
						<path d="M52.688 13.028c-.22 0-.437.008-.654.015a.3.3 0 0 0-.102.024.37.37 0 0 0-.236.255l-.93 3.249c-.401 1.397-.252 2.687.422 3.634.618.876 1.646 1.39 2.894 1.45l5.045.306a.45.45 0 0 1 .435.41.5.5 0 0 1-.025.223.64.64 0 0 1-.547.426l-5.242.306c-2.848.132-5.912 2.456-6.987 5.29l-.378 1a.28.28 0 0 0 .248.382h18.054a.48.48 0 0 0 .464-.35c.32-1.153.482-2.344.48-3.54 0-7.22-5.79-13.072-12.933-13.072M44.807 29.578l.334-1.175c.402-1.397.253-2.687-.42-3.634-.62-.876-1.647-1.39-2.896-1.45l-23.665-.306a.47.47 0 0 1-.374-.199.5.5 0 0 1-.052-.434.64.64 0 0 1 .552-.426l23.886-.306c2.836-.131 5.9-2.456 6.975-5.29l1.362-3.6a.9.9 0 0 0 .04-.477C48.997 5.259 42.789 0 35.367 0c-6.842 0-12.647 4.462-14.73 10.665a6.92 6.92 0 0 0-4.911-1.374c-3.28.33-5.92 3.002-6.246 6.318a7.2 7.2 0 0 0 .18 2.472C4.3 18.241 0 22.679 0 28.133q0 .74.106 1.453a.46.46 0 0 0 .457.402h43.704a.57.57 0 0 0 .54-.418" />
					</svg>
					<div className="flex flex-col">
						<span
							className="
								text-[9px] font-medium tracking-wider text-cf-text-muted uppercase
							"
						>
							Cloudflare
						</span>
						<span className="text-lg font-medium tracking-tight text-cf-text">Sandbox SDK</span>
					</div>
				</div>

				<nav className="flex-1 overflow-y-auto py-3">
					{PANELS.map((panel, index) => {
						const Icon = panel.icon;
						return (
							<button
								key={panel.id}
								onClick={() => navigate(panel.id)}
								className={`
									relative flex w-full items-center gap-2.5 px-5 py-2.5 text-left text-sm
									transition-colors
									${activePanel === panel.id ? 'font-medium text-cf-orange' : 'text-cf-text-muted hover:bg-cf-bg-300 hover:text-cf-text'}
								`}
							>
								{activePanel === panel.id && (
									<motion.div
										className="
											absolute inset-0 border-l-3 border-l-cf-orange bg-cf-bg-300
										"
										layoutId="sidebar-active"
										transition={{
											type: 'spring',
											stiffness: 380,
											damping: 32,
										}}
									/>
								)}
								<span className="relative z-10 font-mono text-[11px] text-cf-text-subtle">{String(index + 1).padStart(2, '0')}</span>
								<Icon className="relative z-10 size-4 opacity-60" strokeWidth={1.75} />
								<span className="relative z-10">{panel.label}</span>
							</button>
						);
					})}
				</nav>
			</aside>

			{/* Main content */}
			<main className="relative overflow-hidden bg-cf-bg-100">
				{/* Mobile hamburger */}
				<button
					onClick={() => setSidebarOpen((o: boolean) => !o)}
					className="
						absolute top-3 left-3 z-30 flex size-9 items-center justify-center
						rounded-md border border-cf-border bg-cf-bg-200 text-cf-text-muted
						transition-colors
						hover:border-cf-orange hover:text-cf-orange
						md:hidden
					"
					title="Toggle sidebar"
				>
					{sidebarOpen ? <X className="size-4" /> : <Menu className="size-4" />}
				</button>
				<div className="pointer-events-none absolute inset-0 dot-pattern opacity-45" />
				<div
					className="
						absolute inset-0 overflow-x-hidden overflow-y-auto px-4 pt-14
						md:px-9 md:pt-9
					"
				>
					<AnimatePresence mode="wait">
						{ActiveComponent && (
							<motion.div
								key={activePanel}
								initial={{ opacity: 0, y: 12 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: -8 }}
								transition={{
									duration: 0.35,
									ease: [0.16, 1, 0.3, 1],
								}}
								className="mx-auto max-w-[1100px] pb-9"
							>
								<ErrorBoundary key={activePanel} label={PANELS.find((p) => p.id === activePanel)?.label}>
									<ActiveComponent />
								</ErrorBoundary>
							</motion.div>
						)}
					</AnimatePresence>
				</div>
			</main>

			{/* Status bar */}
			<footer
				className="
					col-span-1 flex items-center justify-between border-t border-cf-border
					bg-cf-bg-200 px-5 font-mono text-xs text-cf-text-subtle
					md:col-span-2
				"
			>
				<button
					onClick={() => setReconnectOpen(true)}
					className="
						flex items-center gap-2.5 rounded-md px-1 py-0.5 transition-colors
						hover:text-cf-text
					"
					title={sandboxId ?? 'connecting...'}
				>
					<motion.span
						className="size-1.5 rounded-full bg-cf-success"
						animate={{
							boxShadow: [
								'0 0 0 0 oklch(from #16a34a l c h / 35%)',
								'0 0 0 4px oklch(from #16a34a l c h / 0%)',
								'0 0 0 0 oklch(from #16a34a l c h / 35%)',
							],
						}}
						transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
					/>
					sandbox ready
				</button>

				<div className="flex items-center gap-3">
					<a
						href="https://github.com/TimoWilhelm/hello-sandbox"
						target="_blank"
						rel="noopener noreferrer"
						className="
							flex items-center gap-1.5 rounded-md border border-cf-border px-2 py-0.5
							font-sans text-[11px] font-medium text-cf-text-subtle transition-colors
							hover:border-cf-orange hover:text-cf-orange
						"
						title="View on GitHub"
					>
						<Github className="size-3" />
					</a>
					<button
						onClick={() => {
							const url = new URL(globalThis.location.href);
							url.searchParams.set('mode', 'slides');
							url.searchParams.set('slide', '1');
							globalThis.location.href = url.toString();
						}}
						className="
							hidden cursor-pointer items-center gap-1.5 rounded-md border
							border-cf-border px-2 py-0.5 font-sans text-[11px] font-medium
							text-cf-text-subtle transition-colors
							hover:border-cf-orange hover:text-cf-orange
							md:flex
						"
						title="Enter presentation mode"
					>
						<Presentation className="size-3" />
						Slides
					</button>
				</div>
			</footer>
			<ReconnectModal open={reconnectOpen} sandboxId={sandboxId} onClose={() => setReconnectOpen(false)} />
		</div>
	);
}
