import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

function mount() {
	const container = document.getElementById("root");
	if (!container) return;
	const root = createRoot(container);
	root.render(
		<StrictMode>
			<App />
		</StrictMode>,
	);
}

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", mount, { once: true });
} else {
	mount();
}
