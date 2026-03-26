import { Loader2, Moon, Sun, SunMoon } from "lucide-react";
import type { UseDictateRuntimeResult } from "@/mainview/state/useDictateRuntime";
import type { ThemePreference } from "@/mainview/theme";
import type { AppSnapshot } from "@/shared/rpc";
import type { DashboardViewModel } from "./view-model";
import { accelerationModeLabel, engineLabel } from "./view-model";

interface SettingsSectionProps {
	runtime: Pick<
		UseDictateRuntimeResult,
		"isUpdatingSettings" | "updateSetting" | "installAccelerationRuntime"
	>;
	snapshot: AppSnapshot;
	settings: AppSnapshot["settings"];
	viewModel: DashboardViewModel;
	themePreference: ThemePreference;
	onThemePreferenceChange: (preference: ThemePreference) => void;
}

export function SettingsSection({
	runtime,
	snapshot,
	settings,
	viewModel,
	themePreference,
	onThemePreferenceChange,
}: SettingsSectionProps) {
	const {
		selectedCloudModel,
		selectedModelLabel,
		selectedModelProviderLabel,
		selectedModelReady,
		selectedModelRuntime,
		showCudaInstaller,
		isCudaRuntimePending,
		isInstallingCuda,
		hotkeyLabel,
	} = viewModel;
	const accelerationInstaller = snapshot.accelerationInstaller;

	return (
		<div className="content-stack settings-screen">
			<section className="settings-block">
				<div className="settings-section-head">
					<h2 className="settings-section-title">General preferences</h2>
					<div className="settings-section-rule" />
				</div>
				<div className="settings-panel">
					<label className="settings-row" htmlFor="launch-toggle">
						<div className="settings-copy">
							<span className="settings-title">Launch on startup</span>
							<span className="settings-detail">
								Start Dictate when you sign in.
							</span>
						</div>
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

					<label className="settings-row" htmlFor="auto-paste-toggle">
						<div className="settings-copy">
							<span className="settings-title">Paste into active input</span>
							<span className="settings-detail">
								Automatically place final text at the cursor position.
							</span>
						</div>
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

					<label className="settings-row" htmlFor="debug-toggle">
						<div className="settings-copy">
							<span className="settings-title">Debug logging</span>
							<span className="settings-detail">
								Keep technical diagnostics available while tuning the app.
							</span>
						</div>
						<input
							id="debug-toggle"
							type="checkbox"
							checked={settings.debugLogging}
							onChange={(event) =>
								void runtime.updateSetting({
									debugLogging: event.target.checked,
								})
							}
						/>
					</label>
				</div>
			</section>

			<section className="settings-block">
				<div className="settings-section-head">
					<h2 className="settings-section-title">Runtime configuration</h2>
					<div className="settings-section-rule" />
				</div>

				<div className="settings-runtime-grid">
					<div className="settings-panel">
						<div className="settings-row segmented first">
							<div className="settings-copy">
								<span className="settings-title">Acceleration mode</span>
								<span className="settings-detail">
									Auto keeps the best available runtime without making the UI
									feel technical.
								</span>
							</div>
							<div className="segmented-control runtime-control">
								{(
									[
										{ value: "auto", label: "Auto" },
										{ value: "cpu", label: "CPU" },
										{ value: "cuda", label: "GPU" },
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
						</div>

						<div className="settings-row readonly">
							<div className="settings-copy">
								<span className="settings-title">Active runtime</span>
								<span className="settings-detail">
									Mode {accelerationModeLabel(settings.accelerationMode)} •
									Runtime {snapshot.hardware.asrRuntime.toUpperCase()}
								</span>
							</div>
							<span className="settings-value">
								{selectedCloudModel
									? `${selectedModelProviderLabel ?? "Groq"} Cloud`
									: selectedModelRuntime
										? `${engineLabel(selectedModelRuntime.activeEngine)} • ${selectedModelRuntime.quantizationLabel}`
										: snapshot.hardware.asrRuntime.toUpperCase()}
							</span>
						</div>

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
											"Install NVIDIA acceleration"
										)}
									</button>
								) : null}
								{isInstallingCuda ? (
									<div className="model-progress-row inline" aria-live="polite">
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
											accelerationInstaller.status === "error" ? "warning" : ""
										}`}
									>
										{accelerationInstaller.message}
									</p>
								) : null}
							</div>
						) : null}
					</div>

					<div className="settings-panel">
						<div className="settings-runtime-summary">
							<div className="settings-runtime-summary-top">
								<div>
									<p className="surface-label">Active model</p>
									<p className="settings-runtime-model">{selectedModelLabel}</p>
								</div>
								<span className="meta-chip active subtle">
									{selectedCloudModel
										? selectedModelReady
											? "Cloud"
											: "Needs setup"
										: selectedModelRuntime
											? "Running"
											: "Idle"}
								</span>
							</div>

							<div className="settings-runtime-metrics">
								<div className="settings-metric-card">
									<p className="surface-label">Engine</p>
									<p className="settings-metric-value">
										{selectedCloudModel
											? `${selectedModelProviderLabel ?? "Groq"} Cloud`
											: selectedModelRuntime
												? engineLabel(selectedModelRuntime.activeEngine)
												: snapshot.hardware.asrRuntime.toUpperCase()}
									</p>
								</div>
								<div className="settings-metric-card">
									<p className="surface-label">Machine</p>
									<p className="settings-metric-value">
										{snapshot.hardware.gpuName || snapshot.hardware.cpuModel}
									</p>
								</div>
							</div>
						</div>
					</div>
				</div>
			</section>

			<section className="settings-block">
				<div className="settings-section-head">
					<h2 className="settings-section-title">Appearance & interaction</h2>
					<div className="settings-section-rule" />
				</div>

				<div className="settings-panel">
					<div className="settings-row segmented first">
						<div className="settings-copy">
							<span className="settings-title">Theme</span>
							<span className="settings-detail">
								Keep both modes restrained and close to the design-folder
								palette.
							</span>
						</div>
						<div className="segmented-control runtime-control">
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
										onClick={() => onThemePreferenceChange(option.value)}
									>
										<Icon className="h-4 w-4" />
										<span>{option.label}</span>
									</button>
								);
							})}
						</div>
					</div>

					<div className="settings-row readonly">
						<div className="settings-copy">
							<span className="settings-title">Global hotkey</span>
							<span className="settings-detail">
								Hold while speaking, then release to transcribe.
							</span>
						</div>
						<span className="settings-value">{hotkeyLabel}</span>
					</div>
				</div>
			</section>
		</div>
	);
}
