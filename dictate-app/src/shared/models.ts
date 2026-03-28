export type LocalModelId =
	| "nvidia/canary-qwen-2.5b"
	| "nvidia/parakeet-tdt-0.6b-v3"
	| "UsefulSensors/moonshine-streaming-medium"
	| "UsefulSensors/moonshine-streaming-tiny";

export type GroqModelId = "whisper-large-v3" | "whisper-large-v3-turbo";
export type DeepgramModelId = "nova-3" | "nova-2";
export type AssemblyAIModelId = "universal-3-pro" | "universal-2";
export type OpenRouterModelId = "google/gemini-3.1-flash-lite-preview:nitro";
export type CloudModelId =
	| GroqModelId
	| DeepgramModelId
	| AssemblyAIModelId
	| OpenRouterModelId;
export type ModelId = LocalModelId | CloudModelId;
export type ModelSource = "local" | "cloud";
export type CloudProviderId = "groq" | "deepgram" | "assemblyai" | "openrouter";

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
export type AssemblyAIModelOption = BaseCloudModelOption<
	AssemblyAIModelId,
	"assemblyai"
>;
export type OpenRouterModelOption = BaseCloudModelOption<
	OpenRouterModelId,
	"openrouter"
>;
export type CloudModelOption =
	| GroqModelOption
	| DeepgramModelOption
	| AssemblyAIModelOption
	| OpenRouterModelOption;

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

export const ASSEMBLYAI_MODEL_OPTIONS: AssemblyAIModelOption[] = [
	{
		id: "universal-3-pro",
		source: "cloud",
		provider: "assemblyai",
		label: "AssemblyAI Universal-3 Pro",
		notes:
			"Best AssemblyAI accuracy for dictation. Dictate pairs it with Universal-2 automatically for broader language coverage.",
		languageLabel: "Adaptive",
		highlightLabel: "$0.21 / audio hour",
		metaTags: ["Async job", "Fallback enabled"],
		recommended: true,
	},
	{
		id: "universal-2",
		source: "cloud",
		provider: "assemblyai",
		label: "AssemblyAI Universal-2",
		notes:
			"Standalone fallback with broad language coverage when you want AssemblyAI without the Universal-3 Pro path.",
		languageLabel: "99 languages",
		highlightLabel: "$0.15 / audio hour",
		metaTags: ["Async job", "Standalone"],
		recommended: false,
	},
];

export const OPENROUTER_MODEL_OPTIONS: OpenRouterModelOption[] = [
	{
		id: "google/gemini-3.1-flash-lite-preview:nitro",
		source: "cloud",
		provider: "openrouter",
		label: "OpenRouter Gemini 3.1 Flash Lite Nitro",
		notes:
			"Gemini audio transcription through OpenRouter with the Nitro high-throughput route.",
		languageLabel: "Multilingual",
		highlightLabel: "$0.50 / M audio tokens",
		metaTags: ["Nitro", "Gemini", "Audio input"],
		recommended: true,
	},
];

export const CLOUD_MODEL_OPTIONS: CloudModelOption[] = [
	...GROQ_MODEL_OPTIONS,
	...DEEPGRAM_MODEL_OPTIONS,
	...ASSEMBLYAI_MODEL_OPTIONS,
	...OPENROUTER_MODEL_OPTIONS,
];

export const DEFAULT_MODEL_ID: LocalModelId =
	"UsefulSensors/moonshine-streaming-medium";
export const DEFAULT_GROQ_MODEL_ID: GroqModelId = "whisper-large-v3-turbo";
export const DEFAULT_DEEPGRAM_MODEL_ID: DeepgramModelId = "nova-3";
export const DEFAULT_ASSEMBLYAI_MODEL_ID: AssemblyAIModelId = "universal-3-pro";
export const DEFAULT_OPENROUTER_MODEL_ID: OpenRouterModelId =
	"google/gemini-3.1-flash-lite-preview:nitro";

export function isLocalModelId(value: string): value is LocalModelId {
	return MODEL_CATALOG.some((model) => model.id === value);
}

export function isGroqModelId(value: string): value is GroqModelId {
	return GROQ_MODEL_OPTIONS.some((model) => model.id === value);
}

export function isDeepgramModelId(value: string): value is DeepgramModelId {
	return DEEPGRAM_MODEL_OPTIONS.some((model) => model.id === value);
}

export function isAssemblyAIModelId(value: string): value is AssemblyAIModelId {
	return ASSEMBLYAI_MODEL_OPTIONS.some((model) => model.id === value);
}

export function isOpenRouterModelId(value: string): value is OpenRouterModelId {
	return OPENROUTER_MODEL_OPTIONS.some((model) => model.id === value);
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

export function getAssemblyAIModelOption(
	modelId: AssemblyAIModelId,
): AssemblyAIModelOption | null {
	return ASSEMBLYAI_MODEL_OPTIONS.find((model) => model.id === modelId) ?? null;
}

export function getOpenRouterModelOption(
	modelId: OpenRouterModelId,
): OpenRouterModelOption | null {
	return OPENROUTER_MODEL_OPTIONS.find((model) => model.id === modelId) ?? null;
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
	if (isAssemblyAIModelId(modelId)) {
		return getAssemblyAIModelOption(modelId);
	}
	if (isOpenRouterModelId(modelId)) {
		return getOpenRouterModelOption(modelId);
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
	if (isAssemblyAIModelId(modelId)) {
		return "assemblyai";
	}
	if (isOpenRouterModelId(modelId)) {
		return "openrouter";
	}
	return null;
}

export function getCloudProviderLabel(providerId: CloudProviderId): string {
	switch (providerId) {
		case "assemblyai":
			return "AssemblyAI";
		case "deepgram":
			return "Deepgram";
		case "groq":
			return "Groq";
		case "openrouter":
			return "OpenRouter";
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
