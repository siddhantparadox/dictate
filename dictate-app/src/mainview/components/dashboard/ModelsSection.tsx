import { Loader2 } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { UseDictateRuntimeResult } from "@/mainview/state/useDictateRuntime";
import type { ModelId } from "@/shared/models";
import type { AppSnapshot } from "@/shared/rpc";
import {
	accelerationModeLabel,
	cudaGraphsLabel,
	engineLabel,
	formatModelProgressLabel,
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
		| "downloadModel"
		| "selectModel"
		| "deleteModel"
	>;
	snapshot: AppSnapshot;
	settings: AppSnapshot["settings"];
	selectedModelLabel: string | null;
	confirmDeleteModelId: ModelId | null;
	setConfirmDeleteModelId: Dispatch<SetStateAction<ModelId | null>>;
}

export function ModelsSection({
	runtime,
	snapshot,
	settings,
	selectedModelLabel,
	confirmDeleteModelId,
	setConfirmDeleteModelId,
}: ModelsSectionProps) {
	return (
		<div className="content-stack models-screen">
			<div className="section-heading-row compact models-header">
				<div className="models-heading-copy">
					<div className="models-heading-title">
						<h1>Models</h1>
						<span className="section-count">
							{runtime.models.length} available
						</span>
					</div>
					<p className="section-copy compact">
						Use the warm paper library layout from the design files and keep the
						scan order strict: model, size, runtime fit, status, actions.
					</p>
				</div>
				<div className="model-runtime-strip">
					<span className="meta-chip">
						Mode {accelerationModeLabel(settings.accelerationMode)}
					</span>
					<span className="meta-chip">
						Runtime {snapshot.hardware.asrRuntime.toUpperCase()}
					</span>
					{selectedModelLabel ? (
						<span className="meta-chip active">
							Default {selectedModelLabel}
						</span>
					) : null}
				</div>
			</div>

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
						const modelProgress = snapshot.modelProgressById[model.id] ?? null;
						const runtimeProfile = snapshot.modelRuntimeById[model.id] ?? null;
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
																: { width: `${Math.max(progressPercent, 4)}%` }
														}
													/>
												</div>
												<p className="model-progress-label">{progressLabel}</p>
											</div>
										) : (
											<div
												className={`model-status-line ${modelStatusClass(displayStatus)}`}
											>
												<span className="status-dot" aria-hidden="true" />
												<span>{modelStatusLabel(displayStatus, isActive)}</span>
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
		</div>
	);
}
