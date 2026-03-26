export type LocalModelId =
	| "nvidia/canary-qwen-2.5b"
	| "nvidia/parakeet-tdt-0.6b-v3"
	| "UsefulSensors/moonshine-streaming-medium"
	| "UsefulSensors/moonshine-streaming-tiny";

export type GroqModelId = "whisper-large-v3" | "whisper-large-v3-turbo";
export type DeepgramModelId = "nova-3" | "nova-2";
export type CloudModelId = GroqModelId | DeepgramModelId;
export type ModelId = LocalModelId | CloudModelId;
export type ModelSource = "local" | "cloud";
export type CloudProviderId = "groq" | "deepgram";

export type CompatibilityTier =
	| "recommended"
	| "available_with_constraints"
	| "not_recommended";

export type ModelRuntime = "cpu" | "nvidia_gpu";
export type InferenceEngine = "tensorrt" | "pytorch" | "moonshine";
export type CudaGraphsStatus = "enabled" | "disabled" | "not_supported";

export type HardwareSupportStatus = "ready" | "works_slow" | "unsupported";

export type ModelInstallStatus =
	| "not_installed"
	| "downloading"
	| "deleting"
	| "installed"
	| "error";

export interface LocalModelCatalogItem {
	id: LocalModelId;
	source: "local";
	label: string;
	sizeLabel: string;
	notes: string;
	languageLabel: string;
	runtime: ModelRuntime;
	minSystemRamGb: number;
	minVramGb?: number;
	compatibility: CompatibilityTier;
	installed: boolean;
	status: ModelInstallStatus;
	hardwareSupport?: HardwareSupportStatus;
	hardwareReason?: string;
	inference: {
		strictTensorRtWhenSupported: boolean;
		tensorRtSupported: boolean;
		defaultEngine: InferenceEngine;
		quantizationLabel: string;
		cudaGraphs: CudaGraphsStatus;
	};
}

interface BaseCloudModelOption<
	TId extends CloudModelId,
	TProvider extends CloudProviderId,
> {
	id: TId;
	source: "cloud";
	provider: TProvider;
	label: string;
	notes: string;
	languageLabel: string;
	highlightLabel: string;
	metaTags: string[];
	recommended: boolean;
}

export type GroqModelOption = BaseCloudModelOption<GroqModelId, "groq">;
export type DeepgramModelOption = BaseCloudModelOption<
	DeepgramModelId,
	"deepgram"
>;
export type CloudModelOption = GroqModelOption | DeepgramModelOption;

export const MODEL_CATALOG: LocalModelCatalogItem[] = [
	{
		id: "nvidia/canary-qwen-2.5b",
		source: "local",
		label: "NVIDIA Canary-Qwen-2.5B",
		sizeLabel: "5.12 GB",
		notes: "High-accuracy English ASR for strong NVIDIA GPUs.",
		languageLabel: "English",
		runtime: "nvidia_gpu",
		minSystemRamGb: 16,
		minVramGb: 12,
		compatibility: "available_with_constraints",
		installed: false,
		status: "not_installed",
		inference: {
			strictTensorRtWhenSupported: true,
			tensorRtSupported: false,
			defaultEngine: "pytorch",
			quantizationLabel: "BF16/FP16",
			cudaGraphs: "disabled",
		},
	},
	{
		id: "nvidia/parakeet-tdt-0.6b-v3",
		source: "local",
		label: "NVIDIA Parakeet-TDT-0.6B-v3",
		sizeLabel: "2.51 GB",
		notes: "Multilingual model with strong accuracy on NVIDIA GPUs.",
		languageLabel: "Multilingual",
		runtime: "nvidia_gpu",
		minSystemRamGb: 8,
		minVramGb: 6,
		compatibility: "available_with_constraints",
		installed: false,
		status: "not_installed",
		inference: {
			strictTensorRtWhenSupported: true,
			tensorRtSupported: false,
			defaultEngine: "pytorch",
			quantizationLabel: "BF16/FP16",
			cudaGraphs: "disabled",
		},
	},
	{
		id: "UsefulSensors/moonshine-streaming-medium",
		source: "local",
		label: "Moonshine Medium Streaming",
		sizeLabel: "1.06 GB",
		notes: "Balanced quality and local runtime footprint.",
		languageLabel: "English",
		runtime: "cpu",
		minSystemRamGb: 8,
		compatibility: "recommended",
		installed: false,
		status: "not_installed",
		inference: {
			strictTensorRtWhenSupported: false,
			tensorRtSupported: false,
			defaultEngine: "moonshine",
			quantizationLabel: "FP16 (runtime default)",
			cudaGraphs: "not_supported",
		},
	},
	{
		id: "UsefulSensors/moonshine-streaming-tiny",
		source: "local",
		label: "Moonshine Tiny Streaming",
		sizeLabel: "176 MB",
		notes: "Fast fallback model for lower-end devices.",
		languageLabel: "English",
		runtime: "cpu",
		minSystemRamGb: 4,
		compatibility: "recommended",
		installed: false,
		status: "not_installed",
		inference: {
			strictTensorRtWhenSupported: false,
			tensorRtSupported: false,
			defaultEngine: "moonshine",
			quantizationLabel: "FP16 (runtime default)",
			cudaGraphs: "not_supported",
		},
	},
];

export const GROQ_MODEL_OPTIONS: GroqModelOption[] = [
	{
		id: "whisper-large-v3-turbo",
		source: "cloud",
		provider: "groq",
		label: "Groq Whisper Large V3 Turbo",
		notes: "Fastest and lowest-cost Groq option for everyday dictation.",
		languageLabel: "Multilingual",
		highlightLabel: "$0.04 / audio hour",
		metaTags: ["400 RPM", "Dictation"],
		recommended: true,
	},
	{
		id: "whisper-large-v3",
		source: "cloud",
		provider: "groq",
		label: "Groq Whisper Large V3",
		notes: "Higher accuracy option with translation support.",
		languageLabel: "Multilingual",
		highlightLabel: "$0.111 / audio hour",
		metaTags: ["300 RPM", "Translation"],
		recommended: false,
	},
];

export const DEEPGRAM_MODEL_OPTIONS: DeepgramModelOption[] = [
	{
		id: "nova-3",
		source: "cloud",
		provider: "deepgram",
		label: "Deepgram Nova-3",
		notes:
			"Recommended Deepgram default for BYOK dictation with language detection.",
		languageLabel: "Multilingual",
		highlightLabel: "Usage-based",
		metaTags: ["Pre-recorded", "Detect language"],
		recommended: true,
	},
	{
		id: "nova-2",
		source: "cloud",
		provider: "deepgram",
		label: "Deepgram Nova-2",
		notes:
			"Compatibility fallback when you want Deepgram on a broader language set.",
		languageLabel: "Compatibility",
		highlightLabel: "Usage-based",
		metaTags: ["Pre-recorded", "Fallback"],
		recommended: false,
	},
];

export const CLOUD_MODEL_OPTIONS: CloudModelOption[] = [
	...GROQ_MODEL_OPTIONS,
	...DEEPGRAM_MODEL_OPTIONS,
];

export const DEFAULT_MODEL_ID: LocalModelId =
	"UsefulSensors/moonshine-streaming-medium";
export const DEFAULT_GROQ_MODEL_ID: GroqModelId = "whisper-large-v3-turbo";
export const DEFAULT_DEEPGRAM_MODEL_ID: DeepgramModelId = "nova-3";

export function isLocalModelId(value: string): value is LocalModelId {
	return MODEL_CATALOG.some((model) => model.id === value);
}

export function isGroqModelId(value: string): value is GroqModelId {
	return GROQ_MODEL_OPTIONS.some((model) => model.id === value);
}

export function isDeepgramModelId(value: string): value is DeepgramModelId {
	return DEEPGRAM_MODEL_OPTIONS.some((model) => model.id === value);
}

export function isCloudModelId(value: string): value is CloudModelId {
	return CLOUD_MODEL_OPTIONS.some((model) => model.id === value);
}

export function getGroqModelOption(
	modelId: GroqModelId,
): GroqModelOption | null {
	return GROQ_MODEL_OPTIONS.find((model) => model.id === modelId) ?? null;
}

export function getDeepgramModelOption(
	modelId: DeepgramModelId,
): DeepgramModelOption | null {
	return DEEPGRAM_MODEL_OPTIONS.find((model) => model.id === modelId) ?? null;
}

export function getCloudModelOption(
	modelId: CloudModelId,
): CloudModelOption | null {
	if (isGroqModelId(modelId)) {
		return getGroqModelOption(modelId);
	}
	if (isDeepgramModelId(modelId)) {
		return getDeepgramModelOption(modelId);
	}
	return null;
}

export function getModelSource(modelId: ModelId): ModelSource {
	return isLocalModelId(modelId) ? "local" : "cloud";
}

export function getCloudProviderIdForModel(
	modelId: ModelId,
): CloudProviderId | null {
	if (isGroqModelId(modelId)) {
		return "groq";
	}
	if (isDeepgramModelId(modelId)) {
		return "deepgram";
	}
	return null;
}

export function getCloudProviderLabel(providerId: CloudProviderId): string {
	switch (providerId) {
		case "deepgram":
			return "Deepgram";
		default:
			return "Groq";
	}
}

export function getModelProviderLabel(modelId: ModelId): string | null {
	const providerId = getCloudProviderIdForModel(modelId);
	return providerId ? getCloudProviderLabel(providerId) : null;
}

export function getModelLabel(modelId: ModelId): string {
	if (isLocalModelId(modelId)) {
		return (
			MODEL_CATALOG.find((model) => model.id === modelId)?.label ?? modelId
		);
	}

	return getCloudModelOption(modelId)?.label ?? modelId;
}
