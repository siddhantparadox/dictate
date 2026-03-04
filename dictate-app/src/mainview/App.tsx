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
import type { ModelId } from "@/shared/models";

type MainSection = "overview" | "history" | "models" | "settings";

function statusLabel(
	status: "ready" | "starting" | "stopped" | "error",
): string {
	switch (status) {
		case "ready":
			return "Ready";
		case "starting":
			return "Starting";
		case "error":
			return "Error";
		default:
			return "Stopped";
	}
}

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
	status: "not_installed" | "downloading" | "deleting" | "installed" | "error",
): string {
	switch (status) {
		case "downloading":
			return "Downloading";
		case "deleting":
			return "Removing";
		case "installed":
			return "Installed";
		case "error":
			return "Download failed";
		default:
			return "Not installed";
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
	const sidecar = snapshot.sidecarStatus;
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
						<div className={`status-pill ${sidecar}`}>
							{statusLabel(sidecar)}
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
											const isDownloading =
												model.status === "downloading" ||
												runtime.isPreparingModelId === model.id;
											const isDeleting =
												model.status === "deleting" ||
												runtime.isDeletingModelId === model.id;
											const isBusy = isDownloading || isDeleting;
											const modelProgress =
												snapshot.modelProgressById[model.id];
											const progressPercent =
												typeof modelProgress?.progress === "number"
													? Math.round(modelProgress.progress * 100)
													: null;
											const progressDownloaded = formatBytes(
												modelProgress?.downloadedBytes,
											);
											const progressTotal = formatBytes(
												modelProgress?.totalBytes,
											);
											const progressMessage = isDeleting
												? "Removing model files..."
												: modelProgress?.message ||
													"Downloading and loading model...";
											const progressLabel = isDeleting
												? progressMessage
												: progressPercent !== null &&
														progressDownloaded &&
														progressTotal
													? `${progressMessage} ${progressPercent}% (${progressDownloaded} / ${progressTotal})`
													: progressPercent !== null
														? `${progressMessage} ${progressPercent}%`
														: progressMessage;
											const isConfirmingDelete =
												confirmDeleteModelId === model.id;
											const effectiveStatus = isDeleting
												? "deleting"
												: isDownloading
													? "downloading"
													: model.status;
											const canDownload =
												!isUnsupported &&
												!isBusy &&
												model.status !== "installed" &&
												runtime.isPreparingModelId === null &&
												runtime.isDeletingModelId === null;
											const canActivate =
												!isUnsupported &&
												model.status === "installed" &&
												!isActive &&
												!isDeleting &&
												runtime.isPreparingModelId === null &&
												runtime.isDeletingModelId === null;
											const canDelete =
												model.status === "installed" &&
												!isDeleting &&
												runtime.isPreparingModelId === null &&
												runtime.isDeletingModelId === null;

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
															<span
																className={`model-badge ${effectiveStatus}`}
															>
																{modelStatusLabel(effectiveStatus)}
															</span>
															<button
																type="button"
																className="quiet-button"
																disabled={!canDownload}
																onClick={() =>
																	void runtime.downloadModel(model.id)
																}
															>
																{isDownloading ? (
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
																{isActive ? "Active" : "Use"}
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
																		progressPercent === null
																			? "indeterminate"
																			: "determinate"
																	}`}
																	style={
																		progressPercent === null
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
