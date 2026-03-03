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
	status: "not_installed" | "downloading" | "installed" | "error",
): string {
	switch (status) {
		case "downloading":
			return "Downloading";
		case "installed":
			return "Installed";
		case "error":
			return "Download failed";
		default:
			return "Not installed";
	}
}

function formatTimestamp(iso: string): string {
	const time = new Date(iso);
	if (Number.isNaN(time.getTime())) {
		return iso;
	}
	return time.toLocaleString();
}

function App() {
	const runtime = useDictateRuntime();
	const [themePreference, setThemePreference] = useState<ThemePreference>(
		getThemePreference(),
	);
	const [activeSection, setActiveSection] = useState<MainSection>("overview");
	const [isWindowMaximized, setIsWindowMaximized] = useState(false);

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
										Press <kbd>Ctrl</kbd> + <kbd>Shift</kbd>, speak, and
										continue typing.
									</h1>
									<p>
										Audio is transcribed and pasted into the active text box.
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
									<p className="sidebar-label">Latest Transcript</p>
									<p className="transcript-line">
										{runtime.lastTranscript || "No transcript yet."}
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
							<div className="content-stack">
								<section className="info-card">
									<p className="sidebar-label">Available Models</p>
									<ul className="model-list">
										{runtime.models.map((model) => {
											const isActive = model.id === settings.defaultModelId;
											const isDownloading =
												model.status === "downloading" ||
												runtime.isPreparingModelId === model.id;
											const canDownload =
												!isDownloading &&
												model.status !== "installed" &&
												runtime.isPreparingModelId === null;
											const canActivate =
												model.status === "installed" &&
												!isActive &&
												runtime.isPreparingModelId === null;

											return (
												<li
													key={model.id}
													className={`model-item ${isActive ? "active" : ""}`}
												>
													<div className="model-main">
														<div>
															<p className="model-title">{model.label}</p>
															<p className="model-subtitle">
																{model.sizeLabel} • {model.notes}
															</p>
														</div>
														<div className="model-actions">
															<span className={`model-badge ${model.status}`}>
																{modelStatusLabel(
																	isDownloading ? "downloading" : model.status,
																)}
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
																		<span>Downloading</span>
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
														</div>
													</div>
													{isDownloading ? (
														<div className="model-progress" aria-live="polite">
															<div className="model-progress-bar" />
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

			{runtime.latestToast ? <ToastBanner toast={runtime.latestToast} /> : null}
		</div>
	);
}

export default App;
