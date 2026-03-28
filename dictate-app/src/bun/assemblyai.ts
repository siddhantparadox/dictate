import type { AssemblyAIModelId } from "../shared/models";

const ASSEMBLYAI_API_BASE_URL = "https://api.assemblyai.com";
const ASSEMBLYAI_POLL_INTERVAL_MS = 750;
const ASSEMBLYAI_POLL_TIMEOUT_MS = 90_000;

interface AssemblyAIErrorResponse {
	error?: string;
	message?: string;
}

interface AssemblyAIUploadResponse {
	upload_url?: string;
	error?: string;
}

interface AssemblyAITranscriptSubmitResponse {
	id?: string;
	status?: string;
	error?: string;
}

interface AssemblyAITranscriptResponse {
	status?: string;
	text?: string;
	error?: string;
}

function buildAuthHeaders(apiKey: string): Headers {
	const headers = new Headers();
	headers.set("authorization", apiKey);
	return headers;
}

async function parseAssemblyAIError(response: Response): Promise<string> {
	try {
		const body = (await response.json()) as AssemblyAIErrorResponse;
		const message = body.error ?? body.message;
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

	return `AssemblyAI request failed with ${response.status} ${response.statusText}.`;
}

function resolveSpeechModels(modelId: AssemblyAIModelId): AssemblyAIModelId[] {
	if (modelId === "universal-3-pro") {
		return ["universal-3-pro", "universal-2"];
	}
	return ["universal-2"];
}

export async function verifyAssemblyAICredentials(args: {
	apiKey: string;
	modelId: AssemblyAIModelId;
}): Promise<{ verifiedAt: string }> {
	const apiKey = args.apiKey.trim();
	if (apiKey.length === 0) {
		throw new Error("Enter an AssemblyAI API key.");
	}

	const response = await fetch(
		`${ASSEMBLYAI_API_BASE_URL}/v2/transcript?limit=1`,
		{
			method: "GET",
			headers: buildAuthHeaders(apiKey),
		},
	);

	if (!response.ok) {
		throw new Error(await parseAssemblyAIError(response));
	}

	try {
		await response.json();
	} catch {
		// AssemblyAI returns JSON for authenticated requests. We do not depend on the exact payload shape.
	}

	return {
		verifiedAt: new Date().toISOString(),
	};
}

export async function transcribeWithAssemblyAI(args: {
	apiKey: string;
	modelId: AssemblyAIModelId;
	audioFilePath: string;
}): Promise<{ text: string; latencyMs: number }> {
	const startedAt = performance.now();
	const apiKey = args.apiKey.trim();
	if (apiKey.length === 0) {
		throw new Error("AssemblyAI API key is missing.");
	}

	const audioBuffer = await Bun.file(args.audioFilePath).arrayBuffer();
	const uploadHeaders = buildAuthHeaders(apiKey);
	uploadHeaders.set("Content-Type", "application/octet-stream");

	const uploadResponse = await fetch(`${ASSEMBLYAI_API_BASE_URL}/v2/upload`, {
		method: "POST",
		headers: uploadHeaders,
		body: audioBuffer,
	});
	if (!uploadResponse.ok) {
		throw new Error(await parseAssemblyAIError(uploadResponse));
	}

	const uploadBody = (await uploadResponse.json()) as AssemblyAIUploadResponse;
	if (
		typeof uploadBody.upload_url !== "string" ||
		uploadBody.upload_url.length === 0
	) {
		throw new Error("AssemblyAI did not return an upload URL.");
	}

	const transcriptResponse = await fetch(
		`${ASSEMBLYAI_API_BASE_URL}/v2/transcript`,
		{
			method: "POST",
			headers: (() => {
				const headers = buildAuthHeaders(apiKey);
				headers.set("Content-Type", "application/json");
				return headers;
			})(),
			body: JSON.stringify({
				audio_url: uploadBody.upload_url,
				speech_models: resolveSpeechModels(args.modelId),
				language_detection: true,
			}),
		},
	);
	if (!transcriptResponse.ok) {
		throw new Error(await parseAssemblyAIError(transcriptResponse));
	}

	const transcriptBody =
		(await transcriptResponse.json()) as AssemblyAITranscriptSubmitResponse;
	if (
		typeof transcriptBody.error === "string" &&
		transcriptBody.error.length > 0
	) {
		throw new Error(transcriptBody.error);
	}
	if (typeof transcriptBody.id !== "string" || transcriptBody.id.length === 0) {
		throw new Error("AssemblyAI did not return a transcript id.");
	}

	const pollingEndpoint = `${ASSEMBLYAI_API_BASE_URL}/v2/transcript/${transcriptBody.id}`;
	const pollStartedAt = Date.now();
	while (Date.now() - pollStartedAt < ASSEMBLYAI_POLL_TIMEOUT_MS) {
		const pollResponse = await fetch(pollingEndpoint, {
			method: "GET",
			headers: buildAuthHeaders(apiKey),
		});
		if (!pollResponse.ok) {
			throw new Error(await parseAssemblyAIError(pollResponse));
		}

		const pollBody =
			(await pollResponse.json()) as AssemblyAITranscriptResponse;
		if (pollBody.status === "completed") {
			const text =
				typeof pollBody.text === "string" ? pollBody.text.trim() : "";
			if (text.length === 0) {
				throw new Error("No speech detected.");
			}

			return {
				text,
				latencyMs: Math.max(1, Math.round(performance.now() - startedAt)),
			};
		}
		if (pollBody.status === "error") {
			throw new Error(
				typeof pollBody.error === "string" && pollBody.error.length > 0
					? pollBody.error
					: "AssemblyAI transcription failed.",
			);
		}

		await Bun.sleep(ASSEMBLYAI_POLL_INTERVAL_MS);
	}

	throw new Error("AssemblyAI transcription timed out.");
}
