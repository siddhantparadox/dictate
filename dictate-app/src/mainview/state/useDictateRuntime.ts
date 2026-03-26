import { useCallback, useEffect, useMemo, useState } from "react";
import { rpcClient } from "@/mainview/rpc-client";
import type { GroqModelId, LocalModelId, ModelId } from "@/shared/models";
import type { AppSnapshot, ToastPayload } from "@/shared/rpc";

const SNAPSHOT_RETRY_BASE_MS = 250;
const SNAPSHOT_RETRY_MAX_MS = 1_500;

interface RuntimeErrorState {
	retryCount: number;
	message: string;
}

function isRpcTimeoutError(error: unknown): boolean {
	return (
		error instanceof Error && error.message.includes("RPC request timed out")
	);
}

export interface UseDictateRuntimeResult {
	snapshot: AppSnapshot | null;
	settings: AppSnapshot["settings"] | null;
	models: AppSnapshot["models"];
	latestToast: ToastPayload | null;
	lastTranscript: string;
	isDictating: boolean;
	isSelectingModelId: ModelId | null;
	isPreparingModelId: ModelId | null;
	isDeletingModelId: ModelId | null;
	isConfiguringGroq: boolean;
	isRemovingGroq: boolean;
	isUpdatingSettings: boolean;
	isLoading: boolean;
	runtimeError: RuntimeErrorState;
	selectModel: (modelId: ModelId) => Promise<void>;
	downloadModel: (modelId: LocalModelId) => Promise<boolean>;
	deleteModel: (modelId: LocalModelId) => Promise<boolean>;
	configureGroqProvider: (
		apiKey: string,
		modelId: GroqModelId,
	) => Promise<void>;
	removeGroqProvider: () => Promise<void>;
	installAccelerationRuntime: (mode: "cuda") => Promise<boolean>;
	startDictation: () => Promise<void>;
	updateSetting: (
		next: Partial<AppSnapshot["settings"]>,
	) => Promise<AppSnapshot["settings"]>;
}

export function useDictateRuntime(): UseDictateRuntimeResult {
	const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
	const [runtimeError, setRuntimeError] = useState<RuntimeErrorState>({
		retryCount: 0,
		message: "",
	});
	const [latestToast, setLatestToast] = useState<ToastPayload | null>(null);
	const [isDictating, setIsDictating] = useState(false);
	const [isSelectingModelId, setIsSelectingModelId] = useState<ModelId | null>(
		null,
	);
	const [isPreparingModelId, setIsPreparingModelId] = useState<ModelId | null>(
		null,
	);
	const [isDeletingModelId, setIsDeletingModelId] = useState<ModelId | null>(
		null,
	);
	const [isConfiguringGroq, setIsConfiguringGroq] = useState(false);
	const [isRemovingGroq, setIsRemovingGroq] = useState(false);
	const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);

	useEffect(() => {
		let active = true;
		let retryTimer: ReturnType<typeof setTimeout> | null = null;

		const bootstrapSnapshot = async (attempt = 0): Promise<void> => {
			if (attempt === 0) {
				void rpcClient.logClientEvent(
					"[bootstrap] requesting initial snapshot",
				);
			}

			try {
				const next = await rpcClient.getSnapshot();
				if (!active) {
					return;
				}

				setSnapshot(next);
				setRuntimeError({ retryCount: 0, message: "" });
				void rpcClient.logClientEvent(
					`[bootstrap] initial snapshot loaded. sidecar=${next.sidecarStatus}`,
				);
			} catch (error) {
				if (!active) {
					return;
				}
				const formattedError =
					error instanceof Error ? error.message : String(error);
				setRuntimeError({ retryCount: attempt + 1, message: formattedError });
				void rpcClient.logClientEvent(
					`[bootstrap] getSnapshot attempt=${attempt + 1} failed: ${formattedError}`,
				);

				const retryDelay = Math.min(
					SNAPSHOT_RETRY_BASE_MS + attempt * 200,
					SNAPSHOT_RETRY_MAX_MS,
				);
				retryTimer = setTimeout(() => {
					void bootstrapSnapshot(attempt + 1);
				}, retryDelay);
			}
		};

		void bootstrapSnapshot();

		const offSnapshot = rpcClient.onSnapshot((next) => {
			setSnapshot(next);
			setRuntimeError({ retryCount: 0, message: "" });
			void rpcClient.logClientEvent(
				`[snapshot] push received. state=${next.pill.state}; sidecar=${next.sidecarStatus}`,
			);
		});
		const offToast = rpcClient.onToast((toast) => setLatestToast(toast));
		void rpcClient.logClientEvent("Mainview initialized.");

		return () => {
			active = false;
			if (retryTimer) {
				clearTimeout(retryTimer);
			}
			offSnapshot();
			offToast();
		};
	}, []);

	useEffect(() => {
		if (!latestToast) {
			return;
		}
		const timer = setTimeout(() => {
			setLatestToast((current) => (current === latestToast ? null : current));
		}, 3_200);
		return () => clearTimeout(timer);
	}, [latestToast]);

	useEffect(() => {
		if (!isSelectingModelId || !snapshot) {
			return;
		}

		if (snapshot.settings.defaultModelId === isSelectingModelId) {
			setIsSelectingModelId(null);
		}
	}, [isSelectingModelId, snapshot]);

	useEffect(() => {
		if (!isPreparingModelId || !snapshot) {
			return;
		}

		const model = snapshot.models.find(
			(candidate) => candidate.id === isPreparingModelId,
		);
		if (!model) {
			setIsPreparingModelId(null);
			return;
		}

		if (model.status === "installed" || model.status === "error") {
			setIsPreparingModelId(null);
		}
	}, [isPreparingModelId, snapshot]);

	useEffect(() => {
		if (!isDeletingModelId || !snapshot) {
			return;
		}

		const model = snapshot.models.find(
			(candidate) => candidate.id === isDeletingModelId,
		);
		if (!model) {
			setIsDeletingModelId(null);
			return;
		}

		if (model.status === "not_installed" || model.status === "error") {
			setIsDeletingModelId(null);
		}
	}, [isDeletingModelId, snapshot]);

	const settings = snapshot?.settings ?? null;
	const models = snapshot?.models ?? [];
	const lastTranscript = useMemo(() => {
		const jobs = snapshot?.recentJobs ?? [];
		for (const job of jobs) {
			const transcript = job.transcript.trim();
			if (job.status === "pasted" && transcript.length > 0) {
				return transcript;
			}
		}
		for (const job of jobs) {
			const transcript = job.transcript.trim();
			if (transcript.length > 0) {
				return transcript;
			}
		}
		return "";
	}, [snapshot?.recentJobs]);

	const selectModel = useCallback(async (modelId: ModelId): Promise<void> => {
		setIsSelectingModelId(modelId);
		try {
			await rpcClient.setDefaultModel(modelId);
		} catch (error) {
			void rpcClient.reportRendererError("selectModel", error);
			setIsSelectingModelId(null);
		}
	}, []);

	const updateSetting = useCallback(
		async (
			next: Partial<AppSnapshot["settings"]>,
		): Promise<AppSnapshot["settings"]> => {
			setIsUpdatingSettings(true);
			setSnapshot((current) => {
				if (!current) {
					return current;
				}
				return {
					...current,
					settings: {
						...current.settings,
						...next,
					},
				};
			});
			try {
				return await rpcClient.updateSettings(next);
			} catch (error) {
				void rpcClient.reportRendererError("updateSetting", error);
				void rpcClient
					.getSnapshot()
					.then((fresh) => setSnapshot(fresh))
					.catch(() => undefined);
				throw error;
			} finally {
				setIsUpdatingSettings(false);
			}
		},
		[],
	);

	const downloadModel = useCallback(
		async (modelId: LocalModelId): Promise<boolean> => {
			setIsPreparingModelId(modelId);
			try {
				await rpcClient.prepareModel(modelId);
				setIsPreparingModelId(null);
				return true;
			} catch (error) {
				if (isRpcTimeoutError(error)) {
					void rpcClient.logClientEvent(
						`[downloadModel] RPC timeout for ${modelId}; waiting for snapshot status update.`,
					);
					return true;
				}
				void rpcClient.reportRendererError("downloadModel", error);
				setIsPreparingModelId(null);
				return false;
			}
		},
		[],
	);

	const deleteModel = useCallback(
		async (modelId: LocalModelId): Promise<boolean> => {
			setIsDeletingModelId(modelId);
			try {
				await rpcClient.deleteModel(modelId);
				setIsDeletingModelId(null);
				return true;
			} catch (error) {
				void rpcClient.reportRendererError("deleteModel", error);
				setIsDeletingModelId(null);
				return false;
			}
		},
		[],
	);

	const configureGroqProvider = useCallback(
		async (apiKey: string, modelId: GroqModelId): Promise<void> => {
			setIsConfiguringGroq(true);
			try {
				const snapshot = await rpcClient.configureGroqProvider(apiKey, modelId);
				setSnapshot(snapshot);
			} catch (error) {
				void rpcClient.reportRendererError("configureGroqProvider", error);
				throw error;
			} finally {
				setIsConfiguringGroq(false);
			}
		},
		[],
	);

	const removeGroqProvider = useCallback(async (): Promise<void> => {
		setIsRemovingGroq(true);
		try {
			const snapshot = await rpcClient.removeGroqProvider();
			setSnapshot(snapshot);
		} catch (error) {
			void rpcClient.reportRendererError("removeGroqProvider", error);
			throw error;
		} finally {
			setIsRemovingGroq(false);
		}
	}, []);

	const startDictation = useCallback(async (): Promise<void> => {
		setIsDictating(true);
		try {
			await rpcClient.runMicrophoneTranscription();
		} catch (error) {
			void rpcClient.reportRendererError("runMicrophoneTranscription", error);
		} finally {
			setIsDictating(false);
		}
	}, []);

	const installAccelerationRuntime = useCallback(
		async (mode: "cuda"): Promise<boolean> => {
			try {
				await rpcClient.installAccelerationRuntime(mode);
				return true;
			} catch (error) {
				void rpcClient.reportRendererError("installAccelerationRuntime", error);
				return false;
			}
		},
		[],
	);

	return {
		snapshot,
		settings,
		models,
		latestToast,
		lastTranscript,
		isDictating,
		isSelectingModelId,
		isPreparingModelId,
		isDeletingModelId,
		isConfiguringGroq,
		isRemovingGroq,
		isUpdatingSettings,
		isLoading: !snapshot || !settings,
		runtimeError,
		selectModel,
		downloadModel,
		deleteModel,
		configureGroqProvider,
		removeGroqProvider,
		installAccelerationRuntime,
		startDictation,
		updateSetting,
	};
}
