import {
	Boxes,
	History,
	LayoutDashboard,
	Mic,
	PanelLeftClose,
	PanelLeftOpen,
	SlidersHorizontal,
} from "lucide-react";
import type { EngineIndicator, MainSection } from "./view-model";

interface MainSidebarProps {
	activeSection: MainSection;
	onSectionChange: (section: MainSection) => void;
	collapsed: boolean;
	onCollapsedChange: (collapsed: boolean) => void;
	engineIndicator: EngineIndicator;
	selectedModelLabel: string;
	hotkeyLabel: string;
}

const NAV_ITEMS: Array<{
	section: MainSection;
	label: string;
	icon: typeof LayoutDashboard;
}> = [
	{ section: "overview", label: "Overview", icon: LayoutDashboard },
	{ section: "history", label: "History", icon: History },
	{ section: "models", label: "Models", icon: Boxes },
	{ section: "settings", label: "Settings", icon: SlidersHorizontal },
];

export function MainSidebar({
	activeSection,
	onSectionChange,
	collapsed,
	onCollapsedChange,
	engineIndicator,
	selectedModelLabel,
	hotkeyLabel,
}: MainSidebarProps) {
	const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

	return (
		<aside className="sidebar">
			<div className="sidebar-header">
				<div className="brand-row">
					<div className="brand-icon">
						<Mic className="h-4 w-4" />
					</div>
					<div className="sidebar-brand-copy">
						<p className="brand-title">Dictate</p>
						<p className="brand-subtitle">Precision voice</p>
					</div>
				</div>
				<button
					type="button"
					className="sidebar-toggle"
					aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
					onClick={() => onCollapsedChange(!collapsed)}
				>
					<ToggleIcon className="h-4 w-4" />
				</button>
			</div>

			<nav className="sidebar-nav" aria-label="Primary">
				{NAV_ITEMS.map(({ section, label, icon: Icon }) => {
					const isActive = activeSection === section;
					return (
						<button
							type="button"
							key={section}
							title={collapsed ? label : undefined}
							className={isActive ? "active" : undefined}
							aria-current={isActive ? "page" : undefined}
							onClick={() => onSectionChange(section)}
						>
							<span className="sidebar-nav-icon">
								<Icon className="h-4 w-4" />
							</span>
							<span className="sidebar-nav-label">{label}</span>
						</button>
					);
				})}
			</nav>

			<div className="sidebar-footer">
				<div className="sidebar-info-block sidebar-runtime-block compact">
					<span className={`status-pill ${engineIndicator.kind}`}>
						{engineIndicator.label}
					</span>
					<p className="sidebar-meta-text">{selectedModelLabel}</p>
					<div className="sidebar-inline-meta">
						<span className="sidebar-meta-label">Hotkey</span>
						<p className="sidebar-hotkey">{hotkeyLabel}</p>
					</div>
				</div>
			</div>
		</aside>
	);
}
