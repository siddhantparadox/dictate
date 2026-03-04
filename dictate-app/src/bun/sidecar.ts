import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import {
	createInterface,
	type Interface as ReadlineInterface,
} from "node:readline";
import type { ModelId } from "../shared/models";

interface SidecarRequest {
	request_id: string;
	method: string;
	params: Record<string, unknown>;
}

interface SidecarSuccessResponse<T = Record<string, unknown>> {
	request_id: string;
	ok: true;
	result: T;
}

interface SidecarErrorResponse {
	request_id: string;
	ok: false;
	error: string;
}

interface PendingRequest {
	resolve: (value: unknown) => void;
	reject: (reason: Error) => void;
	timer: ReturnType<typeof setTimeout>;
}

interface SidecarTranscriptionPayload {
	text: string;
	latency_ms: number;
}

interface SidecarDeleteModelPayload {
	status: "deleted";
	latency_ms: number;
	removed_paths: string[];
}

interface SidecarPrepareModelProgressEvent {
	event: "prepare_model_progress";
	model_id: string;
	stage: "queued" | "downloading" | "loading" | "installed" | "error";
	message?: string;
	progress?: number | null;
	downloaded_bytes?: number | null;
	total_bytes?: number | null;
}

interface SidecarClientOptions {
	onPrepareModelProgress?: (event: {
		modelId: ModelId;
		stage: "queued" | "downloading" | "loading" | "installed" | "error";
		message: string;
		progress: number | null;
		downloadedBytes: number | null;
		totalBytes: number | null;
	}) => void;
}

function isModelId(value: string): value is ModelId {
	return (
		value === "nvidia/canary-qwen-2.5b" ||
		value === "nvidia/parakeet-tdt-0.6b-v3" ||
		value === "UsefulSensors/moonshine-streaming-medium" ||
		value === "UsefulSensors/moonshine-streaming-tiny"
	);
}

function normalizeProgress(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return null;
	}
	if (value <= 0) {
		return 0;
	}
	if (value >= 1) {
		return 1;
	}
	return value;
}

function normalizeBytes(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return null;
	}
	if (value <= 0) {
		return 0;
	}
	return Math.floor(value);
}

function normalizeProgressStage(
	value: unknown,
): "queued" | "downloading" | "loading" | "installed" | "error" {
	if (
		value === "queued" ||
		value === "downloading" ||
		value === "loading" ||
		value === "installed" ||
		value === "error"
	) {
		return value;
	}
	return "downloading";
}

export class SidecarClient {
	private proc: ChildProcessWithoutNullStreams | null = null;
	private stdoutReader: ReadlineInterface | null = null;
	private pending = new Map<string, PendingRequest>();
	private status: "ready" | "starting" | "stopped" | "error" = "stopped";
	private lastStartError: string | null = null;
	private pythonBin: string;
	private readonly envOverrides: Record<string, string>;
	private readonly options: SidecarClientOptions;

	constructor(
		private readonly sidecarScriptPath: string,
		pythonBin = "python",
		envOverrides: Record<string, string> = {},
		options: SidecarClientOptions = {},
	) {
		this.pythonBin = pythonBin;
		this.envOverrides = envOverrides;
		this.options = options;
	}

	getPythonBin(): string {
		return this.pythonBin;
	}

	setPythonBin(nextPythonBin: string): void {
		if (this.pythonBin === nextPythonBin) {
			return;
		}
		this.stop();
		this.pythonBin = nextPythonBin;
		this.lastStartError = null;
		this.status = "stopped";
		console.log(`[sidecar] switched python runtime to ${nextPythonBin}`);
	}

	getStatus(): "ready" | "starting" | "stopped" | "error" {
		return this.status;
	}

	private startIfNeeded(): void {
		if (this.proc) {
			return;
		}

		if (!existsSync(this.sidecarScriptPath)) {
			this.status = "error";
			this.lastStartError = `ASR sidecar script not found: ${this.sidecarScriptPath}`;
			console.error(`[sidecar] ${this.lastStartError}`);
			return;
		}

		this.status = "starting";
		this.lastStartError = null;
		this.proc = spawn(this.pythonBin, [this.sidecarScriptPath], {
			stdio: ["pipe", "pipe", "pipe"],
			env: {
				...process.env,
				...this.envOverrides,
			},
		});

		this.stdoutReader = createInterface({
			input: this.proc.stdout,
			crlfDelay: Number.POSITIVE_INFINITY,
		});

		this.stdoutReader.on("line", (line) => this.handleLine(line));
		this.proc.stderr.on("data", (chunk) => {
			console.error(`[sidecar] ${String(chunk).trim()}`);
		});
		this.proc.on("error", (error) => {
			this.status = "error";
			this.lastStartError = `Failed to spawn sidecar: ${error.message}`;
			this.failAllPending(error.message);
		});
		this.proc.on("close", (code, signal) => {
			const reason =
				this.lastStartError ??
				`ASR sidecar exited unexpectedly (code=${code ?? "null"}, signal=${signal ?? "null"}).`;
			this.failAllPending(reason);
			this.proc = null;
			this.stdoutReader = null;
			this.status = "stopped";
		});

		this.status = "ready";
	}

	private handleLine(line: string): void {
		let parsed: unknown;
		try {
			parsed = JSON.parse(line) as unknown;
		} catch {
			const trimmed = line.trim();
			if (trimmed.length > 0) {
				console.log(`[sidecar] ${trimmed}`);
			}
			return;
		}

		if (
			typeof parsed === "object" &&
			parsed !== null &&
			"event" in parsed &&
			(parsed as { event?: unknown }).event === "prepare_model_progress"
		) {
			const event = parsed as SidecarPrepareModelProgressEvent;
			if (!isModelId(event.model_id)) {
				return;
			}
			this.options.onPrepareModelProgress?.({
				modelId: event.model_id,
				stage: normalizeProgressStage(event.stage),
				message:
					typeof event.message === "string"
						? event.message
						: "Preparing model...",
				progress: normalizeProgress(event.progress),
				downloadedBytes: normalizeBytes(event.downloaded_bytes),
				totalBytes: normalizeBytes(event.total_bytes),
			});
			return;
		}

		if (
			typeof parsed !== "object" ||
			parsed === null ||
			!("request_id" in parsed) ||
			typeof (parsed as { request_id?: unknown }).request_id !== "string" ||
			!("ok" in parsed) ||
			typeof (parsed as { ok?: unknown }).ok !== "boolean"
		) {
			return;
		}

		const rpcResponse = parsed as SidecarSuccessResponse | SidecarErrorResponse;

		const pending = this.pending.get(rpcResponse.request_id);
		if (!pending) {
			return;
		}

		clearTimeout(pending.timer);
		this.pending.delete(rpcResponse.request_id);

		if (rpcResponse.ok) {
			pending.resolve(rpcResponse.result);
			return;
		}

		pending.reject(new Error(rpcResponse.error));
	}

	private failAllPending(reason: string): void {
		for (const [requestId, pending] of this.pending.entries()) {
			clearTimeout(pending.timer);
			pending.reject(new Error(reason));
			this.pending.delete(requestId);
		}
	}

	private request<T extends Record<string, unknown>>(
		method: string,
		params: Record<string, unknown>,
		timeoutMs = 20_000,
	): Promise<T> {
		this.startIfNeeded();

		if (!this.proc || !this.proc.stdin.writable) {
			return Promise.reject(
				new Error(
					this.lastStartError ??
						"ASR sidecar failed to start or stdin is not writable.",
				),
			);
		}

		const requestId = randomUUID();
		const payload: SidecarRequest = {
			request_id: requestId,
			method,
			params,
		};
		console.log(
			`[sidecar] request ${method} id=${requestId} timeout=${timeoutMs}ms`,
		);

		return new Promise<T>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(requestId);
				reject(
					new Error(
						`Sidecar request timed out. method=${method} request_id=${requestId}`,
					),
				);
			}, timeoutMs);

			this.pending.set(requestId, {
				resolve: (value) => resolve(value as T),
				reject,
				timer,
			});
			this.proc?.stdin.write(`${JSON.stringify(payload)}\n`);
		});
	}

	async transcribeText(
		modelId: ModelId,
		inputText: string,
	): Promise<{ text: string; latencyMs: number }> {
		const result = await this.request<SidecarTranscriptionPayload>(
			"transcribe",
			{
				model_id: modelId,
				input_text: inputText,
			},
		);

		return {
			text: result.text,
			latencyMs: result.latency_ms,
		};
	}

	async transcribeMicrophone(
		modelId: ModelId,
		durationSeconds = 7,
	): Promise<{ text: string; latencyMs: number }> {
		const result = await this.request<SidecarTranscriptionPayload>(
			"transcribe_microphone",
			{
				model_id: modelId,
				duration_seconds: durationSeconds,
			},
		);

		return {
			text: result.text,
			latencyMs: result.latency_ms,
		};
	}

	async startMicrophoneCapture(): Promise<void> {
		await this.request<{ status: "recording"; latency_ms: number }>(
			"start_microphone_capture",
			{},
		);
	}

	async finishMicrophoneCapture(
		modelId: ModelId,
	): Promise<{ text: string; latencyMs: number }> {
		const result = await this.request<SidecarTranscriptionPayload>(
			"finish_microphone_capture",
			{
				model_id: modelId,
			},
			180_000,
		);

		return {
			text: result.text,
			latencyMs: result.latency_ms,
		};
	}

	async prepareModel(
		modelId: ModelId,
	): Promise<{ status: "installed"; latencyMs: number }> {
		const result = await this.request<{
			status: "installed";
			latency_ms: number;
		}>(
			"prepare_model",
			{
				model_id: modelId,
			},
			10 * 60_000,
		);

		return {
			status: result.status,
			latencyMs: result.latency_ms,
		};
	}

	async deleteModel(
		modelId: ModelId,
	): Promise<{ status: "deleted"; latencyMs: number; removedPaths: string[] }> {
		const result = await this.request<SidecarDeleteModelPayload>(
			"delete_model",
			{
				model_id: modelId,
			},
			90_000,
		);

		return {
			status: result.status,
			latencyMs: result.latency_ms,
			removedPaths: Array.isArray(result.removed_paths)
				? result.removed_paths
				: [],
		};
	}

	stop(): void {
		if (this.stdoutReader) {
			this.stdoutReader.close();
			this.stdoutReader = null;
		}

		if (this.proc) {
			this.proc.kill();
			this.proc = null;
		}

		this.status = "stopped";
	}
}
