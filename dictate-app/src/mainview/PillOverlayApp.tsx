import { CheckCircle2, Loader2, Mic, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Waveform } from "@/components/ui/waveform";
import type { AppSnapshot, PillFramePayload } from "@/shared/rpc";
import { rpcClient } from "./rpc-client";

const LEVEL_HISTORY_SIZE = 24;

function formatDuration(ms: number): string {
	const total = Math.max(0, Math.floor(ms / 1000));
	const minutes = Math.floor(total / 60)
		.toString()
		.padStart(2, "0");
	const seconds = (total % 60).toString().padStart(2, "0");
	return `${minutes}:${seconds}`;
}

function createEmptyHistory(): number[] {
	return Array.from({ length: LEVEL_HISTORY_SIZE }, () => 0);
}

function appendLevelHistory(history: number[], level: number): number[] {
	const safeLevel = Number.isFinite(level)
		? Math.max(0, Math.min(1, level))
		: 0;
	const gatedLevel = safeLevel < 0.01 ? 0 : safeLevel;
	return [gatedLevel, ...history].slice(0, LEVEL_HISTORY_SIZE);
}

function buildCenteredWaveformData(history: number[]): number[] {
	const shaped = history.map((value, index) => {
		const decay = Math.exp(-index * 0.18);
		return Math.max(0, Math.min(1, value * decay));
	});
	const mirrored = [...shaped].reverse();
	return [...mirrored, ...shaped];
}

function PillOverlayApp() {
	const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
	const [pillFrame, setPillFrame] = useState<PillFramePayload | null>(null);
	const [levelHistory, setLevelHistory] = useState<number[]>(() =>
		createEmptyHistory(),
	);

	useEffect(() => {
		void rpcClient.logClientEvent("[pill-bootstrap] waiting for snapshot push");
		let active = true;
		void rpcClient
			.getSnapshot()
			.then((next) => {
				if (!active) {
					return;
				}
				setSnapshot(next);
				void rpcClient.logClientEvent(
					`[pill-bootstrap] initial snapshot loaded. state=${next.pill.state}`,
				);
			})
			.catch((error) => {
				void rpcClient.reportRendererError("pill.getSnapshot", error);
			});

		const offSnapshot = rpcClient.onSnapshot((next) => {
			setSnapshot(next);
			void rpcClient.logClientEvent(
				`[pill-bootstrap] snapshot push received. state=${next.pill.state}`,
			);
		});

		const offPillFrame = rpcClient.onPillFrame((payload) => {
			setPillFrame(payload);
			if (payload.state === "recording" && payload.visible) {
				setLevelHistory((previous) =>
					appendLevelHistory(previous, payload.level),
				);
				return;
			}
			setLevelHistory(createEmptyHistory());
		});

		return () => {
			active = false;
			offSnapshot();
			offPillFrame();
		};
	}, []);

	const state = pillFrame?.state ?? snapshot?.pill.state ?? "hidden";
	const isVisible = pillFrame?.visible ?? snapshot?.pill.visible ?? false;
	const durationMs = pillFrame?.durationMs ?? snapshot?.pill.durationMs ?? 0;
	const waveformData = useMemo(
		() => buildCenteredWaveformData(levelHistory),
		[levelHistory],
	);

	if (!isVisible || state === "hidden") {
		return <div className="pill-root hidden" />;
	}

	return (
		<div className="pill-root">
			<div className={`pill-shell ${state}`}>
				{state === "recording" ? (
					<>
						<div className="pill-rec">
							<span className="pill-dot" />
							<strong>Listening</strong>
						</div>
						<div className="pill-waveform">
							<Waveform
								barColor="hsl(var(--primary))"
								barGap={1}
								barHeight={3}
								barRadius={999}
								barWidth={3}
								className="pill-waveform-canvas"
								data={waveformData}
								fadeEdges={false}
								height={24}
							/>
						</div>
						<span className="pill-time">{formatDuration(durationMs)}</span>
						<div className="pill-symbol">
							<Mic className="h-4 w-4" />
						</div>
					</>
				) : null}

				{state === "transcribing" ? (
					<>
						<Loader2 className="h-4 w-4 animate-spin text-sky-600" />
						<span className="pill-label">Transcribing</span>
					</>
				) : null}

				{state === "success" ? (
					<>
						<CheckCircle2 className="h-4 w-4 text-emerald-600" />
						<span className="pill-label">Pasted</span>
					</>
				) : null}

				{state === "failure" ? (
					<>
						<TriangleAlert className="h-4 w-4 text-rose-600" />
						<span className="pill-label">Failed, copied to clipboard</span>
					</>
				) : null}
			</div>
		</div>
	);
}

export default PillOverlayApp;
