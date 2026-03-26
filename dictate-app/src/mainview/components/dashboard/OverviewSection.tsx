import { FileText, Loader2, Mic } from "lucide-react";
import type { UseDictateRuntimeResult } from "@/mainview/state/useDictateRuntime";
import type { AppSnapshot } from "@/shared/rpc";
import type { DashboardViewModel } from "./view-model";
import {
	accelerationModeLabel,
	engineLabel,
	formatTimestamp,
	modelRuntimeLabel,
	modelStatusClass,
	modelStatusLabel,
	pillLabel,
	warmupStateLabel,
} from "./view-model";

interface OverviewSectionProps {
	runtime: Pick<
		UseDictateRuntimeResult,
		"isDictating" | "lastTranscript" | "startDictation"
	>;
	snapshot: AppSnapshot;
	settings: AppSnapshot["settings"];
	viewModel: DashboardViewModel;
}

const SIGNAL_BARS = [
	{ id: "a", height: 10 },
	{ id: "b", height: 18 },
	{ id: "c", height: 28 },
	{ id: "d", height: 44 },
	{ id: "e", height: 58 },
	{ id: "f", height: 42 },
	{ id: "g", height: 24 },
	{ id: "h", height: 12 },
	{ id: "i", height: 16 },
	{ id: "j", height: 34 },
	{ id: "k", height: 52 },
	{ id: "l", height: 40 },
	{ id: "m", height: 22 },
	{ id: "n", height: 14 },
	{ id: "o", height: 8 },
];

function countWords(text: string): number {
	return text.trim().split(/\s+/).filter(Boolean).length;
}

export function OverviewSection({
	runtime,
	snapshot,
	settings,
	viewModel,
}: OverviewSectionProps) {
	const {
		selectedModel,
		selectedCloudModel,
		selectedModelLabel,
		selectedModelProviderLabel,
		selectedModelReady,
		selectedModelSource,
		selectedModelRuntime,
		selectedModelStatus,
		selectedModelProgressLabel,
		engineIndicator,
		overviewMessages,
		hotkeyLabel,
	} = viewModel;
	const latestJob = snapshot.recentJobs[0] ?? null;
	const latestTranscript =
		runtime.lastTranscript.trim() ||
		latestJob?.transcript.trim() ||
		"No transcript yet.";
	const transcriptWordCount =
		latestTranscript === "No transcript yet."
			? 0
			: countWords(latestTranscript);
	const transcriptCharacterCount =
		latestTranscript === "No transcript yet." ? 0 : latestTranscript.length;
	const transcriptTimestamp = latestJob
		? formatTimestamp(latestJob.updatedAt)
		: engineIndicator.label;
	const summaryRows = [
		{
			label: "Warm-up",
			value: warmupStateLabel(snapshot.warmup.state),
		},
		{
			label: "Runtime",
			value: snapshot.hardware.asrRuntime.toUpperCase(),
		},
		{
			label: "Engine",
			value: selectedCloudModel
				? `${selectedModelProviderLabel ?? "Cloud"} Cloud`
				: selectedModelRuntime
					? engineLabel(selectedModelRuntime.activeEngine)
					: "Unavailable",
		},
		{
			label: "Memory",
			value: `${snapshot.hardware.totalRamGb} GB RAM`,
		},
	];

	return (
		<div className="content-stack overview-screen">
			<div className="overview-layout">
				<div className="overview-main-column">
					<section className="overview-stat-grid" aria-label="Workspace status">
						<article className="overview-stat-card">
							<p className="surface-label">Readiness</p>
							<p className="overview-stat-value">{engineIndicator.label}</p>
							<p className="overview-stat-detail">{engineIndicator.detail}</p>
						</article>
						<article className="overview-stat-card">
							<p className="surface-label">Active model</p>
							<p className="overview-stat-value">{selectedModelLabel}</p>
							<p className="overview-stat-detail">
								{selectedModel
									? `${selectedModel.sizeLabel} • ${modelRuntimeLabel(selectedModel.runtime)}`
									: selectedCloudModel
										? `${selectedModelProviderLabel ?? "Cloud"} • audio sent to provider`
										: "Choose a model in Models."}
							</p>
						</article>
						<article className="overview-stat-card">
							<p className="surface-label">Global hotkey</p>
							<div className="overview-hotkey-row">
								{hotkeyLabel.split(" + ").map((part) => (
									<kbd key={part}>{part}</kbd>
								))}
							</div>
						</article>
						<article className="overview-stat-card">
							<p className="surface-label">Runtime</p>
							<p className="overview-stat-value">
								{selectedCloudModel
									? "Cloud"
									: selectedModelRuntime
										? `${engineLabel(selectedModelRuntime.activeEngine)}`
										: snapshot.hardware.asrRuntime.toUpperCase()}
							</p>
							<p className="overview-stat-detail">
								{selectedCloudModel
									? `${selectedModelProviderLabel ?? "Groq"} transcription`
									: (selectedModelRuntime?.quantizationLabel ??
										"Waiting for model")}
							</p>
						</article>
					</section>

					<section className="transcript-sheet">
						<div className="transcript-sheet-head">
							<div className="sheet-title-row">
								<FileText className="h-4 w-4" />
								<h1>Latest transcript</h1>
							</div>
							<p className="transcript-stamp">{transcriptTimestamp}</p>
						</div>
						<div className="transcript-sheet-body">
							<p className="transcript-featured">{latestTranscript}</p>
						</div>
						<div className="transcript-sheet-foot">
							<div className="transcript-meta">
								<span>{transcriptWordCount} words</span>
								<span>{transcriptCharacterCount} characters</span>
							</div>
						</div>
					</section>

					<section className="quick-test-strip">
						<button
							type="button"
							className="record-test-button"
							disabled={runtime.isDictating || !selectedModelReady}
							onClick={() => void runtime.startDictation()}
						>
							{runtime.isDictating ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<Mic className="h-4 w-4" />
							)}
						</button>
						<div className="quick-test-signal">
							<div className="quick-test-meta-row">
								<p className="surface-label">Input signal</p>
								<p className="quick-test-reading">
									{runtime.isDictating
										? "Live"
										: pillLabel(snapshot.pill.state)}
								</p>
							</div>
							<div className="overview-signal-bars" aria-hidden="true">
								{SIGNAL_BARS.map((bar) => (
									<span
										key={bar.id}
										className="signal-bar"
										style={{ height: `${bar.height}%` }}
									/>
								))}
							</div>
						</div>
						<div className="quick-test-copy">
							<p className="quick-test-title">
								{runtime.isDictating ? "Listening" : "Press to test"}
							</p>
							<p className="quick-test-detail">
								{selectedCloudModel
									? selectedModelReady
										? "Connected"
										: `Connect ${selectedModelProviderLabel ?? "Cloud"}`
									: selectedModelStatus
										? modelStatusLabel(selectedModelStatus, true)
										: "Idle"}
								{selectedModelLabel ? ` • ${selectedModelLabel}` : ""}
							</p>
						</div>
					</section>
				</div>

				<aside className="overview-side-column">
					<section className="overview-summary-card">
						<div className="sheet-title-row compact">
							<h2>System summary</h2>
						</div>
						<div className="overview-summary-list">
							{summaryRows.map((row) => (
								<div key={row.label} className="overview-summary-row">
									<span>{row.label}</span>
									<strong>{row.value}</strong>
								</div>
							))}
						</div>
					</section>

					<section className="overview-note-card">
						<p className="surface-label">
							{overviewMessages.warnings.length > 0 ? "Health" : "Status"}
						</p>
						{overviewMessages.warnings.length > 0 ? (
							<ul className="overview-message-list warnings compact">
								{overviewMessages.warnings.slice(0, 2).map((message) => (
									<li key={message}>{message}</li>
								))}
							</ul>
						) : (
							<p className="overview-message-clear">
								No active warnings. Warm-up and model state look stable.
							</p>
						)}
					</section>

					<section className="overview-tip-card">
						<p className="surface-label">Tip</p>
						<p className="overview-tip-copy">
							{overviewMessages.tips[0] ??
								"Use the global hotkey only while speaking, then release to paste the final text."}
						</p>
						<div className="overview-tip-meta">
							<span>
								Mode {accelerationModeLabel(settings.accelerationMode)}
							</span>
							{selectedCloudModel ? (
								<span
									className={`status-pill ${
										selectedModelReady ? "ready" : "warning"
									}`}
								>
									{selectedModelReady ? "Cloud" : "Connect"}
								</span>
							) : selectedModelStatus ? (
								<span
									className={`status-pill ${modelStatusClass(selectedModelStatus)}`}
								>
									{modelStatusLabel(
										selectedModelStatus,
										selectedModelSource === "local" &&
											settings.defaultModelId === selectedModel?.id,
									)}
								</span>
							) : null}
						</div>
						{selectedModelProgressLabel ? (
							<p className="overview-progress-copy">
								{selectedModelProgressLabel}
							</p>
						) : null}
					</section>
				</aside>
			</div>
		</div>
	);
}
