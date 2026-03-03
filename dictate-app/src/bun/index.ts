import { dlopen, FFIType, type Library } from "bun:ffi";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
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
import type { ModelId } from "../shared/models";
import type {
	AppSnapshot,
	DictateRPC,
	JobRecord,
	PrepareModelResult,
	RecordingPillState,
	ToastPayload,
	TranscriptionResult,
} from "../shared/rpc";
import { autoPasteText } from "./autopaste";
import { SidecarClient } from "./sidecar";
import { DictateStorage } from "./storage";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;
const DEFAULT_MIC_DURATION_SECONDS = 7;
const FALLBACK_HOTKEY = "Ctrl+Shift";
const PILL_WINDOW_WIDTH = 460;
const PILL_WINDOW_HEIGHT = 72;
const PILL_WINDOW_BOTTOM_MARGIN = 22;
const PILL_HIDE_DELAY_MS = 1300;
const MODIFIER_HOTKEY_POLL_MS = 30;
const MODIFIER_HOTKEY_COOLDOWN_MS = 900;

const VK_CONTROL = 0x11;
const VK_SHIFT = 0x10;
const VK_LCONTROL = 0xa2;
const VK_RCONTROL = 0xa3;
const VK_LSHIFT = 0xa0;
const VK_RSHIFT = 0xa1;

type WindowRpc = {
	send: {
		snapshotUpdated: (payload: AppSnapshot) => Promise<void> | void;
		toast: (payload: ToastPayload) => Promise<void> | void;
	};
};

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

const storage = new DictateStorage(Utils.paths.userData);
const sidecarScript = resolveSidecarScriptPath();
const sidecarProjectRoot = resolve(sidecarScript, "..", "..");
const sidecarVenvPython = join(
	sidecarProjectRoot,
	"sidecar",
	".venv",
	"Scripts",
	"python.exe",
);
console.log(
	`[sidecar] using script=${sidecarScript}; python=${process.env.PYTHON_BIN ?? (existsSync(sidecarVenvPython) ? sidecarVenvPython : "python")}`,
);
const sidecar = new SidecarClient(
	sidecarScript,
	process.env.PYTHON_BIN ??
		(existsSync(sidecarVenvPython) ? sidecarVenvPython : "python"),
);

let mainWindow: BrowserWindow | null = null;
let pillWindow: BrowserWindow | null = null;
let trayRef: Tray | null = null;
let shuttingDown = false;
let hidePillTimer: ReturnType<typeof setTimeout> | null = null;
let recordingTicker: ReturnType<typeof setInterval> | null = null;
let recordingStartedAt = 0;
let modifierHotkeyTimer: ReturnType<typeof setInterval> | null = null;
let modifierHotkeyWasDown = false;
let lastModifierHotkeyAt = 0;
let user32Library: Library<{
	GetAsyncKeyState: {
		args: [typeof FFIType.i32];
		returns: typeof FFIType.i16;
	};
}> | null = null;
let getAsyncKeyStateFn: ((virtualKey: number) => number) | null = null;

let currentPill: AppSnapshot["pill"] = {
	state: "hidden",
	durationMs: 0,
	waveformBars: [12, 25, 8, 30, 14, 28, 10, 20, 16],
	visible: false,
};

const NO_SPEECH_PATTERNS = [
	"empty transcription",
	"no speech detected",
	"returned no generated tokens",
];

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeHotkey(hotkey: string): string {
	return hotkey.replace(/\s+/g, "").toLowerCase();
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
		});
		getAsyncKeyStateFn = user32Library.symbols.GetAsyncKeyState as (
			virtualKey: number,
		) => number;
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

function stopModifierHotkeyPolling(): void {
	if (modifierHotkeyTimer) {
		clearInterval(modifierHotkeyTimer);
		modifierHotkeyTimer = null;
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
			if (now - lastModifierHotkeyAt > MODIFIER_HOTKEY_COOLDOWN_MS) {
				lastModifierHotkeyAt = now;
				void runMicrophoneTranscription("global-hotkey");
			}
		}

		modifierHotkeyWasDown = comboDown;
	}, MODIFIER_HOTKEY_POLL_MS);

	return true;
}

function createWaveformBars(count = 9): number[] {
	return Array.from({ length: count }, (_, index) => {
		const seed = Date.now() + index * 43;
		return 6 + Math.floor(Math.abs(Math.sin(seed * 0.0085)) * 28);
	});
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
		return {
			pillState: currentPill.state,
			pill: { ...currentPill },
			settings: storage.getSettings(),
			models: storage.getModels(),
			sidecarStatus: sidecar.getStatus(),
			lastJob: storage.getLastJob(),
			recentJobs: storage.getRecentJobs(30),
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

function getWindowRpcs(): WindowRpc[] {
	return [getWindowRpc(mainWindow), getWindowRpc(pillWindow)].filter(
		Boolean,
	) as WindowRpc[];
}

async function broadcastSnapshot(): Promise<void> {
	const snapshot = getSnapshot();
	const rpcs = getWindowRpcs();
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

async function sendToast(payload: ToastPayload): Promise<void> {
	Utils.showNotification({
		title: payload.title,
		body: payload.message,
		silent: false,
	});

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
	if (!pillWindow) {
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
	pillWindow.setFrame(x, y, PILL_WINDOW_WIDTH, PILL_WINDOW_HEIGHT);
}

function hidePillWindow(): void {
	if (!pillWindow) {
		return;
	}
	pillWindow.setFrame(-10_000, -10_000, PILL_WINDOW_WIDTH, PILL_WINDOW_HEIGHT);
}

function stopRecordingTicker(): void {
	if (!recordingTicker) {
		return;
	}
	clearInterval(recordingTicker);
	recordingTicker = null;
}

async function updatePill(next: Partial<AppSnapshot["pill"]>): Promise<void> {
	currentPill = {
		...currentPill,
		...next,
	};

	if (currentPill.visible) {
		positionPillWindow();
	} else {
		hidePillWindow();
	}
	await broadcastSnapshot();
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
			waveformBars: createWaveformBars(),
		});
	}, PILL_HIDE_DELAY_MS);
}

function startRecordingPill(): void {
	stopRecordingTicker();
	recordingStartedAt = Date.now();
	void updatePill({
		state: "recording",
		visible: true,
		durationMs: 0,
		waveformBars: createWaveformBars(),
	});

	recordingTicker = setInterval(() => {
		const durationMs = Date.now() - recordingStartedAt;
		void updatePill({
			state: "recording",
			visible: true,
			durationMs,
			waveformBars: createWaveformBars(),
		});
	}, 120);
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
	return {
		...job,
		status: next.status,
		updatedAt,
		detail: next.detail,
		transcript,
	};
}

function isNoSpeechErrorMessage(message: string): boolean {
	const normalized = message.toLowerCase();
	return NO_SPEECH_PATTERNS.some((pattern) => normalized.includes(pattern));
}

async function completeTranscription(
	job: JobRecord,
	sidecarResult: { text: string; latencyMs: number },
): Promise<TranscriptionResult> {
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
	const settings = storage.getSettings();
	const modelId = settings.defaultModelId;
	const clampedDuration = Math.max(
		2,
		Math.min(20, Math.round(durationSeconds)),
	);
	const job = createInitialJob(modelId, source);
	storage.insertJob(job);
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
	}
}

async function prepareModel(modelId: ModelId): Promise<PrepareModelResult> {
	console.log(`[model] prepare requested for ${modelId}`);
	storage.setModelStatus(modelId, {
		installed: false,
		status: "downloading",
	});
	await broadcastSnapshot();

	try {
		const result = await sidecar.prepareModel(modelId);
		console.log(
			`[model] prepare completed for ${modelId} in ${result.latencyMs}ms`,
		);
		storage.setModelStatus(modelId, {
			installed: true,
			status: "installed",
		});
		await sendToast({
			type: "success",
			title: "Model ready",
			message: "Model download completed and is ready to use.",
		});
		await broadcastSnapshot();
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
		await sendToast({
			type: "error",
			title: "Model download failed",
			message:
				error instanceof Error
					? error.message
					: "Unknown error while preparing model.",
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
		void runMicrophoneTranscription("global-hotkey");
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
				updateSettings: (next) => {
					const previous = storage.getSettings();
					const merged = storage.updateSettings(next);
					if (previous.hotkey !== merged.hotkey) {
						registerGlobalHotkey(merged.hotkey);
					}
					void broadcastSnapshot();
					return merged;
				},
				setDefaultModel: ({ modelId }) => {
					storage.updateSettings({ defaultModelId: modelId });
					void broadcastSnapshot();
					return getSnapshot();
				},
				runMicrophoneTranscription: async ({ durationSeconds }) =>
					runMicrophoneTranscription(
						"settings-window",
						durationSeconds ?? DEFAULT_MIC_DURATION_SECONDS,
					),
				prepareModel: async ({ modelId }) => prepareModel(modelId),
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
					if (message.includes("Mainview initialized")) {
						void broadcastSnapshot();
					}
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
			mainWindow?.focus();
			return;
		}

		if (action === "dictate") {
			void runMicrophoneTranscription("tray-menu");
			return;
		}

		if (action === "quit") {
			shuttingDown = true;
			Utils.quit();
		}
	});

	return appTray;
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
	return windowRef;
}

async function bootstrap(): Promise<void> {
	const viewUrl = await getMainViewUrl();
	mainWindow = new BrowserWindow({
		title: "Dictate",
		url: withViewQuery(viewUrl, "main"),
		rpc: mainRpc,
		titleBarStyle: "hidden",
		frame: {
			width: 1024,
			height: 760,
			x: 160,
			y: 100,
		},
	});
	pillWindow = createPillWindow(viewUrl);
	trayRef = createTray();

	const settings = storage.getSettings();
	registerGlobalHotkey(settings.hotkey || FALLBACK_HOTKEY);
	await broadcastSnapshot();

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

void bootstrap();
