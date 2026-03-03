export type ModelId =
	| "nvidia/canary-qwen-2.5b"
	| "nvidia/parakeet-tdt-0.6b-v3"
	| "UsefulSensors/moonshine-streaming-medium"
	| "UsefulSensors/moonshine-streaming-tiny";

export type CompatibilityTier =
	| "recommended"
	| "available_with_constraints"
	| "not_recommended";

export type ModelInstallStatus =
	| "not_installed"
	| "downloading"
	| "installed"
	| "error";

export interface ModelCatalogItem {
	id: ModelId;
	label: string;
	sizeLabel: string;
	notes: string;
	compatibility: CompatibilityTier;
	installed: boolean;
	status: ModelInstallStatus;
}

export const MODEL_CATALOG: ModelCatalogItem[] = [
	{
		id: "nvidia/canary-qwen-2.5b",
		label: "NVIDIA Canary-Qwen-2.5B",
		sizeLabel: "5.12 GB",
		notes: "High-accuracy English ASR, best on strong NVIDIA GPUs.",
		compatibility: "available_with_constraints",
		installed: false,
		status: "not_installed",
	},
	{
		id: "nvidia/parakeet-tdt-0.6b-v3",
		label: "NVIDIA Parakeet-TDT-0.6B-v3",
		sizeLabel: "2.51 GB",
		notes: "Multilingual model with strong accuracy, GPU-friendly.",
		compatibility: "available_with_constraints",
		installed: false,
		status: "not_installed",
	},
	{
		id: "UsefulSensors/moonshine-streaming-medium",
		label: "Moonshine Medium Streaming",
		sizeLabel: "1.06 GB",
		notes: "Balanced quality and local runtime footprint.",
		compatibility: "recommended",
		installed: false,
		status: "not_installed",
	},
	{
		id: "UsefulSensors/moonshine-streaming-tiny",
		label: "Moonshine Tiny Streaming",
		sizeLabel: "176 MB",
		notes: "Fast fallback model for lower-end devices.",
		compatibility: "recommended",
		installed: false,
		status: "not_installed",
	},
];

export const DEFAULT_MODEL_ID: ModelId =
	"UsefulSensors/moonshine-streaming-medium";
