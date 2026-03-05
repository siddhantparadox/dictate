export type ModelId =
	| "nvidia/canary-qwen-2.5b"
	| "nvidia/parakeet-tdt-0.6b-v3"
	| "UsefulSensors/moonshine-streaming-medium"
	| "UsefulSensors/moonshine-streaming-tiny";

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

export interface ModelCatalogItem {
	id: ModelId;
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

export const MODEL_CATALOG: ModelCatalogItem[] = [
	{
		id: "nvidia/canary-qwen-2.5b",
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

export const DEFAULT_MODEL_ID: ModelId =
	"UsefulSensors/moonshine-streaming-medium";
