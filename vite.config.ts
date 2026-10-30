import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
	plugins: [react()],
	base: "/",
	build: {
		target: "es2020",
		cssTarget: "safari14",
	},
	server: {
		port: 3000,
	},
});
