import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import PillOverlayApp from "./PillOverlayApp";
import { rpcClient } from "./rpc-client";
import { initThemeSync } from "./theme";

const rootElement = document.getElementById("root");
if (!rootElement) {
	throw new Error("Root element #root was not found.");
}

const documentView = document.documentElement.dataset.view;
const searchParams = new URLSearchParams(window.location.search);
const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
const view =
	documentView ?? searchParams.get("view") ?? hashParams.get("view") ?? "main";
document.documentElement.dataset.view = view;
initThemeSync();

window.addEventListener("error", (event) => {
	void rpcClient.reportRendererError(
		`${view}:window-error`,
		event.error ?? event.message,
	);
});

window.addEventListener("unhandledrejection", (event) => {
	void rpcClient.reportRendererError(
		`${view}:unhandled-rejection`,
		event.reason,
	);
});

createRoot(rootElement).render(view === "pill" ? <PillOverlayApp /> : <App />);
