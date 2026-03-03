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

interface SidecarSuccessResponse {
	request_id: string;
	ok: true;
	result: {
		text: string;
		latency_ms: number;
	};
}

interface SidecarErrorResponse {
	request_id: string;
	ok: false;
	error: string;
}

interface PendingRequest {
	resolve: (value: SidecarSuccessResponse["result"]) => void;
	reject: (reason: Error) => void;
	timer: ReturnType<typeof setTimeout>;
}

export class SidecarClient {
	private proc: ChildProcessWithoutNullStreams | null = null;
	private stdoutReader: ReadlineInterface | null = null;
	private pending = new Map<string, PendingRequest>();
	private status: "ready" | "starting" | "stopped" | "error" = "stopped";
	private lastStartError: string | null = null;

	constructor(
		private readonly sidecarScriptPath: string,
		private readonly pythonBin: string = "python",
	) {}

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
		let parsed: SidecarSuccessResponse | SidecarErrorResponse;
		try {
			parsed = JSON.parse(line) as
				| SidecarSuccessResponse
				| SidecarErrorResponse;
		} catch {
			console.error(`[sidecar] non-JSON output: ${line}`);
			return;
		}

		const pending = this.pending.get(parsed.request_id);
		if (!pending) {
			return;
		}

		clearTimeout(pending.timer);
		this.pending.delete(parsed.request_id);

		if (parsed.ok) {
			pending.resolve(parsed.result);
			return;
		}

		pending.reject(new Error(parsed.error));
	}

	private failAllPending(reason: string): void {
		for (const [requestId, pending] of this.pending.entries()) {
			clearTimeout(pending.timer);
			pending.reject(new Error(reason));
			this.pending.delete(requestId);
		}
	}

	private request(
		method: string,
		params: Record<string, unknown>,
		timeoutMs = 20_000,
	): Promise<SidecarSuccessResponse["result"]> {
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

		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(requestId);
				reject(
					new Error(
						`Sidecar request timed out. method=${method} request_id=${requestId}`,
					),
				);
			}, timeoutMs);

			this.pending.set(requestId, { resolve, reject, timer });
			this.proc?.stdin.write(`${JSON.stringify(payload)}\n`);
		});
	}

	async transcribeText(
		modelId: ModelId,
		inputText: string,
	): Promise<{ text: string; latencyMs: number }> {
		const result = await this.request("transcribe", {
			model_id: modelId,
			input_text: inputText,
		});

		return {
			text: result.text,
			latencyMs: result.latency_ms,
		};
	}

	async transcribeMicrophone(
		modelId: ModelId,
		durationSeconds = 7,
	): Promise<{ text: string; latencyMs: number }> {
		const result = await this.request("transcribe_microphone", {
			model_id: modelId,
			duration_seconds: durationSeconds,
		});

		return {
			text: result.text,
			latencyMs: result.latency_ms,
		};
	}

	async prepareModel(
		modelId: ModelId,
	): Promise<{ status: "installed"; latencyMs: number }> {
		const result = await this.request(
			"prepare_model",
			{
				model_id: modelId,
			},
			10 * 60_000,
		);

		return {
			status: "installed",
			latencyMs: result.latency_ms,
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
