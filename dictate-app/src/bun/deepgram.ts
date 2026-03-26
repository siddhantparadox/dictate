import type { DeepgramModelId } from "../shared/models";

const DEEPGRAM_API_BASE_URL = "https://api.deepgram.com";

interface DeepgramErrorResponse {
	err_code?: string;
	err_msg?: string;
	message?: string;
	error?: string;
}

interface DeepgramTranscriptionResponse {
	results?: {
		channels?: Array<{
			alternatives?: Array<{
				transcript?: string;
			}>;
		}>;
	};
}

async function parseDeepgramError(response: Response): Promise<string> {
	try {
		const body = (await response.json()) as DeepgramErrorResponse;
		const message =
			body.err_msg ?? body.message ?? body.error ?? response.statusText;
		if (typeof message === "string" && message.trim().length > 0) {
			return message.trim();
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

	return `Deepgram request failed with ${response.status} ${response.statusText}.`;
}

function buildAuthHeaders(apiKey: string): Headers {
	const headers = new Headers();
	headers.set("Authorization", `Token ${apiKey}`);
	return headers;
}

export async function verifyDeepgramCredentials(args: {
	apiKey: string;
	modelId: DeepgramModelId;
}): Promise<{ verifiedAt: string }> {
	const apiKey = args.apiKey.trim();
	if (apiKey.length === 0) {
		throw new Error("Enter a Deepgram API key.");
	}

	const response = await fetch(`${DEEPGRAM_API_BASE_URL}/v1/auth/token`, {
		method: "GET",
		headers: buildAuthHeaders(apiKey),
	});

	if (!response.ok) {
		throw new Error(await parseDeepgramError(response));
	}

	try {
		await response.json();
	} catch {
		// The docs only require a successful JSON details response for a valid key.
		// We do not depend on a specific payload shape here.
	}

	return {
		verifiedAt: new Date().toISOString(),
	};
}

export async function transcribeWithDeepgram(args: {
	apiKey: string;
	modelId: DeepgramModelId;
	audioFilePath: string;
}): Promise<{ text: string; latencyMs: number }> {
	const startedAt = performance.now();
	const apiKey = args.apiKey.trim();
	if (apiKey.length === 0) {
		throw new Error("Deepgram API key is missing.");
	}

	const audioBuffer = await Bun.file(args.audioFilePath).arrayBuffer();
	const headers = buildAuthHeaders(apiKey);
	headers.set("Content-Type", "audio/wav");

	const query = new URLSearchParams({
		model: args.modelId,
		smart_format: "true",
		punctuate: "true",
		detect_language: "true",
	});
	const response = await fetch(
		`${DEEPGRAM_API_BASE_URL}/v1/listen?${query.toString()}`,
		{
			method: "POST",
			headers,
			body: audioBuffer,
		},
	);

	if (!response.ok) {
		throw new Error(await parseDeepgramError(response));
	}

	const body = (await response.json()) as DeepgramTranscriptionResponse;
	const text =
		body.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? "";
	if (text.length === 0) {
		throw new Error("No speech detected.");
	}

	return {
		text,
		latencyMs: Math.max(1, Math.round(performance.now() - startedAt)),
	};
}
