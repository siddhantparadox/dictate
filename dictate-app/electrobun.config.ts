import type { ElectrobunConfig } from "electrobun";

export default {
	app: {
		name: "dictate",
		identifier: "dev.dictate.desktop",
		version: "0.1.0",
	},
	runtime: {
		exitOnLastWindowClosed: false,
	},
	build: {
		// Vite builds to dist/, we copy from there
		copy: {
			"dist/index.html": "views/mainview/index.html",
			"dist/assets": "views/mainview/assets",
		},
		// Ignore Vite output in watch mode — HMR handles view rebuilds separately
		watchIgnore: ["dist/**"],
		mac: {
			bundleCEF: false,
		},
		linux: {
			bundleCEF: false,
			icon: "../icon.png",
		},
		win: {
			bundleCEF: false,
			icon: "../icon.ico",
		},
	},
} satisfies ElectrobunConfig;
