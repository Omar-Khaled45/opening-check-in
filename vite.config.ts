import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
	plugins: [react()],
	base: "/",
	build: {
		target: "es2020",
		cssTarget: "safari14",
		rollupOptions: {
			output: {
				manualChunks(id: string) {
					if (
						id.includes("node_modules/react/") ||
						id.includes("node_modules/react-dom/") ||
						id.includes("node_modules/react-router-dom/")
					) {
						return "vendor";
					}
					if (id.includes("node_modules/@supabase/")) {
						return "supabase";
					}
				},
			},
		},
	},
	server: {
		port: 3000,
	},
});
