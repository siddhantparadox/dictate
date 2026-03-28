import type { OpenRouterModelId } from "../shared/models";

const OPENROUTER_API_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_TITLE = "Dictate";
const OPENROUTER_REFERRER = "https://github.com/siddhantparadox/dictate";

interface OpenRouterErrorResponse {
	error?: {
		message?: string;
	};
}

interface OpenRouterChatCompletionResponse {
	choices?: Array<{
		message?: {
			content?: unknown;
		};
	}>;
}

function buildAuthHeaders(apiKey: string): Headers {
	const headers = new Headers();
	headers.set("Authorization", `Bearer ${apiKey}`);
	headers.set("HTTP-Referer", OPENROUTER_REFERRER);
	headers.set("X-OpenRouter-Title", OPENROUTER_TITLE);
	return headers;
}

async function parseOpenRouterError(response: Response): Promise<string> {
	try {
		const body = (await response.json()) as OpenRouterErrorResponse;
		if (
			typeof body.error?.message === "string" &&
			body.error.message.trim().length > 0
		) {
			return body.error.message.trim();
		}
	} catch {
		try {
			const body = await response.text();
			if (body.trim().length > 0) {
				return body.trim();
			}
		} catch {
			// Fall through to generic handling.
		}
	}

	return `OpenRouter request failed with ${response.status} ${response.statusText}.`;
}

function extractResponseText(content: unknown): string {
	if (typeof content === "string") {
		return content.trim();
	}

	if (!Array.isArray(content)) {
		return "";
	}

	return content
		.flatMap((part) => {
			if (typeof part === "string") {
				return [part];
			}
			if (
				typeof part === "object" &&
				part !== null &&
				"text" in part &&
				typeof part.text === "string"
			) {
				return [part.text];
			}
			return [];
		})
		.join("\n")
		.trim();
}

export async function verifyOpenRouterCredentials(args: {
	apiKey: string;
	modelId: OpenRouterModelId;
}): Promise<{ verifiedAt: string }> {
	const apiKey = args.apiKey.trim();
	if (apiKey.length === 0) {
		throw new Error("Enter an OpenRouter API key.");
	}

	const response = await fetch(`${OPENROUTER_API_BASE_URL}/key`, {
		method: "GET",
		headers: buildAuthHeaders(apiKey),
	});

	if (!response.ok) {
		throw new Error(await parseOpenRouterError(response));
	}

	try {
		await response.json();
	} catch {
		// A valid key returns JSON metadata, but the exact payload is not required here.
	}

	return {
		verifiedAt: new Date().toISOString(),
	};
}

export async function transcribeWithOpenRouter(args: {
	apiKey: string;
	modelId: OpenRouterModelId;
	audioFilePath: string;
}): Promise<{ text: string; latencyMs: number }> {
	const startedAt = performance.now();
	const apiKey = args.apiKey.trim();
	if (apiKey.length === 0) {
		throw new Error("OpenRouter API key is missing.");
	}

	const audioBuffer = await Bun.file(args.audioFilePath).arrayBuffer();
	const audioBase64 = Buffer.from(audioBuffer).toString("base64");
	const headers = buildAuthHeaders(apiKey);
	headers.set("Content-Type", "application/json");

	const response = await fetch(`${OPENROUTER_API_BASE_URL}/chat/completions`, {
		method: "POST",
		headers,
		body: JSON.stringify({
			model: args.modelId,
			messages: [
				{
					role: "system",
					content:
						"Transcribe the user's speech exactly and return only the final transcript text with punctuation. Do not add commentary, labels, or formatting.",
				},
				{
					role: "user",
					content: [
						{
							type: "text",
							text: "Please transcribe this audio.",
						},
						{
							type: "input_audio",
							input_audio: {
								data: audioBase64,
								format: "wav",
							},
						},
					],
				},
			],
			temperature: 0,
		}),
	});

	if (!response.ok) {
		throw new Error(await parseOpenRouterError(response));
	}

	const body = (await response.json()) as OpenRouterChatCompletionResponse;
	const text = extractResponseText(body.choices?.[0]?.message?.content);
	if (text.length === 0) {
		throw new Error("No speech detected.");
	}

	return {
		text,
		latencyMs: Math.max(1, Math.round(performance.now() - startedAt)),
	};
}
