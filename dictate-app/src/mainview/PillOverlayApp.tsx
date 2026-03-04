import { CheckCircle2, Loader2, Mic, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AppSnapshot } from "@/shared/rpc";
import { rpcClient } from "./rpc-client";

const BAR_IDS = ["bar-a", "bar-b", "bar-c", "bar-d", "bar-e", "bar-f", "bar-g"];

function formatDuration(ms: number): string {
	const total = Math.max(0, Math.floor(ms / 1000));
	const minutes = Math.floor(total / 60)
		.toString()
		.padStart(2, "0");
	const seconds = (total % 60).toString().padStart(2, "0");
	return `${minutes}:${seconds}`;
}

function PillOverlayApp() {
	const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);

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
		return () => {
			active = false;
			offSnapshot();
		};
	}, []);

	const pill = snapshot?.pill;
	const state = pill?.state ?? "hidden";
	const isVisible = pill?.visible ?? false;
	const waveformBars = useMemo(() => {
		const source = pill?.waveformBars.length
			? pill.waveformBars
			: [12, 22, 10, 26, 15, 20, 12];
		const fallback = source[source.length - 1] ?? 12;
		return BAR_IDS.map((_, position) => source[position] ?? fallback);
	}, [pill?.waveformBars]);

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
						<div className="pill-wave">
							{BAR_IDS.map((barId, position) => (
								<span
									key={barId}
									className="pill-wave-bar"
									style={{ height: `${waveformBars[position] ?? 12}px` }}
								/>
							))}
						</div>
						<span className="pill-time">
							{formatDuration(pill?.durationMs ?? 0)}
						</span>
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
