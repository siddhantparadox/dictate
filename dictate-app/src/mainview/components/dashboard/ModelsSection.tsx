import { Loader2 } from "lucide-react";
import { type Dispatch, type SetStateAction, useState } from "react";
import { Input } from "@/components/ui/input";
import type { UseDictateRuntimeResult } from "@/mainview/state/useDictateRuntime";
import {
	DEFAULT_GROQ_MODEL_ID,
	GROQ_MODEL_OPTIONS,
	type GroqModelId,
	getModelLabel,
	isGroqModelId,
	type LocalModelId,
} from "@/shared/models";
import type { AppSnapshot } from "@/shared/rpc";
import {
	accelerationModeLabel,
	cudaGraphsLabel,
	engineLabel,
	formatModelProgressLabel,
	formatTimestamp,
	hardwareSupportLabel,
	modelRuntimeLabel,
	modelStatusClass,
	modelStatusLabel,
	resolveModelDisplayStatus,
} from "./view-model";

interface ModelsSectionProps {
	runtime: Pick<
		UseDictateRuntimeResult,
		| "models"
		| "isPreparingModelId"
		| "isDeletingModelId"
		| "isSelectingModelId"
		| "isConfiguringGroq"
		| "isRemovingGroq"
		| "downloadModel"
		| "selectModel"
		| "deleteModel"
		| "configureGroqProvider"
		| "removeGroqProvider"
	>;
	snapshot: AppSnapshot;
	settings: AppSnapshot["settings"];
	selectedModelLabel: string;
	confirmDeleteModelId: LocalModelId | null;
	setConfirmDeleteModelId: Dispatch<SetStateAction<LocalModelId | null>>;
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : "Unknown error.";
}

export function ModelsSection({
	runtime,
	snapshot,
	settings,
	selectedModelLabel,
	confirmDeleteModelId,
	setConfirmDeleteModelId,
}: ModelsSectionProps) {
	const groq = snapshot.cloudProviders.groq;
	const [activeSource, setActiveSource] = useState<"local" | "cloud">(() =>
		isGroqModelId(settings.defaultModelId) ? "cloud" : "local",
	);
	const [groqApiKey, setGroqApiKey] = useState("");
	const [pendingGroqModelId, setPendingGroqModelId] = useState<GroqModelId>(
		groq.selectedModelId ?? DEFAULT_GROQ_MODEL_ID,
	);
	const [showGroqEditor, setShowGroqEditor] = useState(!groq.configured);
	const [groqError, setGroqError] = useState<string | null>(null);

	const handleSaveGroq = async () => {
		setGroqError(null);
		try {
			await runtime.configureGroqProvider(groqApiKey, pendingGroqModelId);
			setGroqApiKey("");
			setShowGroqEditor(false);
			setActiveSource("cloud");
		} catch (error) {
			setGroqError(formatError(error));
		}
	};

	const handleRemoveGroq = async () => {
		setGroqError(null);
		try {
			await runtime.removeGroqProvider();
			setGroqApiKey("");
			setPendingGroqModelId(DEFAULT_GROQ_MODEL_ID);
			setShowGroqEditor(true);
		} catch (error) {
			setGroqError(formatError(error));
		}
	};

	return (
		<div className="content-stack models-screen">
			<div className="section-heading-row compact models-header">
				<div className="models-heading-copy">
					<div className="models-heading-title">
						<h1>Models</h1>
						<span className="section-count">
							{activeSource === "local"
								? `${runtime.models.length} local`
								: "Cloud"}
						</span>
					</div>
					<p className="section-copy compact">
						Choose whether Dictate runs on downloaded local models or a
						connected cloud provider.
					</p>
				</div>
				<div className="model-runtime-strip">
					<span className="meta-chip">
						Mode {accelerationModeLabel(settings.accelerationMode)}
					</span>
					<span className="meta-chip">
						Runtime {snapshot.hardware.asrRuntime.toUpperCase()}
					</span>
					<span className="meta-chip active">Default {selectedModelLabel}</span>
				</div>
			</div>

			<div className="segmented-control model-source-toggle" role="tablist">
				<button
					type="button"
					role="tab"
					className={activeSource === "local" ? "active" : undefined}
					aria-selected={activeSource === "local"}
					onClick={() => setActiveSource("local")}
				>
					Local
				</button>
				<button
					type="button"
					role="tab"
					className={activeSource === "cloud" ? "active" : undefined}
					aria-selected={activeSource === "cloud"}
					onClick={() => setActiveSource("cloud")}
				>
					Cloud
				</button>
			</div>

			{activeSource === "local" ? (
				<section className="models-table-surface">
					<div className="models-table-head" aria-hidden="true">
						<span className="model-head-cell model-name-head">Model name</span>
						<span className="model-head-cell">Size</span>
						<span className="model-head-cell">Runtime fit</span>
						<span className="model-head-cell">Status</span>
						<span className="model-head-cell actions">Actions</span>
					</div>

					<ul className="model-list">
						{runtime.models.map((model) => {
							const isActive = model.id === settings.defaultModelId;
							const isUnsupported = model.hardwareSupport === "unsupported";
							const isPreparing = runtime.isPreparingModelId === model.id;
							const isDeleting = runtime.isDeletingModelId === model.id;
							const isSwitching = runtime.isSelectingModelId === model.id;
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
							const isConfirmingDelete = confirmDeleteModelId === model.id;
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
								<li key={model.id} className="model-row-shell">
									<div
										className={`model-table-row ${isActive ? "active" : ""} ${
											isUnsupported ? "muted" : ""
										}`}
									>
										<div className="model-name-cell">
											<div className="model-token" aria-hidden="true">
												{model.label.charAt(0)}
											</div>
											<div className="model-title-block">
												<div className="model-title-row">
													<p className="model-title">{model.label}</p>
													{isActive ? (
														<span className="meta-chip active subtle">
															Default
														</span>
													) : null}
												</div>
												<p className="model-subtitle">
													{model.languageLabel} •{" "}
													{modelRuntimeLabel(model.runtime)}
												</p>
												<p className="model-notes">{model.notes}</p>
												{runtimeProfile ? (
													<p className="model-hint">
														{engineLabel(runtimeProfile.activeEngine)} •{" "}
														{runtimeProfile.quantizationLabel} • CUDA Graphs{" "}
														{cudaGraphsLabel(runtimeProfile.cudaGraphs)}
													</p>
												) : null}
												{runtimeProfile?.detail ? (
													<p className="model-hint">{runtimeProfile.detail}</p>
												) : null}
												{model.hardwareReason ? (
													<p className="model-hint">{model.hardwareReason}</p>
												) : null}
											</div>
										</div>

										<div className="model-size-cell">{model.sizeLabel}</div>

										<div className="model-fit-cell">
											<span
												className={`model-fit-tag ${model.hardwareSupport ?? "works_slow"}`}
											>
												{hardwareSupportLabel(model.hardwareSupport)}
											</span>
										</div>

										<div className="model-status-cell">
											{isBusy ? (
												<div className="model-progress-inline">
													<div className="model-status-line pending">
														<Loader2 className="h-3.5 w-3.5 animate-spin" />
														<span>
															{modelStatusLabel(displayStatus, isActive)}
														</span>
													</div>
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
											) : (
												<div
													className={`model-status-line ${modelStatusClass(displayStatus)}`}
												>
													<span className="status-dot" aria-hidden="true" />
													<span>
														{modelStatusLabel(displayStatus, isActive)}
													</span>
												</div>
											)}
										</div>

										<div className="model-actions-cell">
											<button
												type="button"
												className="model-action-link primary"
												disabled={!canActivate}
												onClick={() => void runtime.selectModel(model.id)}
											>
												{displayStatus === "switching"
													? "Switching"
													: isActive
														? "Active"
														: "Use"}
											</button>
											<button
												type="button"
												className={`model-action-link ${canDownload ? "download" : ""}`}
												disabled={!canDownload}
												onClick={() => void runtime.downloadModel(model.id)}
											>
												{model.status === "error" ? "Retry" : "Download"}
											</button>
											<button
												type="button"
												className="model-action-link destructive"
												disabled={!canDelete}
												onClick={() => setConfirmDeleteModelId(model.id)}
											>
												Delete
											</button>
										</div>
									</div>

									{isConfirmingDelete ? (
										<div className="model-row-detail">
											<div className="model-delete-confirm" role="alert">
												<p className="model-delete-copy">
													Delete model files from local disk?
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
										</div>
									) : null}
								</li>
							);
						})}
					</ul>
				</section>
			) : (
				<section className="cloud-models-surface">
					<div className="cloud-provider-card">
						<div className="cloud-provider-head">
							<div>
								<p className="section-eyebrow">Provider</p>
								<h2 className="cloud-provider-title">Groq</h2>
								<p className="section-copy compact cloud-provider-copy">
									Bring your own Groq API key to use Whisper cloud models
									without downloading anything locally.
								</p>
							</div>
							<span
								className={`status-pill ${groq.configured ? "ready" : "warning"}`}
							>
								{groq.configured ? "Connected" : "Not connected"}
							</span>
						</div>

						<div className="cloud-provider-meta">
							<div className="cloud-provider-meta-card">
								<p className="surface-label">Saved key</p>
								<p className="cloud-provider-meta-value">
									{groq.maskedApiKey ?? "None"}
								</p>
							</div>
							<div className="cloud-provider-meta-card">
								<p className="surface-label">Selected Groq model</p>
								<p className="cloud-provider-meta-value">
									{groq.selectedModelId
										? getModelLabel(groq.selectedModelId)
										: "Not set"}
								</p>
							</div>
							<div className="cloud-provider-meta-card">
								<p className="surface-label">Last verified</p>
								<p className="cloud-provider-meta-value">
									{groq.lastVerifiedAt
										? formatTimestamp(groq.lastVerifiedAt)
										: "Never"}
								</p>
							</div>
						</div>

						<div className="cloud-provider-actions">
							<button
								type="button"
								className="quiet-button"
								onClick={() => {
									setGroqError(null);
									setPendingGroqModelId(
										groq.selectedModelId ?? DEFAULT_GROQ_MODEL_ID,
									);
									setShowGroqEditor((current) => !current || !groq.configured);
								}}
							>
								{groq.configured ? "Replace key" : "Add API key"}
							</button>
							<button
								type="button"
								className="quiet-button destructive"
								disabled={!groq.configured || runtime.isRemovingGroq}
								onClick={() => void handleRemoveGroq()}
							>
								{runtime.isRemovingGroq ? "Removing..." : "Remove Groq"}
							</button>
						</div>

						{showGroqEditor ? (
							<div className="cloud-provider-editor">
								<div className="cloud-provider-field">
									<label className="surface-label" htmlFor="groq-api-key">
										Groq API key
									</label>
									<Input
										id="groq-api-key"
										type="password"
										autoComplete="off"
										value={groqApiKey}
										placeholder={
											groq.configured
												? "Paste a new key to replace the saved one"
												: "gsk_..."
										}
										onChange={(event) => setGroqApiKey(event.target.value)}
									/>
									<p className="cloud-provider-help">
										The key is stored locally on this device so Dictate can call
										Groq on your behalf.
									</p>
								</div>

								<div className="cloud-provider-field">
									<p className="surface-label">Model to save</p>
									<div className="cloud-save-model-list">
										{GROQ_MODEL_OPTIONS.map((model) => (
											<button
												type="button"
												key={model.id}
												className={`cloud-save-model-button ${
													pendingGroqModelId === model.id ? "active" : ""
												}`}
												onClick={() => setPendingGroqModelId(model.id)}
											>
												<span>{model.id}</span>
												{model.recommended ? (
													<span className="meta-chip active subtle">
														Recommended
													</span>
												) : null}
											</button>
										))}
									</div>
								</div>

								<div className="cloud-provider-save-row">
									<button
										type="button"
										className="quiet-button"
										disabled={
											runtime.isConfiguringGroq ||
											groqApiKey.trim().length === 0
										}
										onClick={() => void handleSaveGroq()}
									>
										{runtime.isConfiguringGroq ? (
											<>
												<Loader2 className="h-4 w-4 animate-spin" />
												<span>Saving Groq</span>
											</>
										) : (
											"Save Groq"
										)}
									</button>
									{groqError ? (
										<p className="panel-note warning cloud-provider-error">
											{groqError}
										</p>
									) : null}
								</div>
							</div>
						) : null}
					</div>

					<div className="cloud-provider-note">
						<p className="surface-label">Privacy</p>
						<p className="cloud-provider-note-copy">
							Audio is sent to Groq for transcription when a Groq model is
							active.
						</p>
					</div>

					<div className="cloud-model-grid">
						{GROQ_MODEL_OPTIONS.map((model) => {
							const isActive = settings.defaultModelId === model.id;
							const isSelectedInSetup = pendingGroqModelId === model.id;
							const canActivate =
								groq.configured &&
								!runtime.isConfiguringGroq &&
								!runtime.isRemovingGroq &&
								runtime.isSelectingModelId === null;

							return (
								<article
									key={model.id}
									className={`cloud-model-card ${
										isActive ? "active" : ""
									} ${isSelectedInSetup ? "selected" : ""}`}
								>
									<div className="cloud-model-head">
										<div>
											<div className="model-title-row">
												<p className="model-title">{model.label}</p>
												{model.recommended ? (
													<span className="meta-chip active subtle">
														Recommended
													</span>
												) : null}
												{isActive ? (
													<span className="meta-chip active">Default</span>
												) : null}
											</div>
											<p className="model-subtitle">
												{model.languageLabel} • {model.pricingLabel}
											</p>
										</div>
										<span className="model-fit-tag ready">Cloud</span>
									</div>

									<p className="model-notes">{model.notes}</p>

									<div className="cloud-model-meta">
										<span className="meta-chip">{model.throughputLabel}</span>
										{model.translationSupported ? (
											<span className="meta-chip">Translation</span>
										) : (
											<span className="meta-chip">Dictation</span>
										)}
									</div>

									<div className="cloud-model-actions">
										<button
											type="button"
											className="model-action-link primary"
											disabled={!canActivate || isActive}
											onClick={() => {
												setGroqError(null);
												setPendingGroqModelId(model.id);
												void runtime.selectModel(model.id).catch((error) => {
													setGroqError(formatError(error));
												});
											}}
										>
											{runtime.isSelectingModelId === model.id
												? "Switching"
												: isActive
													? "Active"
													: "Use this"}
										</button>
										{!groq.configured ? (
											<span className="cloud-model-action-note">
												Save a Groq key first
											</span>
										) : null}
									</div>
								</article>
							);
						})}
					</div>
				</section>
			)}
		</div>
	);
}
