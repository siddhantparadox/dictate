import { dlopen, FFIType, type Library, type Pointer, suffix } from "bun:ffi";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import Electrobun, {
	BrowserView,
	BrowserWindow,
	GlobalShortcut,
	Screen,
	Tray,
	Updater,
	Utils,
} from "electrobun/bun";
import {
	DEFAULT_MODEL_ID,
	type InferenceEngine,
	type ModelCatalogItem,
	type ModelId,
} from "../shared/models";
import type {
	AppSnapshot,
	DeleteModelResult,
	DictateRPC,
	DictateSettings,
	InstallAccelerationResult,
	JobRecord,
	PillFramePayload,
	PrepareModelResult,
	RecordingPillState,
	ToastPayload,
	TranscriptionResult,
} from "../shared/rpc";
import { autoPasteText } from "./autopaste";
import {
	applyHardwareSupportToModels,
	probeHardwareSnapshot,
} from "./hardware";
import { SidecarClient } from "./sidecar";
import { DictateStorage } from "./storage";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;
const DEFAULT_MIC_DURATION_SECONDS = 7;
const MAX_RECENT_JOBS = 30;
const FALLBACK_HOTKEY = "Ctrl+Shift";
const PILL_WINDOW_WIDTH = 460;
const PILL_WINDOW_HEIGHT = 72;
const PILL_WINDOW_BOTTOM_MARGIN = 22;
const PILL_HIDE_DELAY_MS = 1300;
const PILL_FRAME_INTERVAL_MS = 33;
const MIC_LEVEL_STALE_MS = 180;
const MIC_LEVEL_VISUAL_GAIN = 1.6;
const MIC_LEVEL_VISUAL_CURVE = 0.72;
const MIC_LEVEL_AGC_FLOOR = 0.06;
const MIC_LEVEL_AGC_DECAY = 0.985;
const MIC_LEVEL_AGC_HEADROOM = 0.92;
const MIC_LEVEL_ATTACK_ALPHA = 0.64;
const MIC_LEVEL_RELEASE_ALPHA = 0.24;
const MODIFIER_HOTKEY_POLL_MS = 30;
const MODIFIER_HOTKEY_REARM_MS = 120;
const CUDA_PROBE_TIMEOUT_MS = 6_000;
const HF_XET_PROBE_TIMEOUT_MS = 4_000;
const HF_XET_INSTALL_TIMEOUT_MS = 6 * 60_000;
const MODEL_WARMUP_BOOT_DELAY_MS = 320;
const MODEL_WARMUP_STAGE_DELAY_MS = 140;
const WINDOWS_RUN_REGISTRY_KEY = String.raw`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`;
const WINDOWS_RUN_VALUE_NAME = "Dictate";
const AUTOSTART_LAUNCH_ARG = "--autostart";

const VK_CONTROL = 0x11;
const VK_SHIFT = 0x10;
const VK_LCONTROL = 0xa2;
const VK_RCONTROL = 0xa3;
const VK_LSHIFT = 0xa0;
const VK_RSHIFT = 0xa1;
const PROCESS_PER_MONITOR_DPI_AWARE = 2;

type WindowRpc = {
	send: {
		snapshotUpdated: (payload: AppSnapshot) => Promise<void> | void;
		pillFrameUpdated: (payload: PillFramePayload) => Promise<void> | void;
		toast: (payload: ToastPayload) => Promise<void> | void;
	};
};

type AccelerationMode = DictateSettings["accelerationMode"];
type ModelProgressEntry = NonNullable<
	AppSnapshot["modelProgressById"][ModelId]
>;
type ModelRuntimeById = AppSnapshot["modelRuntimeById"];
type WarmupState = AppSnapshot["warmup"];
const runtimeProbeCache = new Map<string, boolean>();
const hfXetProbeCache = new Map<string, boolean>();
const hfXetInstallInFlight = new Map<string, Promise<void>>();
const isAutoStartLaunch = process.argv.includes(AUTOSTART_LAUNCH_ARG);

function probeSidecarCudaAvailability(
	pythonBin: string,
	options?: { forceRefresh?: boolean },
): boolean | null {
	const cached = runtimeProbeCache.get(pythonBin);
	if (!options?.forceRefresh && typeof cached === "boolean") {
		return cached;
	}

	try {
		const result = spawnSync(
			pythonBin,
			[
				"-c",
				"import json, torch; print(json.dumps({'cuda': bool(torch.cuda.is_available())}))",
			],
			{
				encoding: "utf8",
				timeout: CUDA_PROBE_TIMEOUT_MS,
				windowsHide: true,
			},
		);
		if (result.status !== 0 || !result.stdout.trim()) {
			return typeof cached === "boolean" ? cached : null;
		}
		const parsed = JSON.parse(result.stdout) as { cuda?: unknown };
		if (typeof parsed.cuda !== "boolean") {
			return typeof cached === "boolean" ? cached : null;
		}
		runtimeProbeCache.set(pythonBin, parsed.cuda);
		return parsed.cuda;
	} catch {
		return typeof cached === "boolean" ? cached : null;
	}
}

function probeHfXetAvailability(
	pythonBin: string,
	options?: { forceRefresh?: boolean },
): boolean | null {
	const cached = hfXetProbeCache.get(pythonBin);
	if (!options?.forceRefresh && typeof cached === "boolean") {
		return cached;
	}

	try {
		const result = spawnSync(
			pythonBin,
			[
				"-c",
				"import importlib.util, json; print(json.dumps({'hf_xet': bool(importlib.util.find_spec('hf_xet'))}))",
			],
			{
				encoding: "utf8",
				timeout: HF_XET_PROBE_TIMEOUT_MS,
				windowsHide: true,
			},
		);
		if (result.status !== 0 || !result.stdout.trim()) {
			return typeof cached === "boolean" ? cached : null;
		}
		const parsed = JSON.parse(result.stdout) as { hf_xet?: unknown };
		if (typeof parsed.hf_xet !== "boolean") {
			return typeof cached === "boolean" ? cached : null;
		}
		hfXetProbeCache.set(pythonBin, parsed.hf_xet);
		return parsed.hf_xet;
	} catch {
		return typeof cached === "boolean" ? cached : null;
	}
}

function isPathLikeCommand(command: string): boolean {
	return (
		command.includes("\\") ||
		command.includes("/") ||
		command.toLowerCase().endsWith(".exe")
	);
}

function commandExists(command: string): boolean {
	if (!isPathLikeCommand(command)) {
		return true;
	}
	return existsSync(command);
}

function pickFirstAvailableCommand(commands: string[]): string {
	for (const command of commands) {
		if (commandExists(command)) {
			return command;
		}
	}
	return "python";
}

type ResolvedSidecarRuntime = {
	pythonBin: string;
	runtime: AppSnapshot["hardware"]["asrRuntime"];
	warning?: string;
};

function ensureDirectory(path: string): string {
	mkdirSync(path, { recursive: true });
	return path;
}

function formatSpawnSyncOutput(result: ReturnType<typeof spawnSync>): string {
	return `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
}

function resolveWindowsLauncherPath(): string {
	const candidates = [
		join(process.cwd(), "launcher.exe"),
		join(process.cwd(), "launcher"),
		join(process.cwd(), "bin", "launcher.exe"),
		join(process.cwd(), "bin", "launcher"),
	];

	for (const candidate of candidates) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}

	throw new Error(
		`Could not locate the launcher executable from ${process.cwd()}.`,
	);
}

function buildWindowsAutostartCommand(): string {
	const launcherPath = resolveWindowsLauncherPath().replace(/"/g, '""');
	return `"${launcherPath}" ${AUTOSTART_LAUNCH_ARG}`;
}

function applyLaunchOnStartupPreference(enabled: boolean): void {
	if (process.platform !== "win32") {
		if (enabled) {
			throw new Error("Launch on startup currently supports Windows only.");
		}
		return;
	}

	if (enabled) {
		const result = spawnSync(
			"reg.exe",
			[
				"add",
				WINDOWS_RUN_REGISTRY_KEY,
				"/v",
				WINDOWS_RUN_VALUE_NAME,
				"/t",
				"REG_SZ",
				"/d",
				buildWindowsAutostartCommand(),
				"/f",
			],
			{
				encoding: "utf8",
				windowsHide: true,
			},
		);
		if (result.error) {
			throw result.error;
		}
		if (result.status !== 0) {
			throw new Error(
				formatSpawnSyncOutput(result) ||
					"Failed to enable launch on startup in the Windows registry.",
			);
		}
		return;
	}

	const result = spawnSync(
		"reg.exe",
		["delete", WINDOWS_RUN_REGISTRY_KEY, "/v", WINDOWS_RUN_VALUE_NAME, "/f"],
		{
			encoding: "utf8",
			windowsHide: true,
		},
	);
	if (result.error) {
		throw result.error;
	}
	if (result.status !== 0) {
		const output = formatSpawnSyncOutput(result).toLowerCase();
		if (
			!output.includes("unable to find") &&
			!output.includes("unable to find the specified registry key or value")
		) {
			throw new Error(
				output ||
					"Failed to disable launch on startup in the Windows registry.",
			);
		}
	}
}

function migrateLegacyHfCache(hfHubDir: string): void {
	const legacyHubDir = join(homedir(), ".cache", "huggingface", "hub");
	if (!existsSync(legacyHubDir) || legacyHubDir === hfHubDir) {
		return;
	}

	try {
		const entries = readdirSync(legacyHubDir, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isDirectory() || !entry.name.startsWith("models--")) {
				continue;
			}

			const sourcePath = join(legacyHubDir, entry.name);
			const targetPath = join(hfHubDir, entry.name);
			if (existsSync(targetPath)) {
				continue;
			}

			try {
				renameSync(sourcePath, targetPath);
				console.log(`[cache] migrated ${entry.name} -> ${targetPath}`);
			} catch (error) {
				console.warn(
					`[cache] failed to migrate ${entry.name}:`,
					error instanceof Error ? error.message : error,
				);
			}
		}
	} catch (error) {
		console.warn(
			"[cache] failed to scan legacy Hugging Face cache:",
			error instanceof Error ? error.message : error,
		);
	}
}

function resolveSidecarScriptPath(): string {
	const candidates = [
		resolve(process.cwd(), "sidecar", "worker.py"),
		resolve(import.meta.dir, "..", "..", "sidecar", "worker.py"),
		resolve(import.meta.dir, "..", "..", "..", "..", "sidecar", "worker.py"),
		resolve(process.cwd(), "..", "..", "..", "..", "sidecar", "worker.py"),
	];

	for (const candidate of candidates) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}

	console.error(
		`[sidecar] worker.py not found. cwd=${process.cwd()} importDir=${import.meta.dir} candidates=${candidates.join(" | ")}`,
	);
	return candidates[0];
}

function resolveSidecarBootstrapScriptPath(sidecarWorkerPath: string): string {
	return resolve(sidecarWorkerPath, "..", "bootstrap.ps1");
}

function resolvePowerShellExecutable(): string {
	if (process.platform !== "win32") {
		return "pwsh";
	}

	const pwshPath = "C:\\Program Files\\PowerShell\\7\\pwsh.exe";
	if (existsSync(pwshPath)) {
		return pwshPath;
	}
	return "powershell.exe";
}

const storage = new DictateStorage(Utils.paths.userData);
const sidecarScript = resolveSidecarScriptPath();
const sidecarBootstrapScript = resolveSidecarBootstrapScriptPath(sidecarScript);
const sidecarProjectRoot = resolve(sidecarScript, "..", "..");
const dictateHomeDir = ensureDirectory(
	process.env.DICTATE_HOME ?? join(homedir(), ".dictateapp"),
);
const dictateModelsDir = ensureDirectory(join(dictateHomeDir, "models"));
const dictateHfHomeDir = ensureDirectory(join(dictateModelsDir, "huggingface"));
const dictateHfHubDir = ensureDirectory(join(dictateHfHomeDir, "hub"));
const dictateTorchHomeDir = ensureDirectory(join(dictateHomeDir, "torch"));
const dictateMoonshineCacheDir = ensureDirectory(
	join(dictateModelsDir, "moonshine"),
);
migrateLegacyHfCache(dictateHfHubDir);
const sidecarVenvLegacyPython = join(
	sidecarProjectRoot,
	"sidecar",
	".venv",
	"Scripts",
	"python.exe",
);
const sidecarVenvCpuPython = join(
	sidecarProjectRoot,
	"sidecar",
	".venv-cpu",
	"Scripts",
	"python.exe",
);
const sidecarVenvCudaPython = join(
	sidecarProjectRoot,
	"sidecar",
	".venv-cuda",
	"Scripts",
	"python.exe",
);
const runtimeOverridePython = process.env.PYTHON_BIN ?? null;
const cpuRuntimeCandidates = [
	process.env.PYTHON_BIN_CPU,
	sidecarVenvCpuPython,
	sidecarVenvLegacyPython,
	"python",
].filter((candidate): candidate is string => Boolean(candidate));
const cudaRuntimeCandidates = [
	process.env.PYTHON_BIN_CUDA,
	sidecarVenvCudaPython,
].filter((candidate): candidate is string => Boolean(candidate));

const baseHardwareSnapshot = probeHardwareSnapshot();

function resolveSidecarRuntime(mode: AccelerationMode): ResolvedSidecarRuntime {
	if (runtimeOverridePython) {
		const probe = probeSidecarCudaAvailability(runtimeOverridePython);
		return {
			pythonBin: runtimeOverridePython,
			runtime: probe === true ? "cuda" : probe === false ? "cpu" : "unknown",
		};
	}

	const resolveCpuRuntime = (): ResolvedSidecarRuntime => {
		const pythonBin = pickFirstAvailableCommand(cpuRuntimeCandidates);
		return {
			pythonBin,
			runtime: "cpu",
		};
	};

	if (mode === "auto") {
		for (const candidate of cudaRuntimeCandidates) {
			if (!commandExists(candidate)) {
				continue;
			}
			const probe = probeSidecarCudaAvailability(candidate);
			if (probe === true) {
				return {
					pythonBin: candidate,
					runtime: "cuda",
				};
			}
		}

		return resolveCpuRuntime();
	}

	if (mode === "cpu") {
		return resolveCpuRuntime();
	}

	let sawCudaCandidate = false;
	for (const candidate of cudaRuntimeCandidates) {
		if (!commandExists(candidate)) {
			continue;
		}
		sawCudaCandidate = true;
		const probe = probeSidecarCudaAvailability(candidate);
		if (probe === true) {
			return {
				pythonBin: candidate,
				runtime: "cuda",
			};
		}
	}

	const cpuRuntime = resolveCpuRuntime();
	return {
		...cpuRuntime,
		warning: sawCudaCandidate
			? "CUDA mode was selected, but the CUDA interpreter is not CUDA-enabled."
			: "CUDA mode was selected, but no CUDA sidecar runtime is installed. Run: pwsh -File sidecar/bootstrap.ps1 -Runtime cuda",
	};
}

function buildHardwareSnapshotForRuntime(
	runtime: AppSnapshot["hardware"]["asrRuntime"],
): AppSnapshot["hardware"] {
	return {
		...baseHardwareSnapshot,
		cudaAvailable: runtime === "cuda",
		asrRuntime: runtime,
	};
}

const initialSettings = storage.getSettings();
const initialRuntime = resolveSidecarRuntime(initialSettings.accelerationMode);
const sidecarEnvironment = {
	DICTATE_HOME: dictateHomeDir,
	HF_HOME: dictateHfHomeDir,
	HUGGINGFACE_HUB_CACHE: dictateHfHubDir,
	TORCH_HOME: dictateTorchHomeDir,
	MOONSHINE_CACHE_DIR: dictateMoonshineCacheDir,
};
console.log(
	`[sidecar] using script=${sidecarScript}; python=${initialRuntime.pythonBin}; mode=${initialSettings.accelerationMode}; runtime=${initialRuntime.runtime}`,
);
console.log(
	`[cache] models=${dictateModelsDir}; hf_home=${dictateHfHomeDir}; hf_hub=${dictateHfHubDir}`,
);
let modelProgressById: AppSnapshot["modelProgressById"] = {};
let modelProgressBroadcastTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleModelProgressBroadcast(): void {
	if (modelProgressBroadcastTimer) {
		return;
	}
	modelProgressBroadcastTimer = setTimeout(() => {
		modelProgressBroadcastTimer = null;
		void broadcastSnapshot({ target: "main" });
	}, 120);
}

function setModelProgress(
	modelId: ModelId,
	progress: ModelProgressEntry | null,
): void {
	if (!progress) {
		delete modelProgressById[modelId];
		return;
	}

	modelProgressById = {
		...modelProgressById,
		[modelId]: progress,
	};
}

const sidecar = new SidecarClient(
	sidecarScript,
	initialRuntime.pythonBin,
	sidecarEnvironment,
	{
		onPrepareModelProgress: (event) => {
			const nextProgress: ModelProgressEntry = {
				operation: "download",
				stage: event.stage,
				message: event.message,
				progress: event.progress,
				downloadedBytes: event.downloadedBytes,
				totalBytes: event.totalBytes,
				updatedAt: new Date().toISOString(),
			};
			setModelProgress(event.modelId, nextProgress);
			scheduleModelProgressBroadcast();
		},
		onMicrophoneLevel: ({ level, atMs }) => {
			liveMicLevel = Math.max(0, Math.min(1, level));
			lastMicLevelAt = atMs > 0 ? atMs : Date.now();
		},
	},
);

let mainWindow: BrowserWindow | null = null;
let pillWindow: BrowserWindow | null = null;
let trayRef: Tray | null = null;
let mainViewUrl: string | null = null;
let shuttingDown = false;
let hidePillTimer: ReturnType<typeof setTimeout> | null = null;
let recordingTicker: ReturnType<typeof setInterval> | null = null;
let recordingStartedAt = 0;
let liveMicLevel = 0;
let smoothedMicLevel = 0;
let adaptiveMicPeak = MIC_LEVEL_AGC_FLOOR;
let lastMicLevelAt = 0;
let modifierHotkeyTimer: ReturnType<typeof setInterval> | null = null;
let modifierHotkeyWasDown = false;
let lastModifierHotkeyAt = 0;
let activeHoldToTalkJob: JobRecord | null = null;
let isOneShotTranscriptionActive = false;
let user32Library: Library<{
	GetAsyncKeyState: {
		args: [typeof FFIType.i32];
		returns: typeof FFIType.i16;
	};
	SetProcessDPIAware: {
		args: [];
		returns: typeof FFIType.bool;
	};
}> | null = null;
let getAsyncKeyStateFn: ((virtualKey: number) => number) | null = null;
let setProcessDPIAwareFn: (() => boolean) | null = null;
let shcoreLibrary: Library<{
	SetProcessDpiAwareness: {
		args: [typeof FFIType.i32];
		returns: typeof FFIType.i32;
	};
}> | null = null;
let setProcessDpiAwarenessFn: ((awareness: number) => number) | null = null;
let windowsDpiAwarenessConfigured = false;
let user32WindowLibrary: Library<{
	GetWindowLongW: {
		args: [typeof FFIType.ptr, typeof FFIType.i32];
		returns: typeof FFIType.i32;
	};
	SetWindowLongW: {
		args: [typeof FFIType.ptr, typeof FFIType.i32, typeof FFIType.i32];
		returns: typeof FFIType.i32;
	};
	SetWindowPos: {
		args: [
			typeof FFIType.ptr,
			typeof FFIType.ptr,
			typeof FFIType.i32,
			typeof FFIType.i32,
			typeof FFIType.i32,
			typeof FFIType.i32,
			typeof FFIType.u32,
		];
		returns: typeof FFIType.bool;
	};
	ShowWindow: {
		args: [typeof FFIType.ptr, typeof FFIType.i32];
		returns: typeof FFIType.bool;
	};
	LoadImageA: {
		args: [
			typeof FFIType.ptr,
			typeof FFIType.cstring,
			typeof FFIType.u32,
			typeof FFIType.i32,
			typeof FFIType.i32,
			typeof FFIType.u32,
		];
		returns: typeof FFIType.ptr;
	};
	SendMessageW: {
		args: [
			typeof FFIType.ptr,
			typeof FFIType.u32,
			typeof FFIType.u64,
			typeof FFIType.ptr,
		];
		returns: typeof FFIType.ptr;
	};
	SetClassLongPtrW: {
		args: [typeof FFIType.ptr, typeof FFIType.i32, typeof FFIType.ptr];
		returns: typeof FFIType.ptr;
	};
	DestroyIcon: {
		args: [typeof FFIType.ptr];
		returns: typeof FFIType.bool;
	};
}> | null = null;
let getWindowLongWFn: ((windowPtr: Pointer, index: number) => number) | null =
	null;
let setWindowLongWFn:
	| ((windowPtr: Pointer, index: number, nextValue: number) => number)
	| null = null;
let setWindowPosFn:
	| ((
			windowPtr: Pointer,
			insertAfter: Pointer | null,
			x: number,
			y: number,
			width: number,
			height: number,
			flags: number,
	  ) => boolean)
	| null = null;
let showWindowFn: ((windowPtr: Pointer, command: number) => boolean) | null =
	null;
let loadImageAFn:
	| ((
			instance: Pointer | null,
			name: NodeJS.TypedArray,
			imageType: number,
			width: number,
			height: number,
			flags: number,
	  ) => Pointer)
	| null = null;
let sendMessageWFn:
	| ((
			windowPtr: Pointer,
			message: number,
			wParam: number,
			lParam: Pointer | null,
	  ) => Pointer)
	| null = null;
let setClassLongPtrWFn:
	| ((windowPtr: Pointer, index: number, value: Pointer | null) => Pointer)
	| null = null;
let destroyIconFn: ((iconHandle: Pointer) => boolean) | null = null;
let nativeWindowIconLibrary: Library<{
	setWindowIcon: {
		args: [typeof FFIType.ptr, typeof FFIType.cstring];
		returns: typeof FFIType.void;
	};
}> | null = null;
let setNativeWindowIconFn:
	| ((windowPtr: Pointer, iconPath: NodeJS.TypedArray) => void)
	| null = null;

let currentPill: AppSnapshot["pill"] = {
	state: "hidden",
	durationMs: 0,
	visible: false,
};

const NO_SPEECH_PATTERNS = [
	"empty transcription",
	"no speech detected",
	"returned no generated tokens",
];
const GWL_EXSTYLE = -20;
const WS_EX_TOOLWINDOW = 0x00000080;
const WS_EX_APPWINDOW = 0x00040000;
const SW_HIDE = 0;
const SW_SHOWNA = 8;
const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;
const SWP_NOZORDER = 0x0004;
const SWP_NOACTIVATE = 0x0010;
const SWP_FRAMECHANGED = 0x0020;
const IMAGE_ICON = 1;
const LR_LOADFROMFILE = 0x0010;
const WM_SETICON = 0x0080;
const ICON_SMALL = 0;
const ICON_BIG = 1;
const ICON_SMALL2 = 2;
const GCLP_HICON = -14;
const GCLP_HICONSM = -34;
const APP_ICON_CANDIDATE_PATHS = [
	resolve(process.cwd(), "icon.ico"),
	resolve(process.cwd(), "..", "icon.ico"),
	resolve(import.meta.dir, "..", "..", "..", "icon.ico"),
	resolve(import.meta.dir, "..", "..", "..", "..", "icon.ico"),
	resolve(import.meta.dir, "..", "..", "app.ico"),
	resolve(process.cwd(), "..", "Resources", "app.ico"),
	resolve(
		process.cwd(),
		"build",
		"dev-win-x64",
		"dictate-dev",
		"Resources",
		"app.ico",
	),
	resolve(
		process.cwd(),
		"build",
		"canary-win-x64",
		"dictate-canary",
		"Resources",
		"app.ico",
	),
	resolve(
		process.cwd(),
		"build",
		"stable-win-x64",
		"dictate",
		"Resources",
		"app.ico",
	),
	resolve(process.cwd(), "icon.png"),
	resolve(process.cwd(), "..", "icon.png"),
	resolve(import.meta.dir, "..", "..", "..", "icon.png"),
	resolve(import.meta.dir, "..", "..", "..", "..", "icon.png"),
] as const;
const loadedWindowIcons = new Map<string, Pointer>();

let hardwareSnapshot = buildHardwareSnapshotForRuntime(initialRuntime.runtime);
let modelsCache = storage.getModels();
let recentJobsCache = storage.getRecentJobs(MAX_RECENT_JOBS);
let lastJobCache = storage.getLastJob();
let accelerationInstallerState: AppSnapshot["accelerationInstaller"] = {
	status: "idle",
	mode: null,
	message: "",
	updatedAt: new Date().toISOString(),
};
let warmupState: WarmupState = {
	state: "idle",
	modelId: null,
	detail: "Select an installed model to warm up.",
	updatedAt: new Date().toISOString(),
};
let warmupInFlight = false;
let warmupPending = false;
let lastWarmupSignature: string | null = null;
let settingsUpdateQueue: Promise<void> = Promise.resolve();

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTranscriptionActive(): boolean {
	return isOneShotTranscriptionActive || activeHoldToTalkJob !== null;
}

function updateJobCache(job: JobRecord): void {
	recentJobsCache = [
		job,
		...recentJobsCache.filter((candidate) => candidate.id !== job.id),
	].slice(0, MAX_RECENT_JOBS);
	lastJobCache = job;
}

function refreshModelsCache(): void {
	modelsCache = storage.getModels();
}

function setAccelerationInstallerState(
	next: Omit<AppSnapshot["accelerationInstaller"], "updatedAt">,
): void {
	accelerationInstallerState = {
		...next,
		updatedAt: new Date().toISOString(),
	};
}

function setWarmupState(next: Omit<WarmupState, "updatedAt">): void {
	warmupState = {
		...next,
		updatedAt: new Date().toISOString(),
	};
}

function getModelLabel(modelId: ModelId): string {
	return modelsCache.find((model) => model.id === modelId)?.label ?? modelId;
}

function resolveTargetEngine(model: ModelCatalogItem): InferenceEngine {
	if (
		model.inference.strictTensorRtWhenSupported &&
		model.inference.tensorRtSupported
	) {
		return "tensorrt";
	}
	return model.inference.defaultEngine;
}

function resolveModelRuntimeProfile(
	model: ModelCatalogItem,
	settings: DictateSettings,
): NonNullable<ModelRuntimeById[ModelId]> {
	const targetEngine = resolveTargetEngine(model);
	let activeEngine: InferenceEngine = model.inference.defaultEngine;
	let status: NonNullable<ModelRuntimeById[ModelId]>["status"] = "ready";
	let detail = "";

	if (model.hardwareSupport === "unsupported") {
		return {
			targetEngine,
			activeEngine,
			status: "unsupported",
			tensorRtSupported: model.inference.tensorRtSupported,
			strictTensorRtWhenSupported: model.inference.strictTensorRtWhenSupported,
			quantizationLabel: model.inference.quantizationLabel,
			cudaGraphs: model.inference.cudaGraphs,
			detail:
				model.hardwareReason ??
				"This model is not supported on current hardware.",
		};
	}

	if (model.runtime === "cpu") {
		activeEngine = "moonshine";
		detail = "CPU runtime path (Moonshine engine).";
		return {
			targetEngine,
			activeEngine,
			status,
			tensorRtSupported: model.inference.tensorRtSupported,
			strictTensorRtWhenSupported: model.inference.strictTensorRtWhenSupported,
			quantizationLabel: model.inference.quantizationLabel,
			cudaGraphs: model.inference.cudaGraphs,
			detail,
		};
	}

	if (hardwareSnapshot.asrRuntime !== "cuda") {
		activeEngine = "pytorch";
		status = "fallback";
		detail =
			settings.accelerationMode === "cuda"
				? "CUDA was requested but runtime is not CUDA-active; running fallback path."
				: "CUDA runtime is not active; TensorRT is unavailable and PyTorch GPU path is idle.";
		return {
			targetEngine,
			activeEngine,
			status,
			tensorRtSupported: model.inference.tensorRtSupported,
			strictTensorRtWhenSupported: model.inference.strictTensorRtWhenSupported,
			quantizationLabel: model.inference.quantizationLabel,
			cudaGraphs: model.inference.cudaGraphs,
			detail,
		};
	}

	activeEngine = targetEngine;
	if (targetEngine === "tensorrt") {
		detail = "TensorRT enforced by policy for this model/runtime.";
	} else {
		detail =
			"Running PyTorch CUDA path. TensorRT is not configured for this model in this build.";
	}

	return {
		targetEngine,
		activeEngine,
		status,
		tensorRtSupported: model.inference.tensorRtSupported,
		strictTensorRtWhenSupported: model.inference.strictTensorRtWhenSupported,
		quantizationLabel: model.inference.quantizationLabel,
		cudaGraphs: model.inference.cudaGraphs,
		detail,
	};
}

function buildModelRuntimeById(
	settings: DictateSettings,
	modelsForHardware: ModelCatalogItem[],
): ModelRuntimeById {
	const runtimeById: ModelRuntimeById = {};
	for (const model of modelsForHardware) {
		runtimeById[model.id] = resolveModelRuntimeProfile(model, settings);
	}
	return runtimeById;
}

function buildWarmupSignature(modelId: ModelId): string {
	const settings = storage.getSettings();
	return [
		modelId,
		settings.accelerationMode,
		hardwareSnapshot.asrRuntime,
		sidecar.getPythonBin(),
	].join("|");
}

function triggerSelectedModelWarmup(reason: string): void {
	if (warmupInFlight) {
		warmupPending = true;
		return;
	}

	warmupInFlight = true;
	void (async () => {
		try {
			if (isTranscriptionActive()) {
				setWarmupState({
					state: "idle",
					modelId: storage.getSettings().defaultModelId,
					detail: "Warm-up pauses while transcription is active.",
				});
				await broadcastSnapshot({ target: "main" });
				return;
			}

			refreshModelsCache();
			const settings = storage.getSettings();
			const modelId = settings.defaultModelId;
			const model = modelsCache.find((candidate) => candidate.id === modelId);
			if (!model || model.status !== "installed") {
				lastWarmupSignature = null;
				setWarmupState({
					state: "idle",
					modelId,
					detail: "Download the selected model to enable warm-up.",
				});
				await broadcastSnapshot({ target: "main" });
				return;
			}

			const unsupportedReason = getUnsupportedModelReason(modelId);
			if (unsupportedReason) {
				setWarmupState({
					state: "error",
					modelId,
					detail: unsupportedReason,
				});
				await broadcastSnapshot({ target: "main" });
				return;
			}

			const signature = buildWarmupSignature(modelId);
			if (lastWarmupSignature === signature) {
				setWarmupState({
					state: "ready",
					modelId,
					detail: `${getModelLabel(modelId)} is warm and ready.`,
				});
				await broadcastSnapshot({ target: "main" });
				return;
			}

			console.log(`[warmup] begin model=${modelId} reason=${reason}`);
			setWarmupState({
				state: "loading_runtime",
				modelId,
				detail: `Loading runtime for ${getModelLabel(modelId)}...`,
			});
			await broadcastSnapshot({ target: "main" });

			setWarmupState({
				state: "loading_model",
				modelId,
				detail: `Loading ${getModelLabel(modelId)} into memory...`,
			});
			await broadcastSnapshot({ target: "main" });

			await sidecar.prepareModel(modelId);

			setWarmupState({
				state: "warming_up",
				modelId,
				detail: `Finalizing warm-up for ${getModelLabel(modelId)}...`,
			});
			await broadcastSnapshot({ target: "main" });
			await sleep(MODEL_WARMUP_STAGE_DELAY_MS);

			lastWarmupSignature = signature;
			setModelProgress(modelId, null);
			setWarmupState({
				state: "ready",
				modelId,
				detail: `${getModelLabel(modelId)} is warm and ready.`,
			});
			await broadcastSnapshot({ target: "main" });
			console.log(`[warmup] ready model=${modelId} reason=${reason}`);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Unknown warm-up error.";
			setWarmupState({
				state: "error",
				modelId: storage.getSettings().defaultModelId,
				detail: message,
			});
			await broadcastSnapshot({ target: "main" });
			console.warn(`[warmup] failed reason=${reason}: ${message}`);
		} finally {
			warmupInFlight = false;
			if (warmupPending) {
				warmupPending = false;
				triggerSelectedModelWarmup("queued");
			}
		}
	})();
}

async function installHfXetIntoRuntime(pythonBin: string): Promise<void> {
	await new Promise<void>((resolvePromise, rejectPromise) => {
		const args = ["-m", "pip", "install", "--upgrade", "hf_xet"];
		const child = spawn(pythonBin, args, {
			windowsHide: true,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stderrBuffer = "";
		let settled = false;

		const finish = (error?: Error) => {
			if (settled) {
				return;
			}
			settled = true;
			if (timer) {
				clearTimeout(timer);
			}
			if (error) {
				rejectPromise(error);
				return;
			}
			resolvePromise();
		};

		const timer = setTimeout(() => {
			child.kill();
			finish(
				new Error(
					`hf_xet install timed out after ${HF_XET_INSTALL_TIMEOUT_MS}ms.`,
				),
			);
		}, HF_XET_INSTALL_TIMEOUT_MS);

		child.stdout.on("data", (chunk) => {
			const output = String(chunk).trim();
			if (!output) {
				return;
			}
			console.log(`[runtime-heal] ${output}`);
		});

		child.stderr.on("data", (chunk) => {
			const output = String(chunk).trim();
			if (!output) {
				return;
			}
			stderrBuffer = `${stderrBuffer}\n${output}`.trim();
			console.error(`[runtime-heal] ${output}`);
		});

		child.on("error", (error) => {
			finish(new Error(`Failed to start hf_xet install: ${error.message}`));
		});

		child.on("close", (code) => {
			if (code === 0) {
				finish();
				return;
			}
			finish(
				new Error(
					`hf_xet install failed with exit code ${code ?? "unknown"}${stderrBuffer ? `: ${stderrBuffer}` : ""}`,
				),
			);
		});
	});
}

async function ensureHfXetForRuntime(
	pythonBin: string,
	context: string,
): Promise<void> {
	if (!commandExists(pythonBin)) {
		return;
	}

	const probe = probeHfXetAvailability(pythonBin);
	if (probe === true) {
		return;
	}

	const inFlight = hfXetInstallInFlight.get(pythonBin);
	if (inFlight) {
		await inFlight;
		return;
	}

	const installPromise = (async () => {
		console.log(
			`[runtime-heal] hf_xet missing for ${pythonBin}; installing (context=${context})...`,
		);
		try {
			await installHfXetIntoRuntime(pythonBin);
			const finalProbe = probeHfXetAvailability(pythonBin, {
				forceRefresh: true,
			});
			if (finalProbe !== true) {
				throw new Error("hf_xet still unavailable after install.");
			}
			console.log(`[runtime-heal] hf_xet ready for ${pythonBin}`);
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Unknown hf_xet install error.";
			console.warn(
				`[runtime-heal] failed to install hf_xet for ${pythonBin}: ${message}`,
			);
		}
	})();

	hfXetInstallInFlight.set(pythonBin, installPromise);
	try {
		await installPromise;
	} finally {
		hfXetInstallInFlight.delete(pythonBin);
	}
}

function enqueueSettingsUpdate<T>(operation: () => Promise<T>): Promise<T> {
	const run = settingsUpdateQueue.then(operation, operation);
	settingsUpdateQueue = run.then(
		() => undefined,
		() => undefined,
	);
	return run;
}

async function runAccelerationBootstrapInstall(mode: "cuda"): Promise<void> {
	if (process.platform !== "win32") {
		throw new Error(
			"Automatic runtime install is currently available on Windows only.",
		);
	}
	if (!existsSync(sidecarBootstrapScript)) {
		throw new Error(
			`Sidecar bootstrap script was not found: ${sidecarBootstrapScript}`,
		);
	}

	const powerShell = resolvePowerShellExecutable();
	const args = [
		"-NoProfile",
		"-ExecutionPolicy",
		"Bypass",
		"-File",
		sidecarBootstrapScript,
		"-Runtime",
		mode,
	];

	await new Promise<void>((resolvePromise, rejectPromise) => {
		const child = spawn(powerShell, args, {
			cwd: sidecarProjectRoot,
			windowsHide: true,
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stderrBuffer = "";

		child.stdout.on("data", (chunk) => {
			const output = String(chunk).trim();
			if (!output) {
				return;
			}
			console.log(`[runtime-install] ${output}`);
		});

		child.stderr.on("data", (chunk) => {
			const output = String(chunk).trim();
			if (!output) {
				return;
			}
			stderrBuffer = `${stderrBuffer}\n${output}`.trim();
			console.error(`[runtime-install] ${output}`);
		});

		child.on("error", (error) => {
			rejectPromise(
				new Error(`Failed to start runtime installer: ${error.message}`),
			);
		});

		child.on("close", (code) => {
			if (code === 0) {
				resolvePromise();
				return;
			}
			rejectPromise(
				new Error(
					`Runtime installer failed with exit code ${code ?? "unknown"}${stderrBuffer ? `: ${stderrBuffer}` : ""}`,
				),
			);
		});
	});
}

async function applyAccelerationMode(mode: AccelerationMode): Promise<void> {
	const runtime = resolveSidecarRuntime(mode);
	sidecar.setPythonBin(runtime.pythonBin);
	hardwareSnapshot = buildHardwareSnapshotForRuntime(runtime.runtime);
	lastWarmupSignature = null;
	void ensureHfXetForRuntime(runtime.pythonBin, `mode:${mode}`);
	console.log(
		`[sidecar] acceleration mode=${mode}; python=${runtime.pythonBin}; runtime=${runtime.runtime}`,
	);
	if (mode === "cuda" && runtime.runtime !== "cuda") {
		await sendToast({
			type: "warning",
			title: "CUDA unavailable",
			message:
				runtime.warning ??
				"CUDA runtime was requested, but current sidecar environment is not CUDA-enabled. Running on CPU.",
		});
	}
	triggerSelectedModelWarmup("acceleration-mode-change");
}

async function installAccelerationRuntime(
	mode: "cuda",
): Promise<InstallAccelerationResult> {
	if (isTranscriptionActive()) {
		throw new Error(
			"Wait for transcription to finish before installing runtime.",
		);
	}
	if (accelerationInstallerState.status === "installing") {
		throw new Error("Runtime installation is already in progress.");
	}

	const existingRuntime = resolveSidecarRuntime(mode);
	if (existingRuntime.runtime === "cuda") {
		sidecar.setPythonBin(existingRuntime.pythonBin);
		hardwareSnapshot = buildHardwareSnapshotForRuntime(existingRuntime.runtime);
		void ensureHfXetForRuntime(
			existingRuntime.pythonBin,
			"install-runtime:existing",
		);
		setAccelerationInstallerState({
			status: "success",
			mode,
			message: "NVIDIA acceleration runtime is already installed.",
		});
		lastWarmupSignature = null;
		triggerSelectedModelWarmup("runtime-install-existing");
		await broadcastSnapshot({ target: "main" });
		return {
			mode,
			status: "installed",
			pythonBin: existingRuntime.pythonBin,
			runtime: existingRuntime.runtime,
		};
	}

	setAccelerationInstallerState({
		status: "installing",
		mode,
		message:
			"Installing NVIDIA acceleration runtime. This can take several minutes.",
	});
	await broadcastSnapshot({ target: "main" });

	try {
		await runAccelerationBootstrapInstall(mode);
		for (const candidate of cudaRuntimeCandidates) {
			runtimeProbeCache.delete(candidate);
		}
		const settings = storage.getSettings();
		await applyAccelerationMode(settings.accelerationMode);

		setAccelerationInstallerState({
			status: "success",
			mode,
			message: "NVIDIA acceleration runtime is installed.",
		});
		await broadcastSnapshot({ target: "main" });
		setTimeout(() => {
			if (accelerationInstallerState.status !== "success") {
				return;
			}
			setAccelerationInstallerState({
				status: "idle",
				mode: null,
				message: "",
			});
			void broadcastSnapshot({ target: "main" });
		}, 3_000);

		return {
			mode,
			status: "installed",
			pythonBin: sidecar.getPythonBin(),
			runtime: hardwareSnapshot.asrRuntime,
		};
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Unknown runtime installation error.";
		setAccelerationInstallerState({
			status: "error",
			mode,
			message,
		});
		await sendToast({
			type: "error",
			title: "Runtime install failed",
			message,
		});
		await broadcastSnapshot({ target: "main" });
		throw error;
	}
}

function getModelForCurrentHardware(modelId: ModelId) {
	return applyHardwareSupportToModels(modelsCache, hardwareSnapshot).find(
		(model) => model.id === modelId,
	);
}

function getUnsupportedModelReason(modelId: ModelId): string | null {
	const model = getModelForCurrentHardware(modelId);
	if (!model || model.hardwareSupport !== "unsupported") {
		return null;
	}
	return model.hardwareReason ?? "Model is not supported on this hardware.";
}

function normalizeHotkey(hotkey: string): string {
	return hotkey.replace(/\s+/g, "").toLowerCase();
}

function configureWindowsDpiAwareness(): void {
	if (process.platform !== "win32" || windowsDpiAwarenessConfigured) {
		return;
	}

	windowsDpiAwarenessConfigured = true;

	try {
		shcoreLibrary = dlopen("shcore.dll", {
			SetProcessDpiAwareness: {
				args: [FFIType.i32],
				returns: FFIType.i32,
			},
		});
		setProcessDpiAwarenessFn = shcoreLibrary.symbols.SetProcessDpiAwareness as (
			awareness: number,
		) => number;
		const result = setProcessDpiAwarenessFn(PROCESS_PER_MONITOR_DPI_AWARE);
		if (result === 0 || result === -2147024891) {
			return;
		}
	} catch (error) {
		console.warn(
			"Failed to set per-monitor DPI awareness via Shcore.",
			error instanceof Error ? error.message : error,
		);
	}

	try {
		if (!user32Library) {
			user32Library = dlopen("user32.dll", {
				GetAsyncKeyState: {
					args: [FFIType.i32],
					returns: FFIType.i16,
				},
				SetProcessDPIAware: {
					args: [],
					returns: FFIType.bool,
				},
			});
		}
		setProcessDPIAwareFn = user32Library.symbols
			.SetProcessDPIAware as () => boolean;
		setProcessDPIAwareFn();
	} catch (error) {
		console.warn(
			"Failed to enable Windows DPI awareness.",
			error instanceof Error ? error.message : error,
		);
	}
}

function ensureWindowsKeyStateApi(): boolean {
	if (process.platform !== "win32") {
		return false;
	}

	if (getAsyncKeyStateFn) {
		return true;
	}

	try {
		user32Library = dlopen("user32.dll", {
			GetAsyncKeyState: {
				args: [FFIType.i32],
				returns: FFIType.i16,
			},
			SetProcessDPIAware: {
				args: [],
				returns: FFIType.bool,
			},
		});
		getAsyncKeyStateFn = user32Library.symbols.GetAsyncKeyState as (
			virtualKey: number,
		) => number;
		setProcessDPIAwareFn = user32Library.symbols
			.SetProcessDPIAware as () => boolean;
		return true;
	} catch (error) {
		console.error(
			"Failed to initialize Windows key state API.",
			error instanceof Error ? error.message : error,
		);
		return false;
	}
}

function isVirtualKeyPressed(virtualKey: number): boolean {
	if (!getAsyncKeyStateFn) {
		return false;
	}
	return (getAsyncKeyStateFn(virtualKey) & 0x8000) === 0x8000;
}

function ensureWindowsWindowStyleApi(): boolean {
	if (process.platform !== "win32") {
		return false;
	}

	if (
		getWindowLongWFn &&
		setWindowLongWFn &&
		setWindowPosFn &&
		showWindowFn &&
		loadImageAFn &&
		sendMessageWFn &&
		setClassLongPtrWFn &&
		destroyIconFn
	) {
		return true;
	}

	try {
		user32WindowLibrary = dlopen("user32.dll", {
			GetWindowLongW: {
				args: [FFIType.ptr, FFIType.i32],
				returns: FFIType.i32,
			},
			SetWindowLongW: {
				args: [FFIType.ptr, FFIType.i32, FFIType.i32],
				returns: FFIType.i32,
			},
			SetWindowPos: {
				args: [
					FFIType.ptr,
					FFIType.ptr,
					FFIType.i32,
					FFIType.i32,
					FFIType.i32,
					FFIType.i32,
					FFIType.u32,
				],
				returns: FFIType.bool,
			},
			ShowWindow: {
				args: [FFIType.ptr, FFIType.i32],
				returns: FFIType.bool,
			},
			LoadImageA: {
				args: [
					FFIType.ptr,
					FFIType.cstring,
					FFIType.u32,
					FFIType.i32,
					FFIType.i32,
					FFIType.u32,
				],
				returns: FFIType.ptr,
			},
			SendMessageW: {
				args: [FFIType.ptr, FFIType.u32, FFIType.u64, FFIType.ptr],
				returns: FFIType.ptr,
			},
			SetClassLongPtrW: {
				args: [FFIType.ptr, FFIType.i32, FFIType.ptr],
				returns: FFIType.ptr,
			},
			DestroyIcon: {
				args: [FFIType.ptr],
				returns: FFIType.bool,
			},
		});
		getWindowLongWFn = user32WindowLibrary.symbols.GetWindowLongW as (
			windowPtr: Pointer,
			index: number,
		) => number;
		setWindowLongWFn = user32WindowLibrary.symbols.SetWindowLongW as (
			windowPtr: Pointer,
			index: number,
			nextValue: number,
		) => number;
		setWindowPosFn = user32WindowLibrary.symbols.SetWindowPos as (
			windowPtr: Pointer,
			insertAfter: Pointer | null,
			x: number,
			y: number,
			width: number,
			height: number,
			flags: number,
		) => boolean;
		showWindowFn = user32WindowLibrary.symbols.ShowWindow as (
			windowPtr: Pointer,
			command: number,
		) => boolean;
		loadImageAFn = user32WindowLibrary.symbols.LoadImageA as (
			instance: Pointer | null,
			name: NodeJS.TypedArray,
			imageType: number,
			width: number,
			height: number,
			flags: number,
		) => Pointer;
		sendMessageWFn = user32WindowLibrary.symbols.SendMessageW as (
			windowPtr: Pointer,
			message: number,
			wParam: number,
			lParam: Pointer | null,
		) => Pointer;
		setClassLongPtrWFn = user32WindowLibrary.symbols.SetClassLongPtrW as (
			windowPtr: Pointer,
			index: number,
			value: Pointer | null,
		) => Pointer;
		destroyIconFn = user32WindowLibrary.symbols.DestroyIcon as (
			iconHandle: Pointer,
		) => boolean;
		return true;
	} catch (error) {
		console.error(
			"Failed to initialize Windows window style API.",
			error instanceof Error ? error.message : error,
		);
		return false;
	}
}

function resolveAppIconPath(): string | null {
	for (const candidate of APP_ICON_CANDIDATE_PATHS) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}
	return null;
}

function loadWindowsIconHandle(iconPath: string, size: number): Pointer | null {
	if (!ensureWindowsWindowStyleApi() || !loadImageAFn) {
		return null;
	}

	const cacheKey = `${iconPath}:${size}`;
	const cachedHandle = loadedWindowIcons.get(cacheKey);
	if (cachedHandle) {
		return cachedHandle;
	}

	const iconHandle = loadImageAFn(
		null,
		Buffer.from(`${iconPath}\0`, "utf8"),
		IMAGE_ICON,
		size,
		size,
		LR_LOADFROMFILE,
	);
	if (!iconHandle) {
		return null;
	}

	loadedWindowIcons.set(cacheKey, iconHandle);
	return iconHandle;
}

function applyWindowIconViaWin32(
	windowRef: BrowserWindow,
	iconPath: string,
): boolean {
	if (
		!ensureWindowsWindowStyleApi() ||
		!sendMessageWFn ||
		!setClassLongPtrWFn
	) {
		return false;
	}

	const smallIcon = loadWindowsIconHandle(iconPath, 16);
	const largeIcon = loadWindowsIconHandle(iconPath, 32) ?? smallIcon;
	if (!smallIcon && !largeIcon) {
		return false;
	}

	if (largeIcon) {
		setClassLongPtrWFn(windowRef.ptr, GCLP_HICON, largeIcon);
		sendMessageWFn(windowRef.ptr, WM_SETICON, ICON_BIG, largeIcon);
	}
	if (smallIcon) {
		setClassLongPtrWFn(windowRef.ptr, GCLP_HICONSM, smallIcon);
		sendMessageWFn(windowRef.ptr, WM_SETICON, ICON_SMALL, smallIcon);
		sendMessageWFn(windowRef.ptr, WM_SETICON, ICON_SMALL2, smallIcon);
	}
	setWindowPosFn?.(
		windowRef.ptr,
		null,
		0,
		0,
		0,
		0,
		SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
	);
	return true;
}

function ensureNativeWindowIconApi(): boolean {
	if (setNativeWindowIconFn) {
		return true;
	}

	try {
		const nativeWrapperPath = join(process.cwd(), `libNativeWrapper.${suffix}`);
		nativeWindowIconLibrary = dlopen(nativeWrapperPath, {
			setWindowIcon: {
				args: [FFIType.ptr, FFIType.cstring],
				returns: FFIType.void,
			},
		});
		setNativeWindowIconFn = nativeWindowIconLibrary.symbols.setWindowIcon as (
			windowPtr: Pointer,
			iconPath: NodeJS.TypedArray,
		) => void;
		return true;
	} catch (error) {
		console.error(
			"Failed to initialize native window icon API.",
			error instanceof Error ? error.message : error,
		);
		return false;
	}
}

function applyWindowIcon(windowRef: BrowserWindow): void {
	if (process.platform !== "win32") {
		return;
	}

	const iconPath = resolveAppIconPath();
	if (!iconPath) {
		return;
	}

	try {
		if (
			iconPath.toLowerCase().endsWith(".ico") &&
			applyWindowIconViaWin32(windowRef, iconPath)
		) {
			return;
		}
		if (!ensureNativeWindowIconApi() || !setNativeWindowIconFn) {
			return;
		}
		setNativeWindowIconFn(windowRef.ptr, Buffer.from(`${iconPath}\0`, "utf8"));
	} catch (error) {
		console.error(
			`Failed to set window icon from ${iconPath}.`,
			error instanceof Error ? error.message : error,
		);
	}
}

function hideNativePillWindow(windowRef: BrowserWindow): void {
	if (process.platform !== "win32") {
		windowRef.setFrame(-10_000, -10_000, PILL_WINDOW_WIDTH, PILL_WINDOW_HEIGHT);
		return;
	}

	if (!ensureWindowsWindowStyleApi() || !showWindowFn) {
		windowRef.setFrame(-10_000, -10_000, PILL_WINDOW_WIDTH, PILL_WINDOW_HEIGHT);
		return;
	}

	showWindowFn(windowRef.ptr, SW_HIDE);
}

function showNativePillWindow(windowRef: BrowserWindow): void {
	if (process.platform !== "win32") {
		return;
	}

	if (!ensureWindowsWindowStyleApi() || !showWindowFn) {
		return;
	}

	showWindowFn(windowRef.ptr, SW_SHOWNA);
}

function configureWindowsPillWindow(windowRef: BrowserWindow): void {
	if (process.platform !== "win32") {
		return;
	}

	if (
		!ensureWindowsWindowStyleApi() ||
		!getWindowLongWFn ||
		!setWindowLongWFn ||
		!setWindowPosFn
	) {
		return;
	}

	const currentExtendedStyle = getWindowLongWFn(windowRef.ptr, GWL_EXSTYLE) | 0;
	const nextExtendedStyle =
		((currentExtendedStyle | WS_EX_TOOLWINDOW) & ~WS_EX_APPWINDOW) | 0;

	hideNativePillWindow(windowRef);

	if (nextExtendedStyle !== currentExtendedStyle) {
		setWindowLongWFn(windowRef.ptr, GWL_EXSTYLE, nextExtendedStyle);
	}

	setWindowPosFn(
		windowRef.ptr,
		null,
		0,
		0,
		0,
		0,
		SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
	);
}

function stopModifierHotkeyPolling(): void {
	if (modifierHotkeyTimer) {
		clearInterval(modifierHotkeyTimer);
		modifierHotkeyTimer = null;
	}
	if (modifierHotkeyWasDown) {
		void stopHoldToTalkTranscription("global-hotkey");
	}
	modifierHotkeyWasDown = false;
}

function startModifierHotkeyPolling(): boolean {
	stopModifierHotkeyPolling();
	if (!ensureWindowsKeyStateApi()) {
		return false;
	}

	modifierHotkeyTimer = setInterval(() => {
		const ctrlDown =
			isVirtualKeyPressed(VK_CONTROL) ||
			isVirtualKeyPressed(VK_LCONTROL) ||
			isVirtualKeyPressed(VK_RCONTROL);
		const shiftDown =
			isVirtualKeyPressed(VK_SHIFT) ||
			isVirtualKeyPressed(VK_LSHIFT) ||
			isVirtualKeyPressed(VK_RSHIFT);
		const comboDown = ctrlDown && shiftDown;

		if (comboDown && !modifierHotkeyWasDown) {
			const now = Date.now();
			if (now - lastModifierHotkeyAt > MODIFIER_HOTKEY_REARM_MS) {
				lastModifierHotkeyAt = now;
				void startHoldToTalkTranscription("global-hotkey");
			}
		}
		if (!comboDown && modifierHotkeyWasDown) {
			void stopHoldToTalkTranscription("global-hotkey");
		}

		modifierHotkeyWasDown = comboDown;
	}, MODIFIER_HOTKEY_POLL_MS);

	return true;
}

function clampLevel(value: number): number {
	if (!Number.isFinite(value)) {
		return 0;
	}
	if (value <= 0) {
		return 0;
	}
	if (value >= 1) {
		return 1;
	}
	return value;
}

function resetMicLevelState(): void {
	liveMicLevel = 0;
	smoothedMicLevel = 0;
	adaptiveMicPeak = MIC_LEVEL_AGC_FLOOR;
	lastMicLevelAt = 0;
}

function createPillFrame(level: number, atMs: number): PillFramePayload {
	return {
		state: currentPill.state,
		visible: currentPill.visible,
		durationMs: currentPill.durationMs,
		level: clampLevel(level),
		atMs,
	};
}

async function getMainViewUrl(): Promise<string> {
	const channel = await Updater.localInfo.channel();
	if (channel === "dev") {
		try {
			await fetch(DEV_SERVER_URL, { method: "HEAD" });
			console.log(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`);
			return DEV_SERVER_URL;
		} catch {
			console.log(
				"Vite dev server not running. Run 'bun run dev:hmr' for HMR support.",
			);
		}
	}

	return "views://mainview/index.html";
}

function withViewQuery(url: string, view: "main" | "pill"): string {
	const separator = url.includes("?") ? "&" : "?";
	return `${url}${separator}view=${view}`;
}

function getSnapshot(): AppSnapshot {
	try {
		const settings = storage.getSettings();
		const modelsForHardware = applyHardwareSupportToModels(
			modelsCache,
			hardwareSnapshot,
		);
		return {
			pillState: currentPill.state,
			pill: { ...currentPill },
			settings,
			models: modelsForHardware,
			modelRuntimeById: buildModelRuntimeById(settings, modelsForHardware),
			warmup: warmupState,
			hardware: hardwareSnapshot,
			accelerationInstaller: accelerationInstallerState,
			modelProgressById,
			sidecarStatus: sidecar.getStatus(),
			lastJob: lastJobCache,
			recentJobs: recentJobsCache,
		};
	} catch (error) {
		console.error(
			"[snapshot] failed to build snapshot:",
			error instanceof Error ? (error.stack ?? error.message) : error,
		);
		throw error;
	}
}

function getWindowRpc(windowRef: BrowserWindow | null): WindowRpc | null {
	if (!windowRef) {
		return null;
	}

	return windowRef.webview.rpc as unknown as WindowRpc;
}

function getWindowRpcs(target: "all" | "main" | "pill" = "all"): WindowRpc[] {
	if (target === "main") {
		return [getWindowRpc(mainWindow)].filter(Boolean) as WindowRpc[];
	}
	if (target === "pill") {
		return [getWindowRpc(pillWindow)].filter(Boolean) as WindowRpc[];
	}

	return [getWindowRpc(mainWindow), getWindowRpc(pillWindow)].filter(
		Boolean,
	) as WindowRpc[];
}

async function broadcastSnapshot(options?: {
	target?: "all" | "main" | "pill";
}): Promise<void> {
	const snapshot = getSnapshot();
	const rpcs = getWindowRpcs(options?.target ?? "all");
	const results = await Promise.allSettled(
		rpcs.map((rpc) => Promise.resolve(rpc.send.snapshotUpdated(snapshot))),
	);
	results.forEach((result, index) => {
		if (result.status === "rejected") {
			console.error(
				`[snapshot] push failed for window #${index}:`,
				result.reason,
			);
		}
	});
}

async function sendPillFrame(level: number, atMs = Date.now()): Promise<void> {
	const rpc = getWindowRpc(pillWindow);
	if (!rpc) {
		return;
	}
	const frame = createPillFrame(level, atMs);
	try {
		await Promise.resolve(rpc.send.pillFrameUpdated(frame));
	} catch (error) {
		console.error("[pill-frame] push failed:", error);
	}
}

async function sendToast(payload: ToastPayload): Promise<void> {
	if (payload.type === "error" || payload.type === "warning") {
		Utils.showNotification({
			title: payload.title,
			body: payload.message,
			silent: false,
		});
	}

	const rpcs = getWindowRpcs();
	const results = await Promise.allSettled(
		rpcs.map((rpc) => Promise.resolve(rpc.send.toast(payload))),
	);
	results.forEach((result, index) => {
		if (result.status === "rejected") {
			console.error(`[toast] push failed for window #${index}:`, result.reason);
		}
	});
}

function getDisplayForCursor() {
	const cursor = Screen.getCursorScreenPoint();
	const displays = Screen.getAllDisplays();
	const hitDisplay = displays.find((display) => {
		const x2 = display.bounds.x + display.bounds.width;
		const y2 = display.bounds.y + display.bounds.height;
		return (
			cursor.x >= display.bounds.x &&
			cursor.x <= x2 &&
			cursor.y >= display.bounds.y &&
			cursor.y <= y2
		);
	});
	return hitDisplay ?? Screen.getPrimaryDisplay();
}

function positionPillWindow(): void {
	const windowRef = ensurePillWindow();
	if (!windowRef) {
		return;
	}

	const display = getDisplayForCursor();
	const x = Math.round(
		display.workArea.x + (display.workArea.width - PILL_WINDOW_WIDTH) / 2,
	);
	const y = Math.round(
		display.workArea.y +
			display.workArea.height -
			PILL_WINDOW_HEIGHT -
			PILL_WINDOW_BOTTOM_MARGIN,
	);
	windowRef.setFrame(x, y, PILL_WINDOW_WIDTH, PILL_WINDOW_HEIGHT);
	showNativePillWindow(windowRef);
}

function hidePillWindow(): void {
	if (!pillWindow) {
		return;
	}
	hideNativePillWindow(pillWindow);
}

function stopRecordingTicker(): void {
	if (!recordingTicker) {
		return;
	}
	clearInterval(recordingTicker);
	recordingTicker = null;
	resetMicLevelState();
}

function getSmoothedMicLevel(now: number): number {
	const hasRecentLevel =
		lastMicLevelAt > 0 && now - lastMicLevelAt <= MIC_LEVEL_STALE_MS;
	const target = hasRecentLevel ? liveMicLevel : 0;
	adaptiveMicPeak = Math.max(
		MIC_LEVEL_AGC_FLOOR,
		target,
		adaptiveMicPeak * MIC_LEVEL_AGC_DECAY,
	);
	const agcTarget =
		target <= 0
			? 0
			: clampLevel((target / adaptiveMicPeak) * MIC_LEVEL_AGC_HEADROOM);
	const boostedTarget = clampLevel(
		agcTarget ** MIC_LEVEL_VISUAL_CURVE * MIC_LEVEL_VISUAL_GAIN,
	);
	const alpha =
		boostedTarget >= smoothedMicLevel
			? MIC_LEVEL_ATTACK_ALPHA
			: MIC_LEVEL_RELEASE_ALPHA;
	smoothedMicLevel = clampLevel(
		smoothedMicLevel + (boostedTarget - smoothedMicLevel) * alpha,
	);
	if (smoothedMicLevel < 0.001) {
		smoothedMicLevel = 0;
	}
	return smoothedMicLevel;
}

async function updatePill(
	next: Partial<AppSnapshot["pill"]>,
	options?: { target?: "all" | "main" | "pill" },
): Promise<void> {
	currentPill = {
		...currentPill,
		...next,
	};

	if (currentPill.visible) {
		positionPillWindow();
	} else {
		hidePillWindow();
	}
	await broadcastSnapshot({ target: options?.target ?? "all" });
	await sendPillFrame(currentPill.state === "recording" ? smoothedMicLevel : 0);
}

async function setPillState(next: RecordingPillState): Promise<void> {
	await updatePill({
		state: next,
		visible: next !== "hidden",
	});
}

function schedulePillHide(): void {
	if (hidePillTimer) {
		clearTimeout(hidePillTimer);
	}
	hidePillTimer = setTimeout(() => {
		stopRecordingTicker();
		void updatePill({
			state: "hidden",
			visible: false,
			durationMs: 0,
		});
	}, PILL_HIDE_DELAY_MS);
}

function startRecordingPill(): void {
	stopRecordingTicker();
	resetMicLevelState();
	recordingStartedAt = Date.now();
	void updatePill({
		state: "recording",
		visible: true,
		durationMs: 0,
	});

	recordingTicker = setInterval(() => {
		if (currentPill.state !== "recording" || !currentPill.visible) {
			return;
		}
		const now = Date.now();
		const durationMs = now - recordingStartedAt;
		currentPill = {
			...currentPill,
			durationMs,
		};
		void sendPillFrame(getSmoothedMicLevel(now), now);
	}, PILL_FRAME_INTERVAL_MS);
}

async function setTranscribingPill(): Promise<void> {
	stopRecordingTicker();
	await updatePill({
		state: "transcribing",
		visible: true,
	});
}

function createInitialJob(modelId: ModelId, source: string): JobRecord {
	const now = new Date().toISOString();
	return {
		id: randomUUID(),
		status: "recording",
		modelId,
		createdAt: now,
		updatedAt: now,
		detail: `source=${source}; mode=microphone`,
		transcript: "",
	};
}

function finalizeJob(
	job: JobRecord,
	next: Pick<JobRecord, "status" | "detail"> &
		Partial<Pick<JobRecord, "transcript">>,
): JobRecord {
	const updatedAt = new Date().toISOString();
	const transcript = next.transcript ?? job.transcript;
	storage.updateJob(job.id, {
		status: next.status,
		updatedAt,
		detail: next.detail,
		transcript,
	});
	const updatedJob = {
		...job,
		status: next.status,
		updatedAt,
		detail: next.detail,
		transcript,
	};
	updateJobCache(updatedJob);
	return updatedJob;
}

function isNoSpeechErrorMessage(message: string): boolean {
	const normalized = message.toLowerCase();
	return NO_SPEECH_PATTERNS.some((pattern) => normalized.includes(pattern));
}

async function completeTranscription(
	job: JobRecord,
	sidecarResult: { text: string; latencyMs: number },
): Promise<TranscriptionResult> {
	stopRecordingTicker();
	const settings = storage.getSettings();
	const paste = settings.autoPasteEnabled
		? await autoPasteText(sidecarResult.text, settings.pasteRetryCount)
		: { status: "success" as const, preservedInClipboard: true as const };

	const isSuccess = paste.status === "success";
	const completedJob = finalizeJob(job, {
		status: isSuccess ? "pasted" : "failed",
		detail: isSuccess
			? "Transcription pasted."
			: `Paste failed: ${paste.reason ?? "unknown"}`,
		transcript: sidecarResult.text,
	});

	await setPillState(isSuccess ? "success" : "failure");
	if (!isSuccess) {
		await sendToast({
			type: "error",
			title: "Paste failed",
			message:
				paste.reason ?? "Auto-paste failed. Transcript is still in clipboard.",
		});
	}
	schedulePillHide();
	await broadcastSnapshot();

	return {
		job: completedJob,
		transcript: sidecarResult.text,
		paste: {
			status: paste.status,
			reason: paste.reason,
			preservedInClipboard: true,
		},
		latencyMs: sidecarResult.latencyMs,
	};
}

async function failTranscription(
	job: JobRecord,
	error: unknown,
): Promise<TranscriptionResult> {
	const message =
		error instanceof Error ? error.message : "Unknown sidecar error.";
	const noSpeechDetected = isNoSpeechErrorMessage(message);
	const completedJob = finalizeJob(job, {
		status: "failed",
		detail: message,
		transcript: "",
	});
	stopRecordingTicker();
	await setPillState("failure");
	await sendToast({
		type: noSpeechDetected ? "warning" : "error",
		title: noSpeechDetected ? "No speech detected" : "Transcription failed",
		message: noSpeechDetected
			? "Try again and speak a little louder."
			: message,
	});
	schedulePillHide();
	await broadcastSnapshot();
	return {
		job: completedJob,
		transcript: "",
		paste: {
			status: "failure",
			reason: message,
			preservedInClipboard: true,
		},
		latencyMs: 0,
	};
}

async function runMicrophoneTranscription(
	source: string,
	durationSeconds = DEFAULT_MIC_DURATION_SECONDS,
): Promise<TranscriptionResult> {
	if (isTranscriptionActive()) {
		throw new Error("A transcription is already in progress.");
	}

	isOneShotTranscriptionActive = true;
	const settings = storage.getSettings();
	const modelId = settings.defaultModelId;
	const unsupportedReason = getUnsupportedModelReason(modelId);
	if (unsupportedReason) {
		await sendToast({
			type: "error",
			title: "Model not supported",
			message: unsupportedReason,
		});
		throw new Error(unsupportedReason);
	}
	const clampedDuration = Math.max(
		2,
		Math.min(20, Math.round(durationSeconds)),
	);
	const job = createInitialJob(modelId, source);
	storage.insertJob(job);
	updateJobCache(job);
	startRecordingPill();

	try {
		const sidecarPromise = sidecar.transcribeMicrophone(
			modelId,
			clampedDuration,
		);
		const raceResult = await Promise.race([
			sidecarPromise.then((result) => ({ done: true as const, result })),
			sleep(clampedDuration * 1000).then(() => ({ done: false as const })),
		]);

		if (!raceResult.done) {
			finalizeJob(job, {
				status: "transcribing",
				detail: `source=${source}; mode=microphone; stage=transcribing`,
			});
			await setTranscribingPill();
			const sidecarResult = await sidecarPromise;
			return completeTranscription(job, sidecarResult);
		}

		return completeTranscription(job, raceResult.result);
	} catch (error) {
		return failTranscription(job, error);
	} finally {
		isOneShotTranscriptionActive = false;
	}
}

async function startHoldToTalkTranscription(source: string): Promise<void> {
	if (isTranscriptionActive()) {
		return;
	}

	const settings = storage.getSettings();
	const modelId = settings.defaultModelId;
	const unsupportedReason = getUnsupportedModelReason(modelId);
	if (unsupportedReason) {
		await sendToast({
			type: "error",
			title: "Model not supported",
			message: unsupportedReason,
		});
		return;
	}
	const job = createInitialJob(modelId, source);
	storage.insertJob(job);
	updateJobCache(job);
	activeHoldToTalkJob = job;
	startRecordingPill();
	await broadcastSnapshot({ target: "main" });

	try {
		await sidecar.startMicrophoneCapture();
	} catch (error) {
		if (activeHoldToTalkJob?.id === job.id) {
			activeHoldToTalkJob = null;
			await failTranscription(job, error);
		}
	}
}

async function stopHoldToTalkTranscription(source: string): Promise<void> {
	const job = activeHoldToTalkJob;
	if (!job) {
		return;
	}
	activeHoldToTalkJob = null;

	finalizeJob(job, {
		status: "transcribing",
		detail: `source=${source}; mode=microphone; stage=transcribing`,
	});
	await setTranscribingPill();

	try {
		const result = await sidecar.finishMicrophoneCapture(job.modelId);
		await completeTranscription(job, result);
	} catch (error) {
		await failTranscription(job, error);
	}
}

async function prepareModel(modelId: ModelId): Promise<PrepareModelResult> {
	const unsupportedReason = getUnsupportedModelReason(modelId);
	if (unsupportedReason) {
		await sendToast({
			type: "error",
			title: "Model not supported",
			message: unsupportedReason,
		});
		throw new Error(unsupportedReason);
	}

	console.log(`[model] prepare requested for ${modelId}`);
	storage.setModelStatus(modelId, {
		installed: false,
		status: "downloading",
	});
	setModelProgress(modelId, {
		operation: "download",
		stage: "queued",
		message: "Preparing model download...",
		progress: 0,
		downloadedBytes: 0,
		totalBytes: null,
		updatedAt: new Date().toISOString(),
	});
	refreshModelsCache();
	await broadcastSnapshot();

	try {
		const result = await sidecar.prepareModel(modelId);
		console.log(
			`[model] prepare completed for ${modelId} in ${result.latencyMs}ms`,
		);
		setModelProgress(modelId, {
			operation: "download",
			stage: "installed",
			message: "Model is ready.",
			progress: 1,
			downloadedBytes: modelProgressById[modelId]?.downloadedBytes ?? null,
			totalBytes: modelProgressById[modelId]?.totalBytes ?? null,
			updatedAt: new Date().toISOString(),
		});
		storage.setModelStatus(modelId, {
			installed: true,
			status: "installed",
		});
		refreshModelsCache();
		if (storage.getSettings().defaultModelId === modelId) {
			lastWarmupSignature = buildWarmupSignature(modelId);
			setWarmupState({
				state: "ready",
				modelId,
				detail: `${getModelLabel(modelId)} is warm and ready.`,
			});
		}
		await broadcastSnapshot();
		setModelProgress(modelId, null);
		return {
			modelId,
			status: "installed",
			latencyMs: result.latencyMs,
		};
	} catch (error) {
		console.error(
			`[model] prepare failed for ${modelId}:`,
			error instanceof Error ? (error.stack ?? error.message) : error,
		);
		storage.setModelStatus(modelId, {
			installed: false,
			status: "error",
		});
		if (storage.getSettings().defaultModelId === modelId) {
			lastWarmupSignature = null;
			setWarmupState({
				state: "error",
				modelId,
				detail:
					error instanceof Error ? error.message : "Model preparation failed.",
			});
		}
		setModelProgress(modelId, {
			operation: "download",
			stage: "error",
			message:
				error instanceof Error
					? error.message
					: "Unknown model preparation error.",
			progress: modelProgressById[modelId]?.progress ?? null,
			downloadedBytes: modelProgressById[modelId]?.downloadedBytes ?? null,
			totalBytes: modelProgressById[modelId]?.totalBytes ?? null,
			updatedAt: new Date().toISOString(),
		});
		refreshModelsCache();
		await sendToast({
			type: "error",
			title: "Model download failed",
			message:
				error instanceof Error
					? error.message
					: "Unknown error while preparing model.",
		});
		await broadcastSnapshot();
		setModelProgress(modelId, null);
		throw error;
	}
}

function resolveDefaultModelAfterDelete(deletedModelId: ModelId): ModelId {
	const installedFallback = modelsCache.find(
		(model) =>
			model.id !== deletedModelId &&
			model.installed &&
			model.status === "installed",
	)?.id;
	if (installedFallback) {
		return installedFallback;
	}

	if (deletedModelId !== DEFAULT_MODEL_ID) {
		return DEFAULT_MODEL_ID;
	}

	const firstAlternative = modelsCache.find(
		(model) => model.id !== deletedModelId,
	)?.id;
	return firstAlternative ?? DEFAULT_MODEL_ID;
}

async function deleteModel(modelId: ModelId): Promise<DeleteModelResult> {
	if (isTranscriptionActive()) {
		throw new Error(
			"Wait for transcription to finish before deleting a model.",
		);
	}

	console.log(`[model] delete requested for ${modelId}`);
	storage.setModelStatus(modelId, {
		installed: true,
		status: "deleting",
	});
	refreshModelsCache();
	await broadcastSnapshot();

	try {
		const result = await sidecar.deleteModel(modelId);
		console.log(
			`[model] delete completed for ${modelId} in ${result.latencyMs}ms (removed_paths=${result.removedPaths.length})`,
		);
		storage.setModelStatus(modelId, {
			installed: false,
			status: "not_installed",
		});
		const settings = storage.getSettings();
		if (settings.defaultModelId === modelId) {
			storage.updateSettings({
				defaultModelId: resolveDefaultModelAfterDelete(modelId),
			});
		}
		refreshModelsCache();
		if (warmupState.modelId === modelId) {
			lastWarmupSignature = null;
		}
		triggerSelectedModelWarmup("model-delete");
		await broadcastSnapshot();
		return {
			modelId,
			status: "deleted",
			latencyMs: result.latencyMs,
			removedPaths: result.removedPaths,
		};
	} catch (error) {
		console.error(
			`[model] delete failed for ${modelId}:`,
			error instanceof Error ? (error.stack ?? error.message) : error,
		);
		storage.setModelStatus(modelId, {
			installed: true,
			status: "installed",
		});
		refreshModelsCache();
		await sendToast({
			type: "error",
			title: "Model delete failed",
			message:
				error instanceof Error
					? error.message
					: "Unknown error while deleting model.",
		});
		await broadcastSnapshot();
		throw error;
	}
}

function registerGlobalHotkey(hotkey: string): boolean {
	GlobalShortcut.unregisterAll();
	const accelerator = hotkey.trim() || FALLBACK_HOTKEY;
	const normalized = normalizeHotkey(accelerator);

	if (normalized === "ctrl+shift" || normalized === "control+shift") {
		const isRegistered = startModifierHotkeyPolling();
		if (!isRegistered) {
			console.error("Failed to register modifier-only hotkey: Ctrl+Shift");
		}
		return isRegistered;
	}

	stopModifierHotkeyPolling();
	const isRegistered = GlobalShortcut.register(accelerator, () => {
		void runMicrophoneTranscription("global-hotkey").catch((error) => {
			console.error(
				"[transcription] global hotkey request failed:",
				error instanceof Error ? error.message : error,
			);
		});
	});

	if (!isRegistered) {
		console.error(`Failed to register hotkey: ${accelerator}`);
	}
	return isRegistered;
}

function createWindowRpc(windowName: "main" | "pill") {
	return BrowserView.defineRPC<DictateRPC>({
		handlers: {
			requests: {
				getSnapshot: () => {
					console.log(`[rpc:${windowName}] getSnapshot request received`);
					const snapshot = getSnapshot();
					console.log(
						`[rpc:${windowName}] getSnapshot response ready (models=${snapshot.models.length}, sidecar=${snapshot.sidecarStatus})`,
					);
					return snapshot;
				},
				updateSettings: async (next) =>
					enqueueSettingsUpdate(async () => {
						const previous = storage.getSettings();
						const merged = storage.updateSettings(next);
						if (previous.hotkey !== merged.hotkey) {
							registerGlobalHotkey(merged.hotkey);
						}
						if (previous.accelerationMode !== merged.accelerationMode) {
							if (isTranscriptionActive()) {
								storage.updateSettings({
									accelerationMode: previous.accelerationMode,
								});
								throw new Error(
									"Wait for the current transcription to finish before changing ASR acceleration.",
								);
							}
							await applyAccelerationMode(merged.accelerationMode);
						}
						if (previous.launchOnStartup !== merged.launchOnStartup) {
							try {
								applyLaunchOnStartupPreference(merged.launchOnStartup);
							} catch (error) {
								storage.updateSettings({
									launchOnStartup: previous.launchOnStartup,
								});
								const message =
									error instanceof Error
										? error.message
										: "Unknown startup registration error.";
								await sendToast({
									type: "error",
									title: "Launch on startup failed",
									message,
								});
								throw error;
							}
						}
						await broadcastSnapshot();
						return merged;
					}),
				setDefaultModel: ({ modelId }) => {
					storage.updateSettings({ defaultModelId: modelId });
					lastWarmupSignature = null;
					triggerSelectedModelWarmup("default-model-change");
					void broadcastSnapshot();
					return getSnapshot();
				},
				runMicrophoneTranscription: async ({ durationSeconds }) =>
					runMicrophoneTranscription(
						"settings-window",
						durationSeconds ?? DEFAULT_MIC_DURATION_SECONDS,
					),
				prepareModel: async ({ modelId }) => prepareModel(modelId),
				deleteModel: async ({ modelId }) => deleteModel(modelId),
				installAccelerationRuntime: async ({ mode }) =>
					installAccelerationRuntime(mode),
				windowControl: ({ action }) => {
					if (windowName !== "main" || !mainWindow) {
						return { maximized: false };
					}

					if (action === "minimize") {
						mainWindow.minimize();
						return { maximized: mainWindow.isMaximized() };
					}

					if (action === "toggleMaximize") {
						if (mainWindow.isMaximized()) {
							mainWindow.unmaximize();
						} else {
							mainWindow.maximize();
						}
						return { maximized: mainWindow.isMaximized() };
					}

					if (action === "close") {
						mainWindow.close();
						return { maximized: false };
					}

					return { maximized: mainWindow.isMaximized() };
				},
			},
			messages: {
				logClientEvent: ({ message }) => {
					console.log(`[renderer:${windowName}] ${message}`);
				},
			},
		},
	});
}

const mainRpc = createWindowRpc("main");
const pillRpc = createWindowRpc("pill");

function createTray(): Tray {
	const appTray = new Tray({
		title: "Dictate",
	});

	appTray.setMenu([
		{ type: "normal", label: "Open Dictate", action: "open" },
		{ type: "normal", label: "Start Dictation", action: "dictate" },
		{ type: "divider" },
		{ type: "normal", label: "Quit", action: "quit" },
	]);

	appTray.on("tray-clicked", (event: unknown) => {
		const action = (event as { data?: { action?: string } }).data?.action;
		if (action === "open") {
			focusOrCreateMainWindow();
			return;
		}

		if (action === "dictate") {
			void runMicrophoneTranscription("tray-menu").catch((error) => {
				console.error(
					"[transcription] tray request failed:",
					error instanceof Error ? error.message : error,
				);
			});
			return;
		}

		if (action === "quit") {
			shuttingDown = true;
			Utils.quit();
		}
	});

	return appTray;
}

function syncWindowFrameToContentBounds(
	windowRef: BrowserWindow,
	minimumWidth: number,
	minimumHeight: number,
): void {
	const { x, y, width, height } = windowRef.getFrame();
	const nextWidth = Math.max(width, minimumWidth);
	const nextHeight = Math.max(height, minimumHeight);

	windowRef.setFrame(x, y, nextWidth, nextHeight + 1);
	setTimeout(() => {
		windowRef.setFrame(x, y, nextWidth, nextHeight);
		windowRef.webview.executeJavascript(
			"window.dispatchEvent(new Event('resize'));",
		);
	}, 0);
}

function createMainWindow(viewUrl: string): BrowserWindow {
	const minimumWidth = 980;
	const minimumHeight = 820;
	const windowRef = new BrowserWindow({
		title: "Dictate",
		url: withViewQuery(viewUrl, "main"),
		rpc: mainRpc,
		frame: {
			width: 1160,
			height: 900,
			x: 160,
			y: 100,
		},
	});

	// On Windows with native chrome, force one post-create frame sync so the
	// default BrowserView does not wait for a manual resize before using the
	// correct client bounds.
	if (process.platform === "win32") {
		setTimeout(() => {
			syncWindowFrameToContentBounds(windowRef, minimumWidth, minimumHeight);
		}, 0);
		setTimeout(() => {
			applyWindowIcon(windowRef);
		}, 0);

		const resyncContentBounds = () => {
			syncWindowFrameToContentBounds(windowRef, minimumWidth, minimumHeight);
		};

		windowRef.webview.on("dom-ready", () => {
			setTimeout(resyncContentBounds, 0);
			setTimeout(resyncContentBounds, 120);
			setTimeout(() => {
				applyWindowIcon(windowRef);
			}, 0);
		});
	}

	windowRef.on("resize", () => {
		const frame = windowRef.getFrame();
		const nextWidth = Math.max(frame.width, minimumWidth);
		const nextHeight = Math.max(frame.height, minimumHeight);
		if (nextWidth !== frame.width || nextHeight !== frame.height) {
			windowRef.setSize(nextWidth, nextHeight);
		}
	});

	windowRef.on("close", () => {
		if (mainWindow?.id === windowRef.id) {
			mainWindow = null;
		}
	});

	applyWindowIcon(windowRef);

	return windowRef;
}

function focusOrCreateMainWindow(): void {
	if (mainWindow) {
		if (mainWindow.isMinimized()) {
			mainWindow.unminimize();
		}
		mainWindow.focus();
		return;
	}

	if (!mainViewUrl) {
		console.error("[window] cannot create main window before bootstrap.");
		return;
	}

	mainWindow = createMainWindow(mainViewUrl);
}

function createPillWindow(mainUrl: string): BrowserWindow {
	const windowRef = new BrowserWindow({
		title: "Dictate Pill",
		url: withViewQuery(mainUrl, "pill"),
		rpc: pillRpc,
		transparent: true,
		titleBarStyle: "hidden",
		styleMask: {
			Borderless: true,
			Titled: false,
			Closable: false,
			Miniaturizable: false,
			Resizable: false,
			NonactivatingPanel: true,
			UtilityWindow: true,
			FullSizeContentView: true,
		},
		frame: {
			x: -10_000,
			y: -10_000,
			width: PILL_WINDOW_WIDTH,
			height: PILL_WINDOW_HEIGHT,
		},
	});
	windowRef.setAlwaysOnTop(true);
	configureWindowsPillWindow(windowRef);
	hideNativePillWindow(windowRef);
	return windowRef;
}

function ensurePillWindow(): BrowserWindow | null {
	if (pillWindow) {
		return pillWindow;
	}

	if (!mainViewUrl) {
		console.error("[window] cannot create pill window before bootstrap.");
		return null;
	}

	pillWindow = createPillWindow(mainViewUrl);
	return pillWindow;
}

async function bootstrap(): Promise<void> {
	mainViewUrl = await getMainViewUrl();
	if (!isAutoStartLaunch) {
		mainWindow = createMainWindow(mainViewUrl);
	} else {
		console.log(
			"[startup] autostart launch detected; main window stays hidden.",
		);
	}
	trayRef = createTray();

	const settings = storage.getSettings();
	try {
		applyLaunchOnStartupPreference(settings.launchOnStartup);
	} catch (error) {
		console.error(
			"[startup] failed to sync launch-on-startup preference:",
			error instanceof Error ? error.message : error,
		);
	}
	registerGlobalHotkey(settings.hotkey || FALLBACK_HOTKEY);
	const managedRuntimes = [
		sidecarVenvLegacyPython,
		sidecarVenvCpuPython,
		sidecarVenvCudaPython,
	];
	for (const runtimePython of managedRuntimes) {
		if (!commandExists(runtimePython)) {
			continue;
		}
		void ensureHfXetForRuntime(runtimePython, "startup");
	}
	void ensureHfXetForRuntime(initialRuntime.pythonBin, "startup:active");
	await broadcastSnapshot();
	setTimeout(() => {
		triggerSelectedModelWarmup("startup");
	}, MODEL_WARMUP_BOOT_DELAY_MS);

	console.log("Dictate MVP started.");
}

Electrobun.events.on("before-quit", () => {
	if (shuttingDown) {
		return;
	}
	shuttingDown = true;
	if (hidePillTimer) {
		clearTimeout(hidePillTimer);
		hidePillTimer = null;
	}
	stopRecordingTicker();
	GlobalShortcut.unregisterAll();
	stopModifierHotkeyPolling();
	if (user32Library) {
		user32Library.close();
		user32Library = null;
		getAsyncKeyStateFn = null;
		setProcessDPIAwareFn = null;
	}
	if (shcoreLibrary) {
		shcoreLibrary.close();
		shcoreLibrary = null;
		setProcessDpiAwarenessFn = null;
	}
	if (user32WindowLibrary) {
		if (destroyIconFn) {
			for (const iconHandle of loadedWindowIcons.values()) {
				destroyIconFn(iconHandle);
			}
			loadedWindowIcons.clear();
		}
		user32WindowLibrary.close();
		user32WindowLibrary = null;
		getWindowLongWFn = null;
		setWindowLongWFn = null;
		setWindowPosFn = null;
		showWindowFn = null;
		loadImageAFn = null;
		sendMessageWFn = null;
		setClassLongPtrWFn = null;
		destroyIconFn = null;
	}
	if (nativeWindowIconLibrary) {
		nativeWindowIconLibrary.close();
		nativeWindowIconLibrary = null;
		setNativeWindowIconFn = null;
	}
	sidecar.stop();
	storage.close();
	if (trayRef) {
		trayRef = null;
	}
	if (pillWindow) {
		pillWindow.close();
		pillWindow = null;
	}
	if (mainWindow) {
		mainWindow = null;
	}
});

configureWindowsDpiAwareness();
void bootstrap();
