import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			"@": resolve(__dirname, "src"),
		},
	},
	root: "src/mainview",
	build: {
		outDir: "../../dist",
		emptyOutDir: true,
		rollupOptions: {
			input: {
				main: resolve(__dirname, "src/mainview/index.html"),
				pill: resolve(__dirname, "src/mainview/pill.html"),
			},
		},
	},
	server: {
		port: 5173,
		strictPort: true,
	},
});
