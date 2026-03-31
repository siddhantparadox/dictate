import { Loader2 } from "lucide-react";
import { type Dispatch, type SetStateAction, useState } from "react";
import { Input } from "@/components/ui/input";
import type { UseDictateRuntimeResult } from "@/mainview/state/useDictateRuntime";
import {
	ASSEMBLYAI_MODEL_OPTIONS,
	type AssemblyAIModelId,
	type CloudModelId,
	type CloudProviderId,
	DEEPGRAM_MODEL_OPTIONS,
	DEFAULT_ASSEMBLYAI_MODEL_ID,
	DEFAULT_DEEPGRAM_MODEL_ID,
	DEFAULT_GROQ_MODEL_ID,
	DEFAULT_OPENROUTER_MODEL_ID,
	type DeepgramModelId,
	GROQ_MODEL_OPTIONS,
	type GroqModelId,
	getCloudProviderIdForModel,
	getCloudProviderLabel,
	getModelLabel,
	getModelProviderLabel,
	isCloudModelId,
	type LocalModelId,
	OPENROUTER_MODEL_OPTIONS,
	type OpenRouterModelId,
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
	warmupStateLabel,
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
		| "isConfiguringDeepgram"
		| "isRemovingDeepgram"
		| "isConfiguringAssemblyAI"
		| "isRemovingAssemblyAI"
		| "isConfiguringOpenRouter"
		| "isRemovingOpenRouter"
		| "downloadModel"
		| "selectModel"
		| "deleteModel"
		| "configureGroqProvider"
		| "removeGroqProvider"
		| "configureDeepgramProvider"
		| "removeDeepgramProvider"
		| "configureAssemblyAIProvider"
		| "removeAssemblyAIProvider"
		| "configureOpenRouterProvider"
		| "removeOpenRouterProvider"
	>;
	snapshot: AppSnapshot;
	settings: AppSnapshot["settings"];
	selectedModelLabel: string;
	confirmDeleteModelId: LocalModelId | null;
	setConfirmDeleteModelId: Dispatch<SetStateAction<LocalModelId | null>>;
}

interface ProviderSetupCardProps<TModelId extends CloudModelId> {
	providerLabel: string;
	copy: string;
	configured: boolean;
	maskedApiKey: string | null;
	selectedModelId: TModelId | null;
	lastVerifiedAt: string | null;
	modelOptions: Array<{
		id: TModelId;
		label: string;
		recommended: boolean;
	}>;
	apiKey: string;
	setApiKey: Dispatch<SetStateAction<string>>;
	pendingModelId: TModelId;
	setPendingModelId: Dispatch<SetStateAction<TModelId>>;
	showEditor: boolean;
	setShowEditor: Dispatch<SetStateAction<boolean>>;
	error: string | null;
	setError: Dispatch<SetStateAction<string | null>>;
	isSaving: boolean;
	isRemoving: boolean;
	saveLabel: string;
	removeLabel: string;
	onSelect?: () => void;
	onSave: () => Promise<void>;
	onRemove: () => Promise<void>;
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : "Unknown error.";
}

function ProviderSetupCard<TModelId extends CloudModelId>({
	providerLabel,
	copy,
	configured,
	maskedApiKey,
	selectedModelId,
	lastVerifiedAt,
	modelOptions,
	apiKey,
	setApiKey,
	pendingModelId,
	setPendingModelId,
	showEditor,
	setShowEditor,
	error,
	setError,
	isSaving,
	isRemoving,
	saveLabel,
	removeLabel,
	onSelect,
	onSave,
	onRemove,
}: ProviderSetupCardProps<TModelId>) {
	return (
		<div className="cloud-provider-card">
			<div className="cloud-provider-head">
				<div>
					<p className="section-eyebrow">Provider</p>
					<h2 className="cloud-provider-title">{providerLabel}</h2>
					<p className="section-copy compact cloud-provider-copy">{copy}</p>
				</div>
				<span className={`status-pill ${configured ? "ready" : "warning"}`}>
					{configured ? "Connected" : "Not connected"}
				</span>
			</div>

			<div className="cloud-provider-meta">
				<div className="cloud-provider-meta-card">
					<p className="surface-label">Saved key</p>
					<p className="cloud-provider-meta-value">{maskedApiKey ?? "None"}</p>
				</div>
				<div className="cloud-provider-meta-card">
					<p className="surface-label">Selected model</p>
					<p className="cloud-provider-meta-value">
						{selectedModelId ? getModelLabel(selectedModelId) : "Not set"}
					</p>
				</div>
				<div className="cloud-provider-meta-card">
					<p className="surface-label">Last verified</p>
					<p className="cloud-provider-meta-value">
						{lastVerifiedAt ? formatTimestamp(lastVerifiedAt) : "Never"}
					</p>
				</div>
			</div>

			<div className="cloud-provider-actions">
				<button
					type="button"
					className="quiet-button"
					onClick={() => {
						onSelect?.();
						setError(null);
						setPendingModelId(
							selectedModelId ?? modelOptions[0]?.id ?? pendingModelId,
						);
						setShowEditor((current) => !current || !configured);
					}}
				>
					{configured ? "Replace key" : "Add API key"}
				</button>
				<button
					type="button"
					className="quiet-button destructive"
					disabled={!configured || isRemoving}
					onClick={() => void onRemove()}
				>
					{isRemoving ? "Removing..." : removeLabel}
				</button>
			</div>

			{showEditor ? (
				<div className="cloud-provider-editor">
					<div className="cloud-provider-field">
						<label
							className="surface-label"
							htmlFor={`${providerLabel.toLowerCase()}-api-key`}
						>
							{providerLabel} API key
						</label>
						<Input
							id={`${providerLabel.toLowerCase()}-api-key`}
							type="password"
							autoComplete="off"
							value={apiKey}
							placeholder={
								configured
									? "Paste a new key to replace the saved one"
									: "Paste your API key"
							}
							onChange={(event) => setApiKey(event.target.value)}
						/>
						<p className="cloud-provider-help">
							The key is stored locally on this device so Dictate can call{" "}
							{providerLabel} on your behalf.
						</p>
					</div>

					<div className="cloud-provider-field">
						<p className="surface-label">Model to save</p>
						<div className="cloud-save-model-list">
							{modelOptions.map((model) => (
								<button
									type="button"
									key={model.id}
									className={`cloud-save-model-button ${
										pendingModelId === model.id ? "active" : ""
									}`}
									onClick={() => setPendingModelId(model.id)}
								>
									<span className="cloud-save-model-title">{model.label}</span>
									{model.recommended ? (
										<span className="meta-chip active subtle">Recommended</span>
									) : null}
								</button>
							))}
						</div>
					</div>

					<div className="cloud-provider-save-row">
						<button
							type="button"
							className="quiet-button"
							disabled={isSaving || apiKey.trim().length === 0}
							onClick={() => void onSave()}
						>
							{isSaving ? (
								<>
									<Loader2 className="h-4 w-4 animate-spin" />
									<span>{saveLabel}</span>
								</>
							) : (
								saveLabel
							)}
						</button>
						{error ? (
							<p className="panel-note warning cloud-provider-error">{error}</p>
						) : null}
					</div>
				</div>
			) : null}
		</div>
	);
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
	const deepgram = snapshot.cloudProviders.deepgram;
	const assemblyai = snapshot.cloudProviders.assemblyai;
	const openrouter = snapshot.cloudProviders.openrouter;
	const [activeSource, setActiveSource] = useState<"local" | "cloud">(() =>
		isCloudModelId(settings.defaultModelId) ? "cloud" : "local",
	);
	const [activeCloudProvider, setActiveCloudProvider] =
		useState<CloudProviderId>(() => {
			const defaultProvider = getCloudProviderIdForModel(
				settings.defaultModelId,
			);
			if (defaultProvider) {
				return defaultProvider;
			}
			if (groq.configured) {
				return "groq";
			}
			if (deepgram.configured) {
				return "deepgram";
			}
			if (assemblyai.configured) {
				return "assemblyai";
			}
			if (openrouter.configured) {
				return "openrouter";
			}
			return "groq";
		});

	const [groqApiKey, setGroqApiKey] = useState("");
	const [pendingGroqModelId, setPendingGroqModelId] = useState<GroqModelId>(
		groq.selectedModelId ?? DEFAULT_GROQ_MODEL_ID,
	);
	const [showGroqEditor, setShowGroqEditor] = useState(false);
	const [groqError, setGroqError] = useState<string | null>(null);

	const [deepgramApiKey, setDeepgramApiKey] = useState("");
	const [pendingDeepgramModelId, setPendingDeepgramModelId] =
		useState<DeepgramModelId>(
			deepgram.selectedModelId ?? DEFAULT_DEEPGRAM_MODEL_ID,
		);
	const [showDeepgramEditor, setShowDeepgramEditor] = useState(false);
	const [deepgramError, setDeepgramError] = useState<string | null>(null);

	const [assemblyaiApiKey, setAssemblyAIApiKey] = useState("");
	const [pendingAssemblyAIModelId, setPendingAssemblyAIModelId] =
		useState<AssemblyAIModelId>(
			assemblyai.selectedModelId ?? DEFAULT_ASSEMBLYAI_MODEL_ID,
		);
	const [showAssemblyAIEditor, setShowAssemblyAIEditor] = useState(false);
	const [assemblyaiError, setAssemblyAIError] = useState<string | null>(null);

	const [openRouterApiKey, setOpenRouterApiKey] = useState("");
	const [pendingOpenRouterModelId, setPendingOpenRouterModelId] =
		useState<OpenRouterModelId>(
			openrouter.selectedModelId ?? DEFAULT_OPENROUTER_MODEL_ID,
		);
	const [showOpenRouterEditor, setShowOpenRouterEditor] = useState(false);
	const [openRouterError, setOpenRouterError] = useState<string | null>(null);

	const handleSaveGroq = async () => {
		setGroqError(null);
		try {
			setActiveCloudProvider("groq");
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
			setShowGroqEditor(false);
			setActiveCloudProvider(
				deepgram.configured
					? "deepgram"
					: assemblyai.configured
						? "assemblyai"
						: openrouter.configured
							? "openrouter"
							: "groq",
			);
		} catch (error) {
			setGroqError(formatError(error));
		}
	};

	const handleSaveDeepgram = async () => {
		setDeepgramError(null);
		try {
			setActiveCloudProvider("deepgram");
			await runtime.configureDeepgramProvider(
				deepgramApiKey,
				pendingDeepgramModelId,
			);
			setDeepgramApiKey("");
			setShowDeepgramEditor(false);
			setActiveSource("cloud");
		} catch (error) {
			setDeepgramError(formatError(error));
		}
	};

	const handleRemoveDeepgram = async () => {
		setDeepgramError(null);
		try {
			await runtime.removeDeepgramProvider();
			setDeepgramApiKey("");
			setPendingDeepgramModelId(DEFAULT_DEEPGRAM_MODEL_ID);
			setShowDeepgramEditor(false);
			setActiveCloudProvider(
				groq.configured
					? "groq"
					: assemblyai.configured
						? "assemblyai"
						: openrouter.configured
							? "openrouter"
							: "deepgram",
			);
		} catch (error) {
			setDeepgramError(formatError(error));
		}
	};

	const handleSaveAssemblyAI = async () => {
		setAssemblyAIError(null);
		try {
			setActiveCloudProvider("assemblyai");
			await runtime.configureAssemblyAIProvider(
				assemblyaiApiKey,
				pendingAssemblyAIModelId,
			);
			setAssemblyAIApiKey("");
			setShowAssemblyAIEditor(false);
			setActiveSource("cloud");
		} catch (error) {
			setAssemblyAIError(formatError(error));
		}
	};

	const handleRemoveAssemblyAI = async () => {
		setAssemblyAIError(null);
		try {
			await runtime.removeAssemblyAIProvider();
			setAssemblyAIApiKey("");
			setPendingAssemblyAIModelId(DEFAULT_ASSEMBLYAI_MODEL_ID);
			setShowAssemblyAIEditor(false);
			setActiveCloudProvider(
				groq.configured
					? "groq"
					: deepgram.configured
						? "deepgram"
						: openrouter.configured
							? "openrouter"
							: "assemblyai",
			);
		} catch (error) {
			setAssemblyAIError(formatError(error));
		}
	};

	const handleSaveOpenRouter = async () => {
		setOpenRouterError(null);
		try {
			setActiveCloudProvider("openrouter");
			await runtime.configureOpenRouterProvider(
				openRouterApiKey,
				pendingOpenRouterModelId,
			);
			setOpenRouterApiKey("");
			setShowOpenRouterEditor(false);
			setActiveSource("cloud");
		} catch (error) {
			setOpenRouterError(formatError(error));
		}
	};

	const handleRemoveOpenRouter = async () => {
		setOpenRouterError(null);
		try {
			await runtime.removeOpenRouterProvider();
			setOpenRouterApiKey("");
			setPendingOpenRouterModelId(DEFAULT_OPENROUTER_MODEL_ID);
			setShowOpenRouterEditor(false);
			setActiveCloudProvider(
				groq.configured
					? "groq"
					: deepgram.configured
						? "deepgram"
						: assemblyai.configured
							? "assemblyai"
							: "openrouter",
			);
		} catch (error) {
			setOpenRouterError(formatError(error));
		}
	};

	const connectedProviders = [
		groq.configured,
		deepgram.configured,
		assemblyai.configured,
		openrouter.configured,
	].filter(Boolean).length;
	const visibleCloudModels =
		activeCloudProvider === "groq"
			? GROQ_MODEL_OPTIONS
			: activeCloudProvider === "deepgram"
				? DEEPGRAM_MODEL_OPTIONS
				: activeCloudProvider === "assemblyai"
					? ASSEMBLYAI_MODEL_OPTIONS
					: OPENROUTER_MODEL_OPTIONS;
	const activeCloudProviderLabel = getCloudProviderLabel(activeCloudProvider);
	const getProviderConfigured = (providerId: CloudProviderId): boolean => {
		switch (providerId) {
			case "assemblyai":
				return assemblyai.configured;
			case "deepgram":
				return deepgram.configured;
			case "groq":
				return groq.configured;
			case "openrouter":
				return openrouter.configured;
		}
	};
	const getProviderBusy = (providerId: CloudProviderId): boolean => {
		switch (providerId) {
			case "assemblyai":
				return runtime.isConfiguringAssemblyAI || runtime.isRemovingAssemblyAI;
			case "deepgram":
				return runtime.isConfiguringDeepgram || runtime.isRemovingDeepgram;
			case "groq":
				return runtime.isConfiguringGroq || runtime.isRemovingGroq;
			case "openrouter":
				return runtime.isConfiguringOpenRouter || runtime.isRemovingOpenRouter;
		}
	};
	const isSelectedInProviderSetup = (modelId: CloudModelId): boolean => {
		if (modelId === pendingGroqModelId) {
			return true;
		}
		if (modelId === pendingDeepgramModelId) {
			return true;
		}
		if (modelId === pendingAssemblyAIModelId) {
			return true;
		}
		return modelId === pendingOpenRouterModelId;
	};
	const openProviderEditorForModel = (
		model: (typeof visibleCloudModels)[number],
	) => {
		setActiveCloudProvider(model.provider);
		if (model.provider === "groq") {
			setGroqError(null);
			setPendingGroqModelId(model.id as GroqModelId);
			setShowGroqEditor(true);
			return;
		}
		if (model.provider === "deepgram") {
			setDeepgramError(null);
			setPendingDeepgramModelId(model.id as DeepgramModelId);
			setShowDeepgramEditor(true);
			return;
		}
		if (model.provider === "assemblyai") {
			setAssemblyAIError(null);
			setPendingAssemblyAIModelId(model.id as AssemblyAIModelId);
			setShowAssemblyAIEditor(true);
			return;
		}
		setOpenRouterError(null);
		setPendingOpenRouterModelId(model.id as OpenRouterModelId);
		setShowOpenRouterEditor(true);
	};
	const handleDeleteModel = (modelId: LocalModelId) => {
		void runtime.deleteModel(modelId).finally(() => {
			setConfirmDeleteModelId(null);
		});
	};
	const handleActivateCloudModel = (
		model: (typeof visibleCloudModels)[number],
		providerConfigured: boolean,
	) => {
		setActiveCloudProvider(model.provider);
		if (!providerConfigured) {
			openProviderEditorForModel(model);
			return;
		}

		void runtime.selectModel(model.id).catch((error) => {
			setProviderSelectionError(model.provider, error);
		});
	};
	const setProviderSelectionError = (
		providerId: CloudProviderId,
		error: unknown,
	) => {
		const message = formatError(error);
		if (providerId === "groq") {
			setGroqError(message);
			return;
		}
		if (providerId === "deepgram") {
			setDeepgramError(message);
			return;
		}
		if (providerId === "assemblyai") {
			setAssemblyAIError(message);
			return;
		}
		setOpenRouterError(message);
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
								: `${connectedProviders}/4 connected`}
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
							const isWarmupActive =
								isActive &&
								snapshot.warmup.modelId === model.id &&
								(snapshot.warmup.state === "loading_runtime" ||
									snapshot.warmup.state === "loading_model" ||
									snapshot.warmup.state === "warming_up");
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
								!isWarmupActive && typeof modelProgress?.progress === "number"
									? Math.round(modelProgress.progress * 100)
									: null;
							const progressLabel = isWarmupActive
								? snapshot.warmup.detail
								: formatModelProgressLabel({
										status: displayStatus,
										progressEntry: modelProgress,
									});
							const statusLabel = isWarmupActive
								? warmupStateLabel(snapshot.warmup.state)
								: modelStatusLabel(displayStatus, isActive);
							const isConfirmingDelete = confirmDeleteModelId === model.id;
							const canDownload =
								!isUnsupported &&
								!isBusy &&
								!isWarmupActive &&
								displayStatus !== "installed" &&
								runtime.isPreparingModelId === null &&
								runtime.isDeletingModelId === null &&
								runtime.isSelectingModelId === null;
							const canActivate =
								!isUnsupported &&
								displayStatus === "installed" &&
								!isActive &&
								!isWarmupActive &&
								runtime.isPreparingModelId === null &&
								runtime.isDeletingModelId === null &&
								runtime.isSelectingModelId === null;
							const canDelete =
								displayStatus === "installed" &&
								!isDeleting &&
								!isWarmupActive &&
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
												{isWarmupActive ? (
													<div className="model-progress-row model-inline-warmup">
														<div className="model-status-line pending">
															<Loader2 className="h-3.5 w-3.5 animate-spin" />
															<span>{statusLabel}</span>
														</div>
														<div className="model-progress">
															<div className="model-progress-bar indeterminate" />
														</div>
														<p className="model-progress-label">
															{progressLabel}
														</p>
													</div>
												) : null}
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
											{isWarmupActive ? (
												<div className="model-status-line pending">
													<Loader2 className="h-3.5 w-3.5 animate-spin" />
													<span>{statusLabel}</span>
												</div>
											) : isBusy ? (
												<div className="model-progress-inline">
													<div className="model-status-line pending">
														<Loader2 className="h-3.5 w-3.5 animate-spin" />
														<span>{statusLabel}</span>
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
													<span>{statusLabel}</span>
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
												{isWarmupActive
													? "Warming up"
													: displayStatus === "switching"
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
														onClick={() => handleDeleteModel(model.id)}
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
					<div className="cloud-provider-grid">
						<ProviderSetupCard
							providerLabel="Groq"
							copy="Bring your own Groq API key to use Whisper cloud models without downloading anything locally."
							configured={groq.configured}
							maskedApiKey={groq.maskedApiKey}
							selectedModelId={groq.selectedModelId}
							lastVerifiedAt={groq.lastVerifiedAt}
							modelOptions={GROQ_MODEL_OPTIONS.map((model) => ({
								id: model.id,
								label: model.label,
								recommended: model.recommended,
							}))}
							apiKey={groqApiKey}
							setApiKey={setGroqApiKey}
							pendingModelId={pendingGroqModelId}
							setPendingModelId={setPendingGroqModelId}
							showEditor={showGroqEditor}
							setShowEditor={setShowGroqEditor}
							error={groqError}
							setError={setGroqError}
							isSaving={runtime.isConfiguringGroq}
							isRemoving={runtime.isRemovingGroq}
							saveLabel="Save Groq"
							removeLabel="Remove Groq"
							onSelect={() => setActiveCloudProvider("groq")}
							onSave={handleSaveGroq}
							onRemove={handleRemoveGroq}
						/>

						<ProviderSetupCard
							providerLabel="Deepgram"
							copy="Bring your own Deepgram API key to use Nova cloud transcription with a simple prerecorded dictation flow."
							configured={deepgram.configured}
							maskedApiKey={deepgram.maskedApiKey}
							selectedModelId={deepgram.selectedModelId}
							lastVerifiedAt={deepgram.lastVerifiedAt}
							modelOptions={DEEPGRAM_MODEL_OPTIONS.map((model) => ({
								id: model.id,
								label: model.label,
								recommended: model.recommended,
							}))}
							apiKey={deepgramApiKey}
							setApiKey={setDeepgramApiKey}
							pendingModelId={pendingDeepgramModelId}
							setPendingModelId={setPendingDeepgramModelId}
							showEditor={showDeepgramEditor}
							setShowEditor={setShowDeepgramEditor}
							error={deepgramError}
							setError={setDeepgramError}
							isSaving={runtime.isConfiguringDeepgram}
							isRemoving={runtime.isRemovingDeepgram}
							saveLabel="Save Deepgram"
							removeLabel="Remove Deepgram"
							onSelect={() => setActiveCloudProvider("deepgram")}
							onSave={handleSaveDeepgram}
							onRemove={handleRemoveDeepgram}
						/>

						<ProviderSetupCard
							providerLabel="AssemblyAI"
							copy="Bring your own AssemblyAI API key to use Universal cloud transcription with the same hold-to-talk dictation flow."
							configured={assemblyai.configured}
							maskedApiKey={assemblyai.maskedApiKey}
							selectedModelId={assemblyai.selectedModelId}
							lastVerifiedAt={assemblyai.lastVerifiedAt}
							modelOptions={ASSEMBLYAI_MODEL_OPTIONS.map((model) => ({
								id: model.id,
								label: model.label,
								recommended: model.recommended,
							}))}
							apiKey={assemblyaiApiKey}
							setApiKey={setAssemblyAIApiKey}
							pendingModelId={pendingAssemblyAIModelId}
							setPendingModelId={setPendingAssemblyAIModelId}
							showEditor={showAssemblyAIEditor}
							setShowEditor={setShowAssemblyAIEditor}
							error={assemblyaiError}
							setError={setAssemblyAIError}
							isSaving={runtime.isConfiguringAssemblyAI}
							isRemoving={runtime.isRemovingAssemblyAI}
							saveLabel="Save AssemblyAI"
							removeLabel="Remove AssemblyAI"
							onSelect={() => setActiveCloudProvider("assemblyai")}
							onSave={handleSaveAssemblyAI}
							onRemove={handleRemoveAssemblyAI}
						/>

						<ProviderSetupCard
							providerLabel="OpenRouter"
							copy="Bring your own OpenRouter API key to use Gemini audio transcription through the Nitro route."
							configured={openrouter.configured}
							maskedApiKey={openrouter.maskedApiKey}
							selectedModelId={openrouter.selectedModelId}
							lastVerifiedAt={openrouter.lastVerifiedAt}
							modelOptions={OPENROUTER_MODEL_OPTIONS.map((model) => ({
								id: model.id,
								label: model.label,
								recommended: model.recommended,
							}))}
							apiKey={openRouterApiKey}
							setApiKey={setOpenRouterApiKey}
							pendingModelId={pendingOpenRouterModelId}
							setPendingModelId={setPendingOpenRouterModelId}
							showEditor={showOpenRouterEditor}
							setShowEditor={setShowOpenRouterEditor}
							error={openRouterError}
							setError={setOpenRouterError}
							isSaving={runtime.isConfiguringOpenRouter}
							isRemoving={runtime.isRemovingOpenRouter}
							saveLabel="Save OpenRouter"
							removeLabel="Remove OpenRouter"
							onSelect={() => setActiveCloudProvider("openrouter")}
							onSave={handleSaveOpenRouter}
							onRemove={handleRemoveOpenRouter}
						/>
					</div>

					<div className="cloud-provider-toolbar">
						<div className="cloud-provider-toolbar-copy">
							<p className="surface-label">Model library</p>
							<p className="cloud-provider-toolbar-text">
								Show models for one provider at a time.
							</p>
						</div>
						<div className="segmented-control cloud-provider-toggle">
							<button
								type="button"
								className={
									activeCloudProvider === "groq" ? "active" : undefined
								}
								onClick={() => setActiveCloudProvider("groq")}
							>
								Groq
							</button>
							<button
								type="button"
								className={
									activeCloudProvider === "deepgram" ? "active" : undefined
								}
								onClick={() => setActiveCloudProvider("deepgram")}
							>
								Deepgram
							</button>
							<button
								type="button"
								className={
									activeCloudProvider === "assemblyai" ? "active" : undefined
								}
								onClick={() => setActiveCloudProvider("assemblyai")}
							>
								AssemblyAI
							</button>
							<button
								type="button"
								className={
									activeCloudProvider === "openrouter" ? "active" : undefined
								}
								onClick={() => setActiveCloudProvider("openrouter")}
							>
								OpenRouter
							</button>
						</div>
					</div>

					<div className="cloud-provider-note">
						<p className="surface-label">Privacy</p>
						<p className="cloud-provider-note-copy">
							Audio is sent to the active cloud provider when a cloud model is
							selected. Groq uses Whisper transcription. Deepgram uses Nova
							pre-recorded transcription with language detection. AssemblyAI
							uses async Universal pre-recorded transcription. OpenRouter uses
							Gemini audio input over chat completions.
						</p>
					</div>

					<div className="cloud-model-section-head">
						<div>
							<p className="surface-label">Cloud models</p>
							<p className="cloud-provider-toolbar-text">
								{activeCloudProviderLabel} options for Dictate.
							</p>
						</div>
					</div>

					<div className="cloud-model-grid">
						{visibleCloudModels.map((model) => {
							const providerLabel = getCloudProviderLabel(model.provider);
							const providerConfigured = getProviderConfigured(model.provider);
							const providerBusy = getProviderBusy(model.provider);
							const isActive = settings.defaultModelId === model.id;
							const isSelectedInSetup = isSelectedInProviderSetup(model.id);
							const canActivate =
								providerConfigured &&
								!providerBusy &&
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
												{model.languageLabel} • {model.highlightLabel}
											</p>
										</div>
										<span className="model-fit-tag ready">{providerLabel}</span>
									</div>

									<p className="model-notes">{model.notes}</p>

									<div className="cloud-model-meta">
										{model.metaTags.map((tag) => (
											<span key={tag} className="meta-chip">
												{tag}
											</span>
										))}
									</div>

									<div className="cloud-model-actions">
										<button
											type="button"
											className="model-action-link primary"
											disabled={
												providerConfigured ? !canActivate || isActive : false
											}
											onClick={() =>
												handleActivateCloudModel(model, providerConfigured)
											}
										>
											{providerConfigured
												? runtime.isSelectingModelId === model.id
													? "Switching"
													: isActive
														? "Active"
														: "Use this"
												: `Connect ${providerLabel}`}
										</button>
										<span className="cloud-model-action-note">
											{providerConfigured
												? `${getModelProviderLabel(model.id) ?? providerLabel} ready`
												: `Save a ${providerLabel} key first`}
										</span>
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
