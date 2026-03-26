export type LocalModelId =
	| "nvidia/canary-qwen-2.5b"
	| "nvidia/parakeet-tdt-0.6b-v3"
	| "UsefulSensors/moonshine-streaming-medium"
	| "UsefulSensors/moonshine-streaming-tiny";

export type GroqModelId = "whisper-large-v3" | "whisper-large-v3-turbo";

export type ModelId = LocalModelId | GroqModelId;
export type ModelSource = "local" | "cloud";
export type CloudProviderId = "groq";

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

export interface GroqModelOption {
	id: GroqModelId;
	source: "cloud";
	provider: "groq";
	label: string;
	notes: string;
	languageLabel: string;
	pricingLabel: string;
	throughputLabel: string;
	translationSupported: boolean;
	recommended: boolean;
}

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
		pricingLabel: "$0.04 / audio hour",
		throughputLabel: "400 RPM",
		translationSupported: false,
		recommended: true,
	},
	{
		id: "whisper-large-v3",
		source: "cloud",
		provider: "groq",
		label: "Groq Whisper Large V3",
		notes: "Higher accuracy option with translation support.",
		languageLabel: "Multilingual",
		pricingLabel: "$0.111 / audio hour",
		throughputLabel: "300 RPM",
		translationSupported: true,
		recommended: false,
	},
];

export const DEFAULT_MODEL_ID: LocalModelId =
	"UsefulSensors/moonshine-streaming-medium";
export const DEFAULT_GROQ_MODEL_ID: GroqModelId = "whisper-large-v3-turbo";

export function isLocalModelId(value: string): value is LocalModelId {
	return MODEL_CATALOG.some((model) => model.id === value);
}

export function isGroqModelId(value: string): value is GroqModelId {
	return GROQ_MODEL_OPTIONS.some((model) => model.id === value);
}

export function getGroqModelOption(
	modelId: GroqModelId,
): GroqModelOption | null {
	return GROQ_MODEL_OPTIONS.find((model) => model.id === modelId) ?? null;
}

export function getModelSource(modelId: ModelId): ModelSource {
	return isLocalModelId(modelId) ? "local" : "cloud";
}

export function getModelProviderLabel(modelId: ModelId): string | null {
	if (isGroqModelId(modelId)) {
		return "Groq";
	}
	return null;
}

export function getModelLabel(modelId: ModelId): string {
	if (isLocalModelId(modelId)) {
		return (
			MODEL_CATALOG.find((model) => model.id === modelId)?.label ?? modelId
		);
	}

	return getGroqModelOption(modelId)?.label ?? modelId;
}
