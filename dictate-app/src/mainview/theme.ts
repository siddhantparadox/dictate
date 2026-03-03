export type ThemePreference = "system" | "light" | "dark";
type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "dictate.theme.preference";
const SYSTEM_DARK_QUERY = "(prefers-color-scheme: dark)";

function isThemePreference(
	value: string | null | undefined,
): value is ThemePreference {
	return value === "system" || value === "light" || value === "dark";
}

function readStoredPreference(): ThemePreference {
	try {
		const stored = window.localStorage.getItem(STORAGE_KEY);
		return isThemePreference(stored) ? stored : "system";
	} catch {
		return "system";
	}
}

function getResolvedTheme(preference: ThemePreference): ResolvedTheme {
	if (preference === "system") {
		return window.matchMedia(SYSTEM_DARK_QUERY).matches ? "dark" : "light";
	}
	return preference;
}

export function getThemePreference(): ThemePreference {
	const current = document.documentElement.dataset.themePreference;
	if (isThemePreference(current)) {
		return current;
	}
	return readStoredPreference();
}

export function applyThemePreference(preference: ThemePreference): void {
	const resolved = getResolvedTheme(preference);
	document.documentElement.dataset.themePreference = preference;
	document.documentElement.dataset.theme = resolved;
	try {
		window.localStorage.setItem(STORAGE_KEY, preference);
	} catch {
		// Ignore storage write failures (private mode, sandboxed contexts).
	}
}

export function initThemeSync(): void {
	applyThemePreference(readStoredPreference());

	const media = window.matchMedia(SYSTEM_DARK_QUERY);
	const onMediaChange = () => {
		if (getThemePreference() === "system") {
			applyThemePreference("system");
		}
	};
	media.addEventListener("change", onMediaChange);

	window.addEventListener("storage", (event) => {
		if (event.key !== STORAGE_KEY || !isThemePreference(event.newValue)) {
			return;
		}
		applyThemePreference(event.newValue);
	});
}
