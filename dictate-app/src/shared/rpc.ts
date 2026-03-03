import type { ModelCatalogItem, ModelId } from "./models";

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

export interface AppSnapshot {
	pillState: RecordingPillState;
	pill: {
		state: RecordingPillState;
		durationMs: number;
		waveformBars: number[];
		visible: boolean;
	};
	settings: DictateSettings;
	models: ModelCatalogItem[];
	sidecarStatus: "ready" | "starting" | "stopped" | "error";
	lastJob: JobRecord | null;
	recentJobs: JobRecord[];
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
			toast: ToastPayload;
		};
	}>;
};
