import type { UseDictateRuntimeResult } from "@/mainview/state/useDictateRuntime";
import type {
	CudaGraphsStatus,
	InferenceEngine,
	ModelCatalogItem,
	ModelId,
} from "@/shared/models";
import type { AppSnapshot, JobStatus } from "@/shared/rpc";

export type MainSection = "overview" | "history" | "models" | "settings";
export type EngineStatusKind = "ready" | "starting" | "warning" | "error";
export type ModelDisplayStatus =
	| "not_installed"
	| "queued"
	| "downloading"
	| "loading"
	| "switching"
	| "deleting"
	| "installed"
	| "error";

export type ModelProgressEntry = NonNullable<
	AppSnapshot["modelProgressById"][ModelId]
>;

export interface EngineIndicator {
	kind: EngineStatusKind;
	label: string;
	detail: string;
}

export interface OverviewMessages {
	warnings: string[];
	tips: string[];
}

export interface DashboardViewModel {
	showCudaInstaller: boolean;
	isCudaRuntimePending: boolean;
	isInstallingCuda: boolean;
	selectedModel: ModelCatalogItem | null;
	selectedModelRuntime: AppSnapshot["modelRuntimeById"][ModelId] | null;
	selectedModelProgress: ModelProgressEntry | null;
	selectedModelStatus: ModelDisplayStatus | null;
	selectedModelProgressLabel: string;
	engineIndicator: EngineIndicator;
	overviewMessages: OverviewMessages;
	hotkeyLabel: string;
}

export function pillLabel(state: AppSnapshot["pill"]["state"]): string {
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

export function modelStatusLabel(
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

export function modelStatusClass(status: ModelDisplayStatus): string {
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

export function hardwareSupportLabel(
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

export function modelRuntimeLabel(runtime: "cpu" | "nvidia_gpu"): string {
	return runtime === "nvidia_gpu" ? "CUDA GPU" : "CPU";
}

export function accelerationModeLabel(mode: "auto" | "cpu" | "cuda"): string {
	switch (mode) {
		case "cuda":
			return "CUDA";
		case "cpu":
			return "CPU";
		default:
			return "Auto";
	}
}

export function engineLabel(engine: InferenceEngine): string {
	switch (engine) {
		case "tensorrt":
			return "TensorRT";
		case "moonshine":
			return "Moonshine";
		default:
			return "PyTorch";
	}
}

export function cudaGraphsLabel(status: CudaGraphsStatus): string {
	switch (status) {
		case "enabled":
			return "Enabled";
		case "disabled":
			return "Disabled";
		default:
			return "N/A";
	}
}

export function warmupStateLabel(
	state: AppSnapshot["warmup"]["state"],
): string {
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

export function formatTimestamp(iso: string): string {
	const time = new Date(iso);
	if (Number.isNaN(time.getTime())) {
		return iso;
	}
	return time.toLocaleString();
}

export function formatBytes(bytes: number | null | undefined): string | null {
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

export function formatHotkeyLabel(hotkey: string): string {
	return hotkey
		.replace(/CommandOrControl/g, "Ctrl")
		.replace(/Control/g, "Ctrl")
		.replace(/Command/g, "Cmd")
		.replace(/\+/g, " + ")
		.replace(/\s+/g, " ")
		.trim();
}

export function jobStatusLabel(status: JobStatus): string {
	switch (status) {
		case "pasted":
			return "Success";
		case "failed":
			return "Failure";
		case "recording":
			return "Recording";
		case "transcribing":
			return "Transcribing";
		default:
			return "Created";
	}
}

export function jobStatusClass(status: JobStatus): string {
	switch (status) {
		case "pasted":
			return "success";
		case "failed":
			return "failure";
		case "recording":
		case "transcribing":
			return "pending";
		default:
			return "created";
	}
}

export function resolveModelDisplayStatus(args: {
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

export function formatModelProgressLabel(args: {
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

export function deriveEngineIndicator(args: {
	snapshot: AppSnapshot;
	selectedModel: ModelCatalogItem | null;
	selectedModelStatus: ModelDisplayStatus | null;
	isSelectingModelId: ModelId | null;
	isPreparingModelId: ModelId | null;
	isDeletingModelId: ModelId | null;
}): EngineIndicator {
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

export function buildOverviewMessages(args: {
	snapshot: AppSnapshot;
	settings: AppSnapshot["settings"];
	selectedModel: ModelCatalogItem | null;
	selectedModelStatus: ModelDisplayStatus | null;
	selectedModelRuntime: AppSnapshot["modelRuntimeById"][ModelId] | null;
}): OverviewMessages {
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
				"Parakeet and Canary improve accuracy but use more GPU memory than Moonshine models.",
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

export function buildDashboardViewModel(args: {
	runtime: UseDictateRuntimeResult;
	snapshot: AppSnapshot;
	settings: AppSnapshot["settings"];
}): DashboardViewModel {
	const { runtime, snapshot, settings } = args;
	const showCudaInstaller =
		settings.accelerationMode === "cuda" &&
		snapshot.hardware.asrRuntime === "cpu";
	const isCudaRuntimePending =
		settings.accelerationMode === "cuda" &&
		snapshot.hardware.asrRuntime === "unknown";
	const isInstallingCuda =
		snapshot.accelerationInstaller.status === "installing" &&
		snapshot.accelerationInstaller.mode === "cuda";
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

	return {
		showCudaInstaller,
		isCudaRuntimePending,
		isInstallingCuda,
		selectedModel,
		selectedModelRuntime,
		selectedModelProgress,
		selectedModelStatus,
		selectedModelProgressLabel,
		engineIndicator: deriveEngineIndicator({
			snapshot,
			selectedModel,
			selectedModelStatus,
			isSelectingModelId: runtime.isSelectingModelId,
			isPreparingModelId: runtime.isPreparingModelId,
			isDeletingModelId: runtime.isDeletingModelId,
		}),
		overviewMessages: buildOverviewMessages({
			snapshot,
			settings,
			selectedModel,
			selectedModelStatus,
			selectedModelRuntime,
		}),
		hotkeyLabel: formatHotkeyLabel(settings.hotkey),
	};
}
