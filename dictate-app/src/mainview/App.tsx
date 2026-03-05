import {
	Boxes,
	Loader2,
	Mic,
	Minus,
	Moon,
	ReceiptText,
	Settings2,
	Sparkles,
	Square,
	SquareStack,
	Sun,
	SunMoon,
	X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { ToastBanner } from "@/mainview/components/ToastBanner";
import { rpcClient } from "@/mainview/rpc-client";
import { useDictateRuntime } from "@/mainview/state/useDictateRuntime";
import {
	applyThemePreference,
	getThemePreference,
	type ThemePreference,
} from "@/mainview/theme";
import type {
	CudaGraphsStatus,
	InferenceEngine,
	ModelCatalogItem,
	ModelId,
} from "@/shared/models";
import type { AppSnapshot } from "@/shared/rpc";

type MainSection = "overview" | "history" | "models" | "settings";
type EngineStatusKind = "ready" | "starting" | "warning" | "error";
type ModelDisplayStatus =
	| "not_installed"
	| "queued"
	| "downloading"
	| "loading"
	| "switching"
	| "deleting"
	| "installed"
	| "error";

type ModelProgressEntry = NonNullable<
	AppSnapshot["modelProgressById"][ModelId]
>;

function pillLabel(
	state: "hidden" | "recording" | "transcribing" | "success" | "failure",
): string {
	switch (state) {
		case "recording":
			return "Listening";
		case "transcribing":
			return "Transcribing";
		case "success":
			return "Pasted";
		case "failure":
			return "Failed";
		default:
			return "Idle";
	}
}

function modelStatusLabel(
	status: ModelDisplayStatus,
	isActive: boolean,
): string {
	switch (status) {
		case "queued":
			return "Queued";
		case "downloading":
			return "Downloading";
		case "loading":
			return "Loading";
		case "switching":
			return "Switching";
		case "deleting":
			return "Removing";
		case "installed":
			return isActive ? "Active" : "Installed";
		case "error":
			return "Download failed";
		default:
			return "Not installed";
	}
}

function modelStatusClass(status: ModelDisplayStatus): string {
	switch (status) {
		case "queued":
		case "downloading":
			return "downloading";
		case "loading":
		case "switching":
			return "loading";
		case "deleting":
			return "deleting";
		case "installed":
			return "installed";
		case "error":
			return "error";
		default:
			return "not_installed";
	}
}

function hardwareSupportLabel(
	status: "ready" | "works_slow" | "unsupported" | undefined,
): string {
	switch (status) {
		case "ready":
			return "Ready";
		case "unsupported":
			return "Not supported";
		default:
			return "Works but slower";
	}
}

function modelRuntimeLabel(runtime: "cpu" | "nvidia_gpu"): string {
	return runtime === "nvidia_gpu" ? "CUDA GPU" : "CPU";
}

function accelerationModeLabel(mode: "auto" | "cpu" | "cuda"): string {
	switch (mode) {
		case "cuda":
			return "CUDA";
		case "cpu":
			return "CPU";
		default:
			return "Auto";
	}
}

function engineLabel(engine: InferenceEngine): string {
	switch (engine) {
		case "tensorrt":
			return "TensorRT";
		case "moonshine":
			return "Moonshine";
		default:
			return "PyTorch";
	}
}

function cudaGraphsLabel(status: CudaGraphsStatus): string {
	switch (status) {
		case "enabled":
			return "Enabled";
		case "disabled":
			return "Disabled";
		default:
			return "N/A";
	}
}

function warmupStateLabel(state: AppSnapshot["warmup"]["state"]): string {
	switch (state) {
		case "loading_runtime":
			return "Loading runtime";
		case "loading_model":
			return "Loading model";
		case "warming_up":
			return "Warming up";
		case "ready":
			return "Ready";
		case "error":
			return "Warm-up error";
		default:
			return "Idle";
	}
}

function formatTimestamp(iso: string): string {
	const time = new Date(iso);
	if (Number.isNaN(time.getTime())) {
		return iso;
	}
	return time.toLocaleString();
}

function formatBytes(bytes: number | null | undefined): string | null {
	if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) {
		return null;
	}
	if (bytes < 1024) {
		return `${bytes} B`;
	}

	const units = ["KB", "MB", "GB", "TB"] as const;
	let value = bytes / 1024;
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}
	const decimals = value >= 100 ? 0 : value >= 10 ? 1 : 2;
	return `${value.toFixed(decimals)} ${units[unitIndex]}`;
}

function resolveModelDisplayStatus(args: {
	model: ModelCatalogItem;
	progressEntry: ModelProgressEntry | null;
	isPreparing: boolean;
	isDeleting: boolean;
	isSwitching: boolean;
}): ModelDisplayStatus {
	if (args.isDeleting) {
		return "deleting";
	}
	if (args.isSwitching) {
		return "switching";
	}
	if (args.isPreparing || args.model.status === "downloading") {
		switch (args.progressEntry?.stage) {
			case "queued":
				return "queued";
			case "loading":
				return "loading";
			default:
				return "downloading";
		}
	}
	if (args.model.status === "deleting") {
		return "deleting";
	}
	if (args.model.status === "installed") {
		return "installed";
	}
	if (args.model.status === "error") {
		return "error";
	}
	return "not_installed";
}

function formatModelProgressLabel(args: {
	status: ModelDisplayStatus;
	progressEntry: ModelProgressEntry | null;
}): string {
	if (args.status === "deleting") {
		return "Removing model files...";
	}
	if (args.status === "switching") {
		return "Switching active model...";
	}
	if (
		args.status === "queued" ||
		args.status === "downloading" ||
		args.status === "loading"
	) {
		const message =
			args.progressEntry?.message ||
			(args.status === "queued"
				? "Queued for preparation..."
				: args.status === "loading"
					? "Loading model runtime..."
					: "Downloading model files...");
		const progressPercent =
			typeof args.progressEntry?.progress === "number"
				? Math.round(args.progressEntry.progress * 100)
				: null;
		const downloaded = formatBytes(args.progressEntry?.downloadedBytes);
		const total = formatBytes(args.progressEntry?.totalBytes);
		if (
			progressPercent !== null &&
			typeof downloaded === "string" &&
			typeof total === "string"
		) {
			return `${message} ${progressPercent}% (${downloaded} / ${total})`;
		}
		if (progressPercent !== null) {
			return `${message} ${progressPercent}%`;
		}
		return message;
	}
	return "";
}

function deriveEngineIndicator(args: {
	snapshot: AppSnapshot;
	selectedModel: ModelCatalogItem | null;
	selectedModelStatus: ModelDisplayStatus | null;
	isSelectingModelId: ModelId | null;
	isPreparingModelId: ModelId | null;
	isDeletingModelId: ModelId | null;
}): { kind: EngineStatusKind; label: string; detail: string } {
	const { snapshot, selectedModelStatus, selectedModel } = args;

	if (snapshot.accelerationInstaller.status === "installing") {
		return {
			kind: "starting",
			label: "Installing runtime",
			detail:
				snapshot.accelerationInstaller.message ||
				"Setting up acceleration runtime.",
		};
	}
	if (args.isSelectingModelId) {
		return {
			kind: "starting",
			label: "Switching model",
			detail: "Applying selected model for the next dictation.",
		};
	}
	if (args.isDeletingModelId) {
		return {
			kind: "warning",
			label: "Deleting model",
			detail: "Removing model files from local disk.",
		};
	}
	if (args.isPreparingModelId) {
		return {
			kind: "starting",
			label: "Preparing model",
			detail: "Downloading and loading selected model.",
		};
	}

	switch (snapshot.pill.state) {
		case "recording":
			return {
				kind: "ready",
				label: "Listening",
				detail: "Capturing microphone audio while hotkey is held.",
			};
		case "transcribing":
			return {
				kind: "starting",
				label: "Transcribing",
				detail: "Converting captured audio to text.",
			};
		case "failure":
			return {
				kind: "error",
				label: "Transcription failed",
				detail: "Last dictation failed. Try again.",
			};
		default:
			break;
	}

	if (snapshot.sidecarStatus === "error") {
		return {
			kind: "error",
			label: "Runtime error",
			detail: "Speech runtime is unavailable right now.",
		};
	}
	if (snapshot.sidecarStatus === "starting") {
		return {
			kind: "starting",
			label: "Starting runtime",
			detail: "Initializing speech runtime.",
		};
	}
	if (snapshot.sidecarStatus === "stopped") {
		return {
			kind: "warning",
			label: "Runtime idle",
			detail: "Runtime will start on next dictation.",
		};
	}
	if (!selectedModel) {
		return {
			kind: "warning",
			label: "No model",
			detail: "Select a model to start dictation.",
		};
	}
	if (
		selectedModelStatus === "not_installed" ||
		selectedModelStatus === "error"
	) {
		return {
			kind: "warning",
			label: "Model not ready",
			detail: `${selectedModel.label} needs preparation.`,
		};
	}
	if (
		selectedModelStatus === "queued" ||
		selectedModelStatus === "downloading" ||
		selectedModelStatus === "loading" ||
		selectedModelStatus === "switching"
	) {
		return {
			kind: "starting",
			label: "Model preparing",
			detail: `${selectedModel.label} is being prepared.`,
		};
	}

	const warmup = snapshot.warmup;
	if (warmup.modelId === selectedModel.id) {
		if (warmup.state === "loading_runtime") {
			return {
				kind: "starting",
				label: "Loading runtime",
				detail: warmup.detail,
			};
		}
		if (warmup.state === "loading_model") {
			return {
				kind: "starting",
				label: "Loading model",
				detail: warmup.detail,
			};
		}
		if (warmup.state === "warming_up") {
			return {
				kind: "starting",
				label: "Warming up",
				detail: warmup.detail,
			};
		}
		if (warmup.state === "error") {
			return {
				kind: "warning",
				label: "Warm-up issue",
				detail: warmup.detail,
			};
		}
	}

	return {
		kind: "ready",
		label: "Ready",
		detail:
			warmup.modelId === selectedModel.id && warmup.state === "ready"
				? warmup.detail
				: `${selectedModel.label} is ready for dictation.`,
	};
}

function buildOverviewMessages(args: {
	snapshot: AppSnapshot;
	settings: AppSnapshot["settings"];
	selectedModel: ModelCatalogItem | null;
	selectedModelStatus: ModelDisplayStatus | null;
	selectedModelRuntime: AppSnapshot["modelRuntimeById"][ModelId] | null;
}): { warnings: string[]; tips: string[] } {
	const warnings: string[] = [];
	const tips: string[] = [
		"First dictation after app launch can be slower while the model runtime warms.",
		"Hold Ctrl + Shift only while speaking, then release to transcribe immediately.",
		"Model files stay on disk after download, so later sessions avoid re-download delays.",
	];

	if (args.snapshot.sidecarStatus === "error") {
		warnings.push(
			"Speech runtime is in an error state. Restart Dictate if this persists.",
		);
	}
	if (
		args.settings.accelerationMode === "cuda" &&
		args.snapshot.hardware.asrRuntime !== "cuda"
	) {
		warnings.push(
			"CUDA is selected, but the active runtime is not CUDA yet. Transcription may be slower until CUDA is active.",
		);
	}
	if (!args.selectedModel) {
		warnings.push("No default model is selected. Choose a model in Models.");
	} else {
		if (args.selectedModel.hardwareSupport === "unsupported") {
			warnings.push(
				args.selectedModel.hardwareReason ||
					"Selected model is not supported on this hardware.",
			);
		}
		if (
			args.selectedModelStatus === "not_installed" ||
			args.selectedModelStatus === "error"
		) {
			warnings.push(
				`${args.selectedModel.label} is not ready yet. Download or retry preparation in Models.`,
			);
		}
		if (
			args.selectedModelStatus === "queued" ||
			args.selectedModelStatus === "downloading" ||
			args.selectedModelStatus === "loading" ||
			args.selectedModelStatus === "switching"
		) {
			warnings.push(
				`${args.selectedModel.label} is still preparing. First-use latency will be higher until ready.`,
			);
		}

		if (args.selectedModelRuntime?.status === "fallback") {
			warnings.push(args.selectedModelRuntime.detail);
		}

		if (args.snapshot.warmup.modelId === args.selectedModel.id) {
			if (args.snapshot.warmup.state === "error") {
				warnings.push(args.snapshot.warmup.detail);
			}
			if (
				args.snapshot.warmup.state === "loading_runtime" ||
				args.snapshot.warmup.state === "loading_model" ||
				args.snapshot.warmup.state === "warming_up"
			) {
				warnings.push(
					`${warmupStateLabel(args.snapshot.warmup.state)}: ${args.snapshot.warmup.detail}`,
				);
			}
		}

		if (args.selectedModel.id === "UsefulSensors/moonshine-streaming-tiny") {
			tips.push(
				"Moonshine Tiny is fastest and lightest, with lower accuracy than larger models.",
			);
		} else if (
			args.selectedModel.id === "nvidia/parakeet-tdt-0.6b-v3" ||
			args.selectedModel.id === "nvidia/canary-qwen-2.5b"
		) {
			tips.push(
				"Parakeet/Canary improve accuracy but use more GPU memory than Moonshine models.",
			);
		}

		if (
			args.selectedModelRuntime?.strictTensorRtWhenSupported &&
			!args.selectedModelRuntime.tensorRtSupported
		) {
			tips.push(
				"TensorRT policy is enabled globally, but this model currently runs on PyTorch in this build.",
			);
		}
	}

	if (args.snapshot.pill.state === "failure") {
		warnings.push(
			"Last transcription failed. Try speaking closer to the microphone.",
		);
	}

	return { warnings, tips };
}
function App() {
	const runtime = useDictateRuntime();
	const [themePreference, setThemePreference] = useState<ThemePreference>(
		getThemePreference(),
	);
	const [activeSection, setActiveSection] = useState<MainSection>("overview");
	const [isWindowMaximized, setIsWindowMaximized] = useState(false);
	const [confirmDeleteModelId, setConfirmDeleteModelId] =
		useState<ModelId | null>(null);

	useEffect(() => {
		let active = true;
		void rpcClient.windowControl("getState").then((state) => {
			if (active) {
				setIsWindowMaximized(state.maximized);
			}
		});
		return () => {
			active = false;
		};
	}, []);

	useEffect(() => {
		if (!confirmDeleteModelId) {
			return;
		}

		const model = runtime.models.find(
			(candidate) => candidate.id === confirmDeleteModelId,
		);
		if (!model || model.status !== "installed") {
			setConfirmDeleteModelId(null);
		}
	}, [confirmDeleteModelId, runtime.models]);

	if (runtime.isLoading || !runtime.settings || !runtime.snapshot) {
		return (
			<div className="workspace-root">
				<div className="workspace-frame loading-panel">
					<div className="loading-chip">
						<Loader2 className="h-4 w-4 animate-spin" />
						<span>Starting Dictate...</span>
					</div>
					{runtime.runtimeError.message ? (
						<p className="panel-note">
							Retrying: {runtime.runtimeError.message}
						</p>
					) : null}
				</div>
			</div>
		);
	}

	const settings = runtime.settings;
	const snapshot = runtime.snapshot;
	const accelerationInstaller = snapshot.accelerationInstaller;
	const showCudaInstaller =
		settings.accelerationMode === "cuda" &&
		snapshot.hardware.asrRuntime === "cpu";
	const isCudaRuntimePending =
		settings.accelerationMode === "cuda" &&
		snapshot.hardware.asrRuntime === "unknown";
	const isInstallingCuda =
		accelerationInstaller.status === "installing" &&
		accelerationInstaller.mode === "cuda";
	const selectedModel =
		runtime.models.find((model) => model.id === settings.defaultModelId) ??
		null;
	const selectedModelRuntime = selectedModel
		? (snapshot.modelRuntimeById[selectedModel.id] ?? null)
		: null;
	const selectedModelProgress = selectedModel
		? (snapshot.modelProgressById[selectedModel.id] ?? null)
		: null;
	const selectedModelStatus = selectedModel
		? resolveModelDisplayStatus({
				model: selectedModel,
				progressEntry: selectedModelProgress,
				isPreparing: runtime.isPreparingModelId === selectedModel.id,
				isDeleting: runtime.isDeletingModelId === selectedModel.id,
				isSwitching: runtime.isSelectingModelId === selectedModel.id,
			})
		: null;
	const selectedModelProgressLabel = selectedModelStatus
		? formatModelProgressLabel({
				status: selectedModelStatus,
				progressEntry: selectedModelProgress,
			})
		: "";
	const engineIndicator = deriveEngineIndicator({
		snapshot,
		selectedModel,
		selectedModelStatus,
		isSelectingModelId: runtime.isSelectingModelId,
		isPreparingModelId: runtime.isPreparingModelId,
		isDeletingModelId: runtime.isDeletingModelId,
	});
	const overviewMessages = buildOverviewMessages({
		snapshot,
		settings,
		selectedModel,
		selectedModelStatus,
		selectedModelRuntime,
	});
	const toastToRender =
		runtime.latestToast &&
		(runtime.latestToast.type === "error" ||
			runtime.latestToast.type === "warning")
			? runtime.latestToast
			: null;

	return (
		<div className="workspace-root">
			<main className="workspace-frame page-enter">
				<header className="window-strip">
					<div className="window-drag-area electrobun-webkit-app-region-drag">
						<span className="window-title">Dictate</span>
					</div>
					<div className="window-actions no-drag">
						<div className={`status-pill ${engineIndicator.kind}`}>
							{engineIndicator.label}
						</div>
						<button
							type="button"
							className="window-btn"
							aria-label="Minimize"
							onClick={() => {
								void rpcClient.windowControl("minimize");
							}}
						>
							<Minus className="h-3.5 w-3.5" />
						</button>
						<button
							type="button"
							className="window-btn"
							aria-label={isWindowMaximized ? "Restore down" : "Maximize"}
							onClick={() => {
								void rpcClient.windowControl("toggleMaximize").then((state) => {
									setIsWindowMaximized(state.maximized);
								});
							}}
						>
							{isWindowMaximized ? (
								<SquareStack className="h-3.5 w-3.5" />
							) : (
								<Square className="h-3.5 w-3.5" />
							)}
						</button>
						<button
							type="button"
							className="window-btn danger"
							aria-label="Close"
							onClick={() => {
								void rpcClient.windowControl("close");
							}}
						>
							<X className="h-3.5 w-3.5" />
						</button>
					</div>
				</header>

				<div className="workspace-layout">
					<aside className="sidebar no-drag">
						<div className="brand-row">
							<div className="brand-icon">
								<Mic className="h-4 w-4" />
							</div>
							<div>
								<p className="brand-title">Dictate</p>
								<p className="brand-subtitle">Minimal voice typing</p>
							</div>
						</div>

						<nav className="sidebar-nav">
							<button
								type="button"
								className={activeSection === "overview" ? "active" : undefined}
								onClick={() => setActiveSection("overview")}
							>
								<Sparkles className="h-4 w-4" />
								<span>Overview</span>
							</button>
							<button
								type="button"
								className={activeSection === "history" ? "active" : undefined}
								onClick={() => setActiveSection("history")}
							>
								<ReceiptText className="h-4 w-4" />
								<span>History</span>
							</button>
							<button
								type="button"
								className={activeSection === "models" ? "active" : undefined}
								onClick={() => setActiveSection("models")}
							>
								<Boxes className="h-4 w-4" />
								<span>Models</span>
							</button>
							<button
								type="button"
								className={activeSection === "settings" ? "active" : undefined}
								onClick={() => setActiveSection("settings")}
							>
								<Settings2 className="h-4 w-4" />
								<span>Settings</span>
							</button>
						</nav>

						<div className="sidebar-group">
							<p className="sidebar-label">Appearance</p>
							<div className="segmented-control">
								{(
									[
										{ value: "light", label: "Light", icon: Sun },
										{ value: "system", label: "System", icon: SunMoon },
										{ value: "dark", label: "Dark", icon: Moon },
									] as const
								).map((option) => {
									const Icon = option.icon;
									return (
										<button
											type="button"
											key={option.value}
											className={
												themePreference === option.value ? "active" : undefined
											}
											onClick={() => {
												setThemePreference(option.value);
												applyThemePreference(option.value);
											}}
										>
											<Icon className="h-4 w-4" />
											<span>{option.label}</span>
										</button>
									);
								})}
							</div>
						</div>

						<div className="sidebar-group compact">
							<p className="sidebar-label">Shortcut</p>
							<p className="sidebar-value">
								<kbd>Ctrl</kbd> + <kbd>Shift</kbd>
							</p>
						</div>
					</aside>

					<section className="content-panel no-drag">
						{activeSection === "overview" ? (
							<div className="content-stack">
								<section className="hero-card">
									<h1>
										Hold <kbd>Ctrl</kbd> + <kbd>Shift</kbd>, speak, release, and
										keep typing.
									</h1>
									<p>
										Audio captures while held, then transcribes and pastes into
										the active text box.
									</p>
									<div className="hero-actions">
										<button
											type="button"
											className="cta-button"
											disabled={runtime.isDictating}
											onClick={() => void runtime.startDictation()}
										>
											{runtime.isDictating ? (
												<Loader2 className="h-4 w-4 animate-spin" />
											) : (
												<Mic className="h-4 w-4" />
											)}
											<span>
												{runtime.isDictating
													? "Listening..."
													: "Start Dictation"}
											</span>
										</button>
										<div className={`pill-state ${snapshot.pill.state}`}>
											{pillLabel(snapshot.pill.state)}
										</div>
									</div>
								</section>

								<section className="info-card">
									<p className="sidebar-label">Engine Status</p>
									<div className="engine-status-row">
										<span className={`status-pill ${engineIndicator.kind}`}>
											{engineIndicator.label}
										</span>
										<p className="engine-status-detail">
											{engineIndicator.detail}
										</p>
									</div>
									{selectedModel ? (
										<>
											<p className="history-model">
												Model {selectedModel.label} •{" "}
												{modelStatusLabel(
													selectedModelStatus ?? "not_installed",
													true,
												)}
												{selectedModelProgressLabel
													? ` • ${selectedModelProgressLabel}`
													: ""}
											</p>
											{selectedModelRuntime ? (
												<p className="history-model">
													Engine{" "}
													{engineLabel(selectedModelRuntime.activeEngine)} •
													Quantization {selectedModelRuntime.quantizationLabel}{" "}
													• CUDA Graphs{" "}
													{cudaGraphsLabel(selectedModelRuntime.cudaGraphs)}
												</p>
											) : null}
											<p className="history-model">
												Warm-up {warmupStateLabel(snapshot.warmup.state)} •{" "}
												{snapshot.warmup.detail}
											</p>
										</>
									) : null}
								</section>

								<section className="info-card">
									<p className="sidebar-label">Warnings & Tips</p>
									<div className="overview-messages-block">
										<p className="overview-message-heading">Warnings</p>
										{overviewMessages.warnings.length > 0 ? (
											<ul className="overview-message-list warnings">
												{overviewMessages.warnings.map((message) => (
													<li key={message}>{message}</li>
												))}
											</ul>
										) : (
											<p className="overview-message-clear">
												No active warnings.
											</p>
										)}
									</div>
									<div className="overview-messages-block">
										<p className="overview-message-heading">Tips</p>
										<ul className="overview-message-list tips">
											{overviewMessages.tips.map((message) => (
												<li key={message}>{message}</li>
											))}
										</ul>
									</div>
								</section>

								<section className="info-card">
									<p className="sidebar-label">Latest Successful Transcript</p>
									<p className="transcript-line">
										{runtime.lastTranscript || "No transcript yet."}
									</p>
								</section>

								<section className="info-card">
									<p className="sidebar-label">Hardware</p>
									<p className="transcript-line">
										{snapshot.hardware.cpuModel} • {snapshot.hardware.cpuCores}{" "}
										cores
									</p>
									<p className="history-model">
										RAM {snapshot.hardware.totalRamGb} GB •{" "}
										{snapshot.hardware.gpuName
											? `${snapshot.hardware.gpuName}${
													snapshot.hardware.gpuVramGb
														? ` (${snapshot.hardware.gpuVramGb} GB VRAM)`
														: ""
												}`
											: "No dedicated GPU detected"}{" "}
										• ASR runtime {snapshot.hardware.asrRuntime.toUpperCase()}
									</p>
								</section>
							</div>
						) : null}

						{activeSection === "history" ? (
							<div className="content-stack">
								<section className="info-card history-card">
									<p className="sidebar-label">Transcription History</p>
									{snapshot.recentJobs.length === 0 ? (
										<p className="history-empty">No history yet.</p>
									) : (
										<ul className="history-list">
											{snapshot.recentJobs.map((job) => (
												<li key={job.id} className="history-item">
													<div className="history-top">
														<span className={`history-badge ${job.status}`}>
															{job.status}
														</span>
														<span className="history-time">
															{formatTimestamp(job.updatedAt)}
														</span>
													</div>
													<p className="history-model">{job.modelId}</p>
													<p className="history-text">
														{job.transcript.trim().length > 0
															? job.transcript
															: job.detail}
													</p>
												</li>
											))}
										</ul>
									)}
								</section>
							</div>
						) : null}

						{activeSection === "models" ? (
							<div className="content-stack models-stack">
								<section className="info-card model-library-card">
									<p className="sidebar-label">Available Models</p>
									<ul className="model-list">
										{runtime.models.map((model) => {
											const isActive = model.id === settings.defaultModelId;
											const isUnsupported =
												model.hardwareSupport === "unsupported";
											const isPreparing =
												runtime.isPreparingModelId === model.id;
											const isDeleting = runtime.isDeletingModelId === model.id;
											const isSwitching =
												runtime.isSelectingModelId === model.id;
											const modelProgress =
												snapshot.modelProgressById[model.id] ?? null;
											const runtimeProfile =
												snapshot.modelRuntimeById[model.id] ?? null;
											const displayStatus = resolveModelDisplayStatus({
												model,
												progressEntry: modelProgress,
												isPreparing,
												isDeleting,
												isSwitching,
											});
											const isBusy =
												displayStatus === "queued" ||
												displayStatus === "downloading" ||
												displayStatus === "loading" ||
												displayStatus === "switching" ||
												displayStatus === "deleting";
											const progressPercent =
												typeof modelProgress?.progress === "number"
													? Math.round(modelProgress.progress * 100)
													: null;
											const progressLabel = formatModelProgressLabel({
												status: displayStatus,
												progressEntry: modelProgress,
											});
											const isConfirmingDelete =
												confirmDeleteModelId === model.id;
											const canDownload =
												!isUnsupported &&
												!isBusy &&
												displayStatus !== "installed" &&
												runtime.isPreparingModelId === null &&
												runtime.isDeletingModelId === null &&
												runtime.isSelectingModelId === null;
											const canActivate =
												!isUnsupported &&
												displayStatus === "installed" &&
												!isActive &&
												runtime.isPreparingModelId === null &&
												runtime.isDeletingModelId === null &&
												runtime.isSelectingModelId === null;
											const canDelete =
												displayStatus === "installed" &&
												!isDeleting &&
												runtime.isPreparingModelId === null &&
												runtime.isDeletingModelId === null &&
												runtime.isSelectingModelId === null;

											return (
												<li
													key={model.id}
													className={`model-item ${isActive ? "active" : ""}`}
												>
													<div className="model-main">
														<div className="model-copy">
															<p className="model-title">{model.label}</p>
															<p className="model-subtitle">
																{model.sizeLabel} • {model.languageLabel} •{" "}
																{modelRuntimeLabel(model.runtime)}
															</p>
															<p className="model-notes">{model.notes}</p>
															{runtimeProfile ? (
																<p className="model-hint">
																	Engine{" "}
																	{engineLabel(runtimeProfile.activeEngine)} •
																	Quantization{" "}
																	{runtimeProfile.quantizationLabel} • CUDA
																	Graphs{" "}
																	{cudaGraphsLabel(runtimeProfile.cudaGraphs)}
																</p>
															) : null}
															{runtimeProfile?.detail ? (
																<p className="model-hint">
																	{runtimeProfile.detail}
																</p>
															) : null}
															{model.hardwareReason ? (
																<p className="model-hint">
																	{model.hardwareReason}
																</p>
															) : null}
														</div>
														<div className="model-actions">
															<span
																className={`model-badge support ${
																	model.hardwareSupport ?? "works_slow"
																}`}
															>
																{hardwareSupportLabel(model.hardwareSupport)}
															</span>
															{runtimeProfile ? (
																<span
																	className={`model-badge engine ${runtimeProfile.activeEngine} ${runtimeProfile.status}`}
																>
																	{engineLabel(runtimeProfile.activeEngine)}
																</span>
															) : null}
															<span
																className={`model-badge ${modelStatusClass(displayStatus)}`}
															>
																{modelStatusLabel(displayStatus, isActive)}
															</span>
															<button
																type="button"
																className="quiet-button"
																disabled={!canDownload}
																onClick={() =>
																	void runtime.downloadModel(model.id)
																}
															>
																{displayStatus === "queued" ||
																displayStatus === "downloading" ||
																displayStatus === "loading" ? (
																	<>
																		<Loader2 className="h-4 w-4 animate-spin" />
																		<span>Preparing</span>
																	</>
																) : model.status === "error" ? (
																	"Retry"
																) : (
																	"Download"
																)}
															</button>
															<button
																type="button"
																className="quiet-button"
																disabled={!canActivate}
																onClick={() =>
																	void runtime.selectModel(model.id)
																}
															>
																{displayStatus === "switching" ? (
																	<>
																		<Loader2 className="h-4 w-4 animate-spin" />
																		<span>Switching</span>
																	</>
																) : isActive ? (
																	"Active"
																) : (
																	"Use"
																)}
															</button>
															<button
																type="button"
																className="quiet-button destructive"
																disabled={!canDelete}
																onClick={() =>
																	setConfirmDeleteModelId(model.id)
																}
															>
																Delete
															</button>
														</div>
													</div>
													{isConfirmingDelete ? (
														<div
															className="model-delete-confirm"
															role="alert"
															aria-live="polite"
														>
															<p className="model-delete-copy">
																Delete model files from disk?
															</p>
															<div className="model-delete-actions">
																<button
																	type="button"
																	className="quiet-button destructive"
																	disabled={isDeleting}
																	onClick={() => {
																		setConfirmDeleteModelId(null);
																		void runtime.deleteModel(model.id);
																	}}
																>
																	Confirm delete
																</button>
																<button
																	type="button"
																	className="quiet-button"
																	disabled={isDeleting}
																	onClick={() => setConfirmDeleteModelId(null)}
																>
																	Cancel
																</button>
															</div>
														</div>
													) : null}
													{isBusy ? (
														<div
															className="model-progress-row"
															aria-live="polite"
														>
															<div className="model-progress">
																<div
																	className={`model-progress-bar ${
																		progressPercent === null ||
																		displayStatus === "switching" ||
																		displayStatus === "deleting"
																			? "indeterminate"
																			: "determinate"
																	}`}
																	style={
																		progressPercent === null ||
																		displayStatus === "switching" ||
																		displayStatus === "deleting"
																			? undefined
																			: {
																					width: `${Math.max(progressPercent, 4)}%`,
																				}
																	}
																/>
															</div>
															<p className="model-progress-label">
																{progressLabel}
															</p>
														</div>
													) : null}
												</li>
											);
										})}
									</ul>
								</section>
							</div>
						) : null}

						{activeSection === "settings" ? (
							<div className="content-stack">
								<section className="info-card">
									<p className="sidebar-label">Behavior</p>
									<div className="settings-group">
										<p className="sidebar-label">ASR Acceleration</p>
										<div className="segmented-control runtime-control">
											{(
												[
													{ value: "auto", label: "Auto" },
													{ value: "cpu", label: "CPU" },
													{ value: "cuda", label: "CUDA" },
												] as const
											).map((option) => (
												<button
													type="button"
													key={option.value}
													className={
														settings.accelerationMode === option.value
															? "active"
															: undefined
													}
													disabled={runtime.isUpdatingSettings}
													onClick={() =>
														void runtime.updateSetting({
															accelerationMode: option.value,
														})
													}
												>
													<span>{option.label}</span>
												</button>
											))}
										</div>
										<p className="panel-note">
											Mode {accelerationModeLabel(settings.accelerationMode)} •
											Active runtime{" "}
											{snapshot.hardware.asrRuntime.toUpperCase()}
										</p>
										{settings.accelerationMode === "cuda" &&
										snapshot.hardware.asrRuntime !== "cuda" ? (
											<div className="runtime-install-block">
												<p className="panel-note warning">
													{isCudaRuntimePending
														? "CUDA mode requested. Verifying runtime..."
														: "CUDA mode requested, but CUDA runtime is not active."}
												</p>
												{showCudaInstaller ? (
													<button
														type="button"
														className="quiet-button runtime-install-button"
														disabled={isInstallingCuda}
														onClick={() =>
															void runtime.installAccelerationRuntime("cuda")
														}
													>
														{isInstallingCuda ? (
															<>
																<Loader2 className="h-4 w-4 animate-spin" />
																<span>Installing CUDA runtime</span>
															</>
														) : (
															"Install NVIDIA Acceleration"
														)}
													</button>
												) : null}
												{isInstallingCuda ? (
													<div
														className="model-progress-row"
														aria-live="polite"
													>
														<div className="model-progress">
															<div className="model-progress-bar indeterminate" />
														</div>
														<p className="model-progress-label">
															Installing runtime and dependencies...
														</p>
													</div>
												) : null}
												{accelerationInstaller.message ? (
													<p
														className={`panel-note ${
															accelerationInstaller.status === "error"
																? "warning"
																: ""
														}`}
													>
														{accelerationInstaller.message}
													</p>
												) : isCudaRuntimePending ? (
													<p className="panel-note">
														Keeping CUDA selected while runtime verification
														completes.
													</p>
												) : (
													<p className="panel-note">
														No terminal needed. Install directly here.
													</p>
												)}
											</div>
										) : null}
									</div>
									<label className="switch-row" htmlFor="auto-paste-toggle">
										<span>Auto-paste transcription</span>
										<input
											id="auto-paste-toggle"
											type="checkbox"
											checked={settings.autoPasteEnabled}
											onChange={(event) =>
												void runtime.updateSetting({
													autoPasteEnabled: event.target.checked,
												})
											}
										/>
									</label>
									<label className="switch-row" htmlFor="launch-toggle">
										<span>Launch on startup</span>
										<input
											id="launch-toggle"
											type="checkbox"
											checked={settings.launchOnStartup}
											onChange={(event) =>
												void runtime.updateSetting({
													launchOnStartup: event.target.checked,
												})
											}
										/>
									</label>
								</section>
							</div>
						) : null}
					</section>
				</div>
			</main>

			{toastToRender ? <ToastBanner toast={toastToRender} /> : null}
		</div>
	);
}

export default App;
