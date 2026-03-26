import type { AppSnapshot } from "@/shared/rpc";
import {
	formatJobModelLabel,
	jobStatusClass,
	jobStatusLabel,
} from "./view-model";

interface HistorySectionProps {
	recentJobs: AppSnapshot["recentJobs"];
}

function getDayLabel(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) {
		return "Recent";
	}
	const now = new Date();
	const startOfToday = new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate(),
	);
	const startOfDate = new Date(
		date.getFullYear(),
		date.getMonth(),
		date.getDate(),
	);
	const diffDays = Math.round(
		(startOfToday.getTime() - startOfDate.getTime()) / (1000 * 60 * 60 * 24),
	);

	if (diffDays === 0) {
		return "Today";
	}
	if (diffDays === 1) {
		return "Yesterday";
	}
	return date.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
	});
}

function formatTimeLabel(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) {
		return iso;
	}
	return date.toLocaleTimeString(undefined, {
		hour: "numeric",
		minute: "2-digit",
	});
}

export function HistorySection({ recentJobs }: HistorySectionProps) {
	const groupedJobs = recentJobs.reduce<
		Array<{ label: string; jobs: HistorySectionProps["recentJobs"] }>
	>((groups, job) => {
		const label = getDayLabel(job.updatedAt);
		const existingGroup = groups.find((group) => group.label === label);
		if (existingGroup) {
			existingGroup.jobs.push(job);
			return groups;
		}
		groups.push({ label, jobs: [job] });
		return groups;
	}, []);

	return (
		<div className="content-stack history-screen">
			<div className="section-heading-row compact history-heading">
				<div>
					<p className="section-eyebrow">Activity</p>
					<h1>Recent dictation.</h1>
					<p className="section-copy compact">
						Chronological transcript history in the quiet list treatment from
						the design screens.
					</p>
				</div>
			</div>

			{recentJobs.length === 0 ? (
				<section className="history-sheet">
					<p className="history-empty">No history yet.</p>
				</section>
			) : (
				groupedJobs.map((group) => (
					<section key={group.label} className="history-group">
						<div className="history-group-head">
							<h2 className="history-group-label">{group.label}</h2>
							<div className="history-group-rule" />
						</div>
						<div className="history-sheet">
							{group.jobs.map((job) => (
								<article key={job.id} className="history-row">
									<div className="history-row-time">
										{formatTimeLabel(job.updatedAt)}
									</div>
									<div
										className={`history-row-dot ${jobStatusClass(job.status)}`}
									/>
									<div className="history-row-body">
										<div className="history-row-meta">
											<p className="history-model">
												{formatJobModelLabel(job.modelId)}
											</p>
											<span
												className={`history-badge ${jobStatusClass(job.status)}`}
											>
												{jobStatusLabel(job.status)}
											</span>
										</div>
										<p className="history-text">
											{job.transcript.trim().length > 0
												? job.transcript
												: job.detail}
										</p>
									</div>
								</article>
							))}
						</div>
					</section>
				))
			)}
		</div>
	);
}
