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
	DEFAULT_GROQ_MODEL_ID,
	type GroqModelId,
	isGroqModelId,
} from "../shared/models";
import type { GroqProviderSnapshot } from "../shared/rpc";

interface StoredGroqProviderConfig {
	apiKey: string;
	selectedModelId: GroqModelId;
	lastVerifiedAt: string;
}

interface StoredProviderFile {
	groq?: Partial<StoredGroqProviderConfig>;
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

function maskApiKey(apiKey: string): string {
	if (apiKey.length <= 8) {
		return "Saved";
	}
	return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
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
}
