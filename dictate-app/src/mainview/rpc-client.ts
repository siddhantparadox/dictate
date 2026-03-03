import { Electroview } from "electrobun/view";
import type { ModelId } from "@/shared/models";
import type {
	AppSnapshot,
	DictateRPC,
	DictateSettings,
	PrepareModelResult,
	ToastPayload,
	TranscriptionResult,
} from "@/shared/rpc";

type SnapshotListener = (snapshot: AppSnapshot) => void;
type ToastListener = (toast: ToastPayload) => void;
const REQUEST_TIMEOUT_MS = 2_500;

const snapshotListeners = new Set<SnapshotListener>();
const toastListeners = new Set<ToastListener>();

const rpc = Electroview.defineRPC<DictateRPC>({
	handlers: {
		requests: {
			healthCheck: () => ({ ok: true, at: new Date().toISOString() }),
		},
		messages: {
			snapshotUpdated: (snapshot) => {
				for (const listener of snapshotListeners) {
					listener(snapshot);
				}
			},
			toast: (toast) => {
				for (const listener of toastListeners) {
					listener(toast);
				}
			},
		},
	},
});

const electroview = new Electroview({ rpc });
const rpcProxy = electroview.rpc as NonNullable<typeof electroview.rpc>;

function formatError(error: unknown): string {
	if (error instanceof Error) {
		return `${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ""}`;
	}
	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
}

function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => {
			reject(new Error("RPC request timed out."));
		}, timeoutMs);

		void promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error) => {
				clearTimeout(timer);
				reject(error);
			},
		);
	});
}

export const rpcClient = {
	getSnapshot: () => withTimeout(rpcProxy.request.getSnapshot({})),
	updateSettings: (next: Partial<DictateSettings>) =>
		rpcProxy.request.updateSettings(next),
	setDefaultModel: (modelId: ModelId) =>
		rpcProxy.request.setDefaultModel({ modelId }),
	runMicrophoneTranscription: (
		durationSeconds?: number,
	): Promise<TranscriptionResult> =>
		rpcProxy.request.runMicrophoneTranscription({ durationSeconds }),
	prepareModel: (modelId: ModelId): Promise<PrepareModelResult> =>
		rpcProxy.request.prepareModel({ modelId }),
	windowControl: (
		action: "minimize" | "toggleMaximize" | "close" | "getState",
	): Promise<{ maximized: boolean }> =>
		rpcProxy.request.windowControl({ action }),
	logClientEvent: async (message: string) => {
		try {
			await rpcProxy.send.logClientEvent({ message });
		} catch (error) {
			console.error(
				`[rpc-client] logClientEvent failed: ${formatError(error)}`,
			);
		}
	},
	reportRendererError: async (scope: string, error: unknown) => {
		const formatted = formatError(error);
		const message = `[renderer-error:${scope}] ${formatted}`;
		console.error(message);
		try {
			await rpcProxy.send.logClientEvent({ message });
		} catch (sendError) {
			console.error(
				`[rpc-client] reportRendererError failed: ${formatError(sendError)}`,
			);
		}
	},
	onSnapshot: (listener: SnapshotListener): (() => void) => {
		snapshotListeners.add(listener);
		return () => snapshotListeners.delete(listener);
	},
	onToast: (listener: ToastListener): (() => void) => {
		toastListeners.add(listener);
		return () => toastListeners.delete(listener);
	},
};
