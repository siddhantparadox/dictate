import { useEffect, useState } from "react";
import { HistorySection } from "@/mainview/components/dashboard/HistorySection";
import { MainSidebar } from "@/mainview/components/dashboard/MainSidebar";
import { ModelsSection } from "@/mainview/components/dashboard/ModelsSection";
import { OverviewSection } from "@/mainview/components/dashboard/OverviewSection";
import { SettingsSection } from "@/mainview/components/dashboard/SettingsSection";
import {
	buildDashboardViewModel,
	type MainSection,
} from "@/mainview/components/dashboard/view-model";
import { ToastBanner } from "@/mainview/components/ToastBanner";
import { useDictateRuntime } from "@/mainview/state/useDictateRuntime";
import {
	applyThemePreference,
	getThemePreference,
	type ThemePreference,
} from "@/mainview/theme";
import type { LocalModelId } from "@/shared/models";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "dictate.sidebar.collapsed";

function readStoredSidebarCollapsed(): boolean {
	try {
		return (
			window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true"
		);
	} catch {
		return false;
	}
}

function App() {
	const runtime = useDictateRuntime();
	const [themePreference, setThemePreference] = useState<ThemePreference>(
		getThemePreference(),
	);
	const [activeSection, setActiveSection] = useState<MainSection>("overview");
	const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() =>
		readStoredSidebarCollapsed(),
	);
	const [confirmDeleteModelId, setConfirmDeleteModelId] =
		useState<LocalModelId | null>(null);

	useEffect(() => {
		if (!confirmDeleteModelId) {
			return;
		}

		const model = runtime.models.find(
			(candidate) => candidate.id === confirmDeleteModelId,
		);
		if (!model || model.status !== "installed") {
			setConfirmDeleteModelId(null);
		}
	}, [confirmDeleteModelId, runtime.models]);

	if (runtime.isLoading || !runtime.settings || !runtime.snapshot) {
		return (
			<div className="workspace-root">
				<div className="workspace-frame loading-panel">
					<div className="loading-chip">Starting Dictate...</div>
					{runtime.runtimeError.message ? (
						<p className="panel-note">
							Retrying: {runtime.runtimeError.message}
						</p>
					) : null}
				</div>
			</div>
		);
	}

	const settings = runtime.settings;
	const snapshot = runtime.snapshot;
	const viewModel = buildDashboardViewModel({ runtime, snapshot, settings });
	const toastToRender =
		runtime.latestToast &&
		(runtime.latestToast.type === "error" ||
			runtime.latestToast.type === "warning")
			? runtime.latestToast
			: null;
	const handleSidebarCollapsedChange = (collapsed: boolean) => {
		setIsSidebarCollapsed(collapsed);
		try {
			window.localStorage.setItem(
				SIDEBAR_COLLAPSED_STORAGE_KEY,
				String(collapsed),
			);
		} catch {
			// Ignore storage write failures.
		}
	};

	return (
		<div className="workspace-root">
			<main className="workspace-frame page-enter">
				<div
					className="workspace-layout"
					data-sidebar-collapsed={isSidebarCollapsed ? "true" : "false"}
				>
					<MainSidebar
						activeSection={activeSection}
						onSectionChange={setActiveSection}
						collapsed={isSidebarCollapsed}
						onCollapsedChange={handleSidebarCollapsedChange}
						engineIndicator={viewModel.engineIndicator}
						selectedModelLabel={viewModel.selectedModelLabel}
						hotkeyLabel={viewModel.hotkeyLabel}
					/>

					<section className="content-panel">
						{activeSection === "overview" ? (
							<OverviewSection
								runtime={runtime}
								snapshot={snapshot}
								settings={settings}
								viewModel={viewModel}
							/>
						) : null}

						{activeSection === "history" ? (
							<HistorySection recentJobs={snapshot.recentJobs} />
						) : null}

						{activeSection === "models" ? (
							<ModelsSection
								runtime={runtime}
								snapshot={snapshot}
								settings={settings}
								selectedModelLabel={viewModel.selectedModelLabel}
								confirmDeleteModelId={confirmDeleteModelId}
								setConfirmDeleteModelId={setConfirmDeleteModelId}
							/>
						) : null}

						{activeSection === "settings" ? (
							<SettingsSection
								runtime={runtime}
								snapshot={snapshot}
								settings={settings}
								viewModel={viewModel}
								themePreference={themePreference}
								onThemePreferenceChange={(preference) => {
									setThemePreference(preference);
									applyThemePreference(preference);
								}}
							/>
						) : null}
					</section>
				</div>
			</main>

			{toastToRender ? <ToastBanner toast={toastToRender} /> : null}
		</div>
	);
}

export default App;
