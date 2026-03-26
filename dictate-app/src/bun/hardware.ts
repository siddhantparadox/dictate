import { spawnSync } from "node:child_process";
import os from "node:os";
import type { LocalModelCatalogItem } from "../shared/models";
import type { AppSnapshot } from "../shared/rpc";

type HardwareSnapshot = AppSnapshot["hardware"];

const GB = 1024 ** 3;

function round(value: number, digits = 1): number {
	const factor = 10 ** digits;
	return Math.round(value * factor) / factor;
}

function safeGpuVendor(name: string): HardwareSnapshot["gpuVendor"] {
	const normalized = name.toLowerCase();
	if (normalized.includes("nvidia")) {
		return "nvidia";
	}
	if (normalized.includes("amd") || normalized.includes("radeon")) {
		return "amd";
	}
	if (normalized.includes("intel")) {
		return "intel";
	}
	return "unknown";
}

function probeNvidiaSmi(): { name: string; vramGb: number | null } | null {
	try {
		const result = spawnSync(
			"nvidia-smi",
			["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
			{
				encoding: "utf8",
				timeout: 1_500,
				windowsHide: true,
			},
		);
		if (result.status !== 0 || !result.stdout.trim()) {
			return null;
		}

		const firstLine = result.stdout
			.split(/\r?\n/)
			.map((line) => line.trim())
			.find((line) => line.length > 0);
		if (!firstLine) {
			return null;
		}

		const [rawName, rawVram] = firstLine.split(",").map((part) => part.trim());
		const vramMb = Number.parseFloat(rawVram ?? "");
		return {
			name: rawName || "NVIDIA GPU",
			vramGb: Number.isFinite(vramMb) ? round(vramMb / 1024, 1) : null,
		};
	} catch {
		return null;
	}
}

function probeWindowsGpu(): { name: string; vramGb: number | null } | null {
	if (process.platform !== "win32") {
		return null;
	}

	try {
		const result = spawnSync(
			"powershell",
			[
				"-NoProfile",
				"-Command",
				"(Get-CimInstance Win32_VideoController | Select-Object -First 1 Name, AdapterRAM | ConvertTo-Json -Compress)",
			],
			{
				encoding: "utf8",
				timeout: 1_500,
				windowsHide: true,
			},
		);

		if (result.status !== 0 || !result.stdout.trim()) {
			return null;
		}

		const payload = JSON.parse(result.stdout) as {
			Name?: unknown;
			AdapterRAM?: unknown;
		};
		const name = typeof payload.Name === "string" ? payload.Name.trim() : "";
		if (!name) {
			return null;
		}

		const adapterRam = Number(payload.AdapterRAM);
		const vramGb =
			Number.isFinite(adapterRam) && adapterRam > 0
				? round(adapterRam / GB, 1)
				: null;

		return { name, vramGb };
	} catch {
		return null;
	}
}

export function probeHardwareSnapshot(): HardwareSnapshot {
	const cpus = os.cpus();
	const cpuModel = cpus[0]?.model ?? "Unknown CPU";
	const cpuCores = Math.max(cpus.length, 1);
	const totalRamGb = round(os.totalmem() / GB, 1);

	const nvidiaGpu = probeNvidiaSmi();
	if (nvidiaGpu) {
		return {
			platform:
				process.platform === "win32" ||
				process.platform === "darwin" ||
				process.platform === "linux"
					? process.platform
					: "unknown",
			cpuModel,
			cpuCores,
			totalRamGb,
			gpuVendor: "nvidia",
			gpuName: nvidiaGpu.name,
			gpuVramGb: nvidiaGpu.vramGb,
			cudaAvailable: true,
			asrRuntime: "unknown",
		};
	}

	const fallbackGpu = probeWindowsGpu();
	return {
		platform:
			process.platform === "win32" ||
			process.platform === "darwin" ||
			process.platform === "linux"
				? process.platform
				: "unknown",
		cpuModel,
		cpuCores,
		totalRamGb,
		gpuVendor: fallbackGpu ? safeGpuVendor(fallbackGpu.name) : "none",
		gpuName: fallbackGpu?.name ?? null,
		gpuVramGb: fallbackGpu?.vramGb ?? null,
		cudaAvailable: false,
		asrRuntime: "unknown",
	};
}

function evaluateSupport(
	model: LocalModelCatalogItem,
	hardware: HardwareSnapshot,
): Pick<LocalModelCatalogItem, "hardwareSupport" | "hardwareReason"> {
	if (hardware.totalRamGb < model.minSystemRamGb) {
		return {
			hardwareSupport: "unsupported",
			hardwareReason: `Needs at least ${model.minSystemRamGb} GB RAM (${hardware.totalRamGb} GB detected).`,
		};
	}

	if (model.runtime === "nvidia_gpu") {
		if (!hardware.cudaAvailable) {
			return {
				hardwareSupport: "unsupported",
				hardwareReason: "Requires an NVIDIA GPU with CUDA support.",
			};
		}

		if (
			model.minVramGb &&
			hardware.gpuVramGb &&
			hardware.gpuVramGb < model.minVramGb
		) {
			return {
				hardwareSupport: "unsupported",
				hardwareReason: `Needs about ${model.minVramGb} GB VRAM (${hardware.gpuVramGb} GB detected).`,
			};
		}

		if (model.minVramGb && hardware.gpuVramGb === null) {
			return {
				hardwareSupport: "works_slow",
				hardwareReason:
					"CUDA is available, but VRAM size could not be detected.",
			};
		}

		return {
			hardwareSupport: "ready",
			hardwareReason: "Matches your NVIDIA GPU profile.",
		};
	}

	if (hardware.totalRamGb < model.minSystemRamGb + 2) {
		return {
			hardwareSupport: "works_slow",
			hardwareReason:
				"Runs locally, but expect slower transcription on this RAM budget.",
		};
	}

	return {
		hardwareSupport: "ready",
		hardwareReason: "Runs well on CPU for this hardware profile.",
	};
}

export function applyHardwareSupportToModels(
	models: LocalModelCatalogItem[],
	hardware: HardwareSnapshot,
): LocalModelCatalogItem[] {
	return models.map((model) => ({
		...model,
		...evaluateSupport(model, hardware),
	}));
}
