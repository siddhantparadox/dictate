import type {
	CudaGraphsStatus,
	InferenceEngine,
	ModelCatalogItem,
	ModelId,
} from "./models";

type NoParams = Record<string, never>;
type RequestSpec = { params: unknown; response: unknown };

export type RPCSchema<
	T extends {
		requests: Record<string, RequestSpec>;
		messages: Record<string, unknown>;
	},
> = T;

export type RecordingPillState =
	| "hidden"
	| "recording"
	| "transcribing"
	| "success"
	| "failure";

export type JobStatus =
	| "created"
	| "recording"
	| "transcribing"
	| "pasted"
	| "failed";

export interface DictateSettings {
	hotkey: string;
	defaultModelId: ModelId;
	accelerationMode: "auto" | "cpu" | "cuda";
	autoPasteEnabled: boolean;
	pasteRetryCount: number;
	debugLogging: boolean;
	launchOnStartup: boolean;
}

export interface JobRecord {
	id: string;
	status: JobStatus;
	modelId: ModelId;
	createdAt: string;
	updatedAt: string;
	detail: string;
	transcript: string;
}

export interface ModelRuntimeProfile {
	targetEngine: InferenceEngine;
	activeEngine: InferenceEngine;
	status: "ready" | "fallback" | "unsupported";
	tensorRtSupported: boolean;
	strictTensorRtWhenSupported: boolean;
	quantizationLabel: string;
	cudaGraphs: CudaGraphsStatus;
	detail: string;
}

export interface ModelWarmupState {
	state:
		| "idle"
		| "loading_runtime"
		| "loading_model"
		| "warming_up"
		| "ready"
		| "error";
	modelId: ModelId | null;
	detail: string;
	updatedAt: string;
}

export interface AppSnapshot {
	pillState: RecordingPillState;
	pill: {
		state: RecordingPillState;
		durationMs: number;
		visible: boolean;
	};
	settings: DictateSettings;
	models: ModelCatalogItem[];
	modelRuntimeById: Partial<Record<ModelId, ModelRuntimeProfile>>;
	warmup: ModelWarmupState;
	hardware: {
		platform: "win32" | "darwin" | "linux" | "unknown";
		cpuModel: string;
		cpuCores: number;
		totalRamGb: number;
		gpuVendor: "nvidia" | "amd" | "intel" | "unknown" | "none";
		gpuName: string | null;
		gpuVramGb: number | null;
		cudaAvailable: boolean;
		asrRuntime: "cuda" | "cpu" | "unknown";
	};
	accelerationInstaller: {
		status: "idle" | "installing" | "success" | "error";
		mode: "cuda" | null;
		message: string;
		updatedAt: string;
	};
	modelProgressById: Partial<
		Record<
			ModelId,
			{
				operation: "download";
				stage: "queued" | "downloading" | "loading" | "installed" | "error";
				message: string;
				progress: number | null;
				downloadedBytes: number | null;
				totalBytes: number | null;
				updatedAt: string;
			}
		>
	>;
	sidecarStatus: "ready" | "starting" | "stopped" | "error";
	lastJob: JobRecord | null;
	recentJobs: JobRecord[];
}

export interface PillFramePayload {
	state: RecordingPillState;
	visible: boolean;
	durationMs: number;
	level: number;
	atMs: number;
}

export interface PasteOutcome {
	status: "success" | "failure";
	reason?: string;
	preservedInClipboard: boolean;
}

export interface TranscriptionResult {
	job: JobRecord;
	transcript: string;
	paste: PasteOutcome;
	latencyMs: number;
}

export interface ToastPayload {
	type: "success" | "info" | "warning" | "error";
	title: string;
	message: string;
}

export interface PrepareModelResult {
	modelId: ModelId;
	status: "installed";
	latencyMs: number;
}

export interface DeleteModelResult {
	modelId: ModelId;
	status: "deleted";
	latencyMs: number;
	removedPaths: string[];
}

export interface InstallAccelerationResult {
	mode: "cuda";
	status: "installed";
	pythonBin: string;
	runtime: "cuda" | "cpu" | "unknown";
}

export type DictateRPC = {
	bun: RPCSchema<{
		requests: {
			getSnapshot: {
				params: NoParams;
				response: AppSnapshot;
			};
			updateSettings: {
				params: Partial<DictateSettings>;
				response: DictateSettings;
			};
			setDefaultModel: {
				params: { modelId: ModelId };
				response: AppSnapshot;
			};
			runMicrophoneTranscription: {
				params: { durationSeconds?: number };
				response: TranscriptionResult;
			};
			prepareModel: {
				params: { modelId: ModelId };
				response: PrepareModelResult;
			};
			deleteModel: {
				params: { modelId: ModelId };
				response: DeleteModelResult;
			};
			installAccelerationRuntime: {
				params: { mode: "cuda" };
				response: InstallAccelerationResult;
			};
			windowControl: {
				params: {
					action: "minimize" | "toggleMaximize" | "close" | "getState";
				};
				response: { maximized: boolean };
			};
		};
		messages: {
			logClientEvent: { message: string };
		};
	}>;
	webview: RPCSchema<{
		requests: {
			healthCheck: { params: NoParams; response: { ok: true; at: string } };
		};
		messages: {
			snapshotUpdated: AppSnapshot;
			pillFrameUpdated: PillFramePayload;
			toast: ToastPayload;
		};
	}>;
};
