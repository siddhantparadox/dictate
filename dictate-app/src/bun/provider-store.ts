import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
	type AssemblyAIModelId,
	DEFAULT_ASSEMBLYAI_MODEL_ID,
	DEFAULT_DEEPGRAM_MODEL_ID,
	DEFAULT_GROQ_MODEL_ID,
	DEFAULT_OPENROUTER_MODEL_ID,
	type DeepgramModelId,
	type GroqModelId,
	isAssemblyAIModelId,
	isDeepgramModelId,
	isGroqModelId,
	isOpenRouterModelId,
	type OpenRouterModelId,
} from "../shared/models";
import type {
	AssemblyAIProviderSnapshot,
	DeepgramProviderSnapshot,
	GroqProviderSnapshot,
	OpenRouterProviderSnapshot,
} from "../shared/rpc";

interface StoredGroqProviderConfig {
	apiKey: string;
	selectedModelId: GroqModelId;
	lastVerifiedAt: string;
}

interface StoredDeepgramProviderConfig {
	apiKey: string;
	selectedModelId: DeepgramModelId;
	lastVerifiedAt: string;
}

interface StoredAssemblyAIProviderConfig {
	apiKey: string;
	selectedModelId: AssemblyAIModelId;
	lastVerifiedAt: string;
}

interface StoredOpenRouterProviderConfig {
	apiKey: string;
	selectedModelId: OpenRouterModelId;
	lastVerifiedAt: string;
}

interface StoredProviderFile {
	groq?: Partial<StoredGroqProviderConfig>;
	deepgram?: Partial<StoredDeepgramProviderConfig>;
	assemblyai?: Partial<StoredAssemblyAIProviderConfig>;
	openrouter?: Partial<StoredOpenRouterProviderConfig>;
}

function maskApiKey(apiKey: string): string {
	if (apiKey.length <= 8) {
		return "Saved";
	}
	return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
}

function normalizeGroqConfig(
	value: Partial<StoredGroqProviderConfig> | undefined,
): StoredGroqProviderConfig | null {
	if (!value || typeof value.apiKey !== "string") {
		return null;
	}

	const apiKey = value.apiKey.trim();
	if (apiKey.length === 0) {
		return null;
	}

	const selectedModelId = isGroqModelId(value.selectedModelId ?? "")
		? value.selectedModelId
		: DEFAULT_GROQ_MODEL_ID;
	const lastVerifiedAt =
		typeof value.lastVerifiedAt === "string" ? value.lastVerifiedAt : "";

	return {
		apiKey,
		selectedModelId,
		lastVerifiedAt,
	};
}

function normalizeDeepgramConfig(
	value: Partial<StoredDeepgramProviderConfig> | undefined,
): StoredDeepgramProviderConfig | null {
	if (!value || typeof value.apiKey !== "string") {
		return null;
	}

	const apiKey = value.apiKey.trim();
	if (apiKey.length === 0) {
		return null;
	}

	const selectedModelId = isDeepgramModelId(value.selectedModelId ?? "")
		? value.selectedModelId
		: DEFAULT_DEEPGRAM_MODEL_ID;
	const lastVerifiedAt =
		typeof value.lastVerifiedAt === "string" ? value.lastVerifiedAt : "";

	return {
		apiKey,
		selectedModelId,
		lastVerifiedAt,
	};
}

function normalizeAssemblyAIConfig(
	value: Partial<StoredAssemblyAIProviderConfig> | undefined,
): StoredAssemblyAIProviderConfig | null {
	if (!value || typeof value.apiKey !== "string") {
		return null;
	}

	const apiKey = value.apiKey.trim();
	if (apiKey.length === 0) {
		return null;
	}

	const selectedModelId = isAssemblyAIModelId(value.selectedModelId ?? "")
		? value.selectedModelId
		: DEFAULT_ASSEMBLYAI_MODEL_ID;
	const lastVerifiedAt =
		typeof value.lastVerifiedAt === "string" ? value.lastVerifiedAt : "";

	return {
		apiKey,
		selectedModelId,
		lastVerifiedAt,
	};
}

function normalizeOpenRouterConfig(
	value: Partial<StoredOpenRouterProviderConfig> | undefined,
): StoredOpenRouterProviderConfig | null {
	if (!value || typeof value.apiKey !== "string") {
		return null;
	}

	const apiKey = value.apiKey.trim();
	if (apiKey.length === 0) {
		return null;
	}

	const selectedModelId = isOpenRouterModelId(value.selectedModelId ?? "")
		? value.selectedModelId
		: DEFAULT_OPENROUTER_MODEL_ID;
	const lastVerifiedAt =
		typeof value.lastVerifiedAt === "string" ? value.lastVerifiedAt : "";

	return {
		apiKey,
		selectedModelId,
		lastVerifiedAt,
	};
}

export class CloudProviderStore {
	private readonly filePath: string;

	constructor(dictateHomeDir: string) {
		mkdirSync(dictateHomeDir, { recursive: true });
		this.filePath = join(dictateHomeDir, "providers.json");
	}

	private readFile(): StoredProviderFile {
		if (!existsSync(this.filePath)) {
			return {};
		}

		try {
			const raw = readFileSync(this.filePath, "utf8");
			const parsed = JSON.parse(raw) as StoredProviderFile;
			if (typeof parsed !== "object" || parsed === null) {
				return {};
			}
			return parsed;
		} catch {
			return {};
		}
	}

	private writeFile(next: StoredProviderFile): void {
		const tempPath = `${this.filePath}.tmp`;
		writeFileSync(tempPath, JSON.stringify(next, null, 2), "utf8");
		renameSync(tempPath, this.filePath);
	}

	getGroqConfig(): StoredGroqProviderConfig | null {
		return normalizeGroqConfig(this.readFile().groq);
	}

	getDeepgramConfig(): StoredDeepgramProviderConfig | null {
		return normalizeDeepgramConfig(this.readFile().deepgram);
	}

	getAssemblyAIConfig(): StoredAssemblyAIProviderConfig | null {
		return normalizeAssemblyAIConfig(this.readFile().assemblyai);
	}

	getOpenRouterConfig(): StoredOpenRouterProviderConfig | null {
		return normalizeOpenRouterConfig(this.readFile().openrouter);
	}

	getGroqSnapshot(): GroqProviderSnapshot {
		const config = this.getGroqConfig();
		if (!config) {
			return {
				configured: false,
				maskedApiKey: null,
				selectedModelId: null,
				lastVerifiedAt: null,
			};
		}

		return {
			configured: true,
			maskedApiKey: maskApiKey(config.apiKey),
			selectedModelId: config.selectedModelId,
			lastVerifiedAt: config.lastVerifiedAt || null,
		};
	}

	getDeepgramSnapshot(): DeepgramProviderSnapshot {
		const config = this.getDeepgramConfig();
		if (!config) {
			return {
				configured: false,
				maskedApiKey: null,
				selectedModelId: null,
				lastVerifiedAt: null,
			};
		}

		return {
			configured: true,
			maskedApiKey: maskApiKey(config.apiKey),
			selectedModelId: config.selectedModelId,
			lastVerifiedAt: config.lastVerifiedAt || null,
		};
	}

	getAssemblyAISnapshot(): AssemblyAIProviderSnapshot {
		const config = this.getAssemblyAIConfig();
		if (!config) {
			return {
				configured: false,
				maskedApiKey: null,
				selectedModelId: null,
				lastVerifiedAt: null,
			};
		}

		return {
			configured: true,
			maskedApiKey: maskApiKey(config.apiKey),
			selectedModelId: config.selectedModelId,
			lastVerifiedAt: config.lastVerifiedAt || null,
		};
	}

	getOpenRouterSnapshot(): OpenRouterProviderSnapshot {
		const config = this.getOpenRouterConfig();
		if (!config) {
			return {
				configured: false,
				maskedApiKey: null,
				selectedModelId: null,
				lastVerifiedAt: null,
			};
		}

		return {
			configured: true,
			maskedApiKey: maskApiKey(config.apiKey),
			selectedModelId: config.selectedModelId,
			lastVerifiedAt: config.lastVerifiedAt || null,
		};
	}

	saveGroqConfig(next: StoredGroqProviderConfig): void {
		const current = this.readFile();
		this.writeFile({
			...current,
			groq: {
				apiKey: next.apiKey.trim(),
				selectedModelId: next.selectedModelId,
				lastVerifiedAt: next.lastVerifiedAt,
			},
		});
	}

	saveDeepgramConfig(next: StoredDeepgramProviderConfig): void {
		const current = this.readFile();
		this.writeFile({
			...current,
			deepgram: {
				apiKey: next.apiKey.trim(),
				selectedModelId: next.selectedModelId,
				lastVerifiedAt: next.lastVerifiedAt,
			},
		});
	}

	saveAssemblyAIConfig(next: StoredAssemblyAIProviderConfig): void {
		const current = this.readFile();
		this.writeFile({
			...current,
			assemblyai: {
				apiKey: next.apiKey.trim(),
				selectedModelId: next.selectedModelId,
				lastVerifiedAt: next.lastVerifiedAt,
			},
		});
	}

	saveOpenRouterConfig(next: StoredOpenRouterProviderConfig): void {
		const current = this.readFile();
		this.writeFile({
			...current,
			openrouter: {
				apiKey: next.apiKey.trim(),
				selectedModelId: next.selectedModelId,
				lastVerifiedAt: next.lastVerifiedAt,
			},
		});
	}

	updateGroqSelectedModel(modelId: GroqModelId): void {
		const current = this.getGroqConfig();
		if (!current) {
			throw new Error("Connect Groq before selecting a Groq model.");
		}

		this.saveGroqConfig({
			...current,
			selectedModelId: modelId,
		});
	}

	updateDeepgramSelectedModel(modelId: DeepgramModelId): void {
		const current = this.getDeepgramConfig();
		if (!current) {
			throw new Error("Connect Deepgram before selecting a Deepgram model.");
		}

		this.saveDeepgramConfig({
			...current,
			selectedModelId: modelId,
		});
	}

	updateAssemblyAISelectedModel(modelId: AssemblyAIModelId): void {
		const current = this.getAssemblyAIConfig();
		if (!current) {
			throw new Error(
				"Connect AssemblyAI before selecting an AssemblyAI model.",
			);
		}

		this.saveAssemblyAIConfig({
			...current,
			selectedModelId: modelId,
		});
	}

	updateOpenRouterSelectedModel(modelId: OpenRouterModelId): void {
		const current = this.getOpenRouterConfig();
		if (!current) {
			throw new Error(
				"Connect OpenRouter before selecting an OpenRouter model.",
			);
		}

		this.saveOpenRouterConfig({
			...current,
			selectedModelId: modelId,
		});
	}

	removeGroqConfig(): void {
		const current = this.readFile();
		if (!current.groq) {
			return;
		}

		delete current.groq;
		if (Object.keys(current).length === 0) {
			rmSync(this.filePath, { force: true });
			return;
		}

		this.writeFile(current);
	}

	removeDeepgramConfig(): void {
		const current = this.readFile();
		if (!current.deepgram) {
			return;
		}

		delete current.deepgram;
		if (Object.keys(current).length === 0) {
			rmSync(this.filePath, { force: true });
			return;
		}

		this.writeFile(current);
	}

	removeAssemblyAIConfig(): void {
		const current = this.readFile();
		if (!current.assemblyai) {
			return;
		}

		delete current.assemblyai;
		if (Object.keys(current).length === 0) {
			rmSync(this.filePath, { force: true });
			return;
		}

		this.writeFile(current);
	}

	removeOpenRouterConfig(): void {
		const current = this.readFile();
		if (!current.openrouter) {
			return;
		}

		delete current.openrouter;
		if (Object.keys(current).length === 0) {
			rmSync(this.filePath, { force: true });
			return;
		}

		this.writeFile(current);
	}
}
