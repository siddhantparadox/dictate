import type { GroqModelId } from "../shared/models";

const GROQ_API_BASE_URL = "https://api.groq.com/openai/v1";

interface GroqModelListResponse {
	data?: Array<{
		id?: string;
	}>;
}

interface GroqErrorResponse {
	error?: {
		message?: string;
		code?: string;
		type?: string;
	};
}

async function parseGroqError(response: Response): Promise<string> {
	try {
		const body = (await response.json()) as GroqErrorResponse;
		if (
			typeof body.error?.message === "string" &&
			body.error.message.length > 0
		) {
			return body.error.message;
		}
	} catch {
		// Ignore JSON parsing errors and fall through to generic handling.
	}

	return `Groq request failed with ${response.status} ${response.statusText}.`;
}

function buildAuthHeaders(apiKey: string): Headers {
	const headers = new Headers();
	headers.set("Authorization", `Bearer ${apiKey}`);
	return headers;
}

export async function verifyGroqCredentials(args: {
	apiKey: string;
	modelId: GroqModelId;
}): Promise<{ verifiedAt: string }> {
	const apiKey = args.apiKey.trim();
	if (apiKey.length === 0) {
		throw new Error("Enter a Groq API key.");
	}

	const response = await fetch(`${GROQ_API_BASE_URL}/models`, {
		method: "GET",
		headers: buildAuthHeaders(apiKey),
	});

	if (!response.ok) {
		throw new Error(await parseGroqError(response));
	}

	const body = (await response.json()) as GroqModelListResponse;
	const availableModelIds = new Set(
		(body.data ?? [])
			.map((model) => model.id)
			.filter((value): value is string => typeof value === "string"),
	);

	if (!availableModelIds.has(args.modelId)) {
		throw new Error(
			`This Groq API key cannot access ${args.modelId}. Check model permissions in Groq Console.`,
		);
	}

	return {
		verifiedAt: new Date().toISOString(),
	};
}

export async function transcribeWithGroq(args: {
	apiKey: string;
	modelId: GroqModelId;
	audioFilePath: string;
}): Promise<{ text: string; latencyMs: number }> {
	const startedAt = performance.now();
	const apiKey = args.apiKey.trim();
	if (apiKey.length === 0) {
		throw new Error("Groq API key is missing.");
	}

	const audioBuffer = await Bun.file(args.audioFilePath).arrayBuffer();
	const form = new FormData();
	form.append(
		"file",
		new Blob([audioBuffer], { type: "audio/wav" }),
		"dictate.wav",
	);
	form.append("model", args.modelId);
	form.append("response_format", "json");

	const response = await fetch(`${GROQ_API_BASE_URL}/audio/transcriptions`, {
		method: "POST",
		headers: buildAuthHeaders(apiKey),
		body: form,
	});

	if (!response.ok) {
		throw new Error(await parseGroqError(response));
	}

	const body = (await response.json()) as { text?: unknown };
	const text = typeof body.text === "string" ? body.text.trim() : "";
	if (text.length === 0) {
		throw new Error("No speech detected.");
	}

	return {
		text,
		latencyMs: Math.max(1, Math.round(performance.now() - startedAt)),
	};
}
