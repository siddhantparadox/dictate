import { Utils } from "electrobun/bun";
import type { PasteOutcome } from "../shared/rpc";

const PASTE_SHORTCUT_SCRIPT =
	"Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')";

async function sendCtrlV(): Promise<{ ok: boolean; reason?: string }> {
	if (process.platform !== "win32") {
		return { ok: false, reason: "Auto-paste currently supports Windows only." };
	}

	const proc = Bun.spawn(
		["pwsh", "-NoProfile", "-Command", PASTE_SHORTCUT_SCRIPT],
		{
			stdout: "ignore",
			stderr: "pipe",
		},
	);

	const exitCode = await proc.exited;
	if (exitCode === 0) {
		return { ok: true };
	}

	const errText = await new Response(proc.stderr).text();
	return {
		ok: false,
		reason:
			errText.trim() ||
			`PowerShell SendKeys failed with exit code ${exitCode}.`,
	};
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function autoPasteText(
	text: string,
	retryCount: number,
): Promise<PasteOutcome> {
	Utils.clipboardWriteText(text);

	for (let attempt = 0; attempt <= retryCount; attempt += 1) {
		const result = await sendCtrlV();
		if (result.ok) {
			return { status: "success", preservedInClipboard: true };
		}

		if (attempt < retryCount) {
			await sleep(60);
		}

		if (attempt === retryCount) {
			return {
				status: "failure",
				reason: result.reason,
				preservedInClipboard: true,
			};
		}
	}

	return {
		status: "failure",
		reason: "Auto-paste failed unexpectedly.",
		preservedInClipboard: true,
	};
}
