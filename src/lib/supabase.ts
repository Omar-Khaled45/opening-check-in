import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	console.warn(
		"Supabase URL or Anon Key is missing. Check your environment variables.",
	);
}

// Memory fallback storage for Safari / iOS in-app webviews when localStorage throws SecurityError
const memoryStore = new Map<string, string>();
const safeStorage = {
	getItem: (key: string): string | null => {
		try {
			if (typeof window !== "undefined" && window.localStorage) {
				return window.localStorage.getItem(key);
			}
			return memoryStore.get(key) ?? null;
		} catch {
			return memoryStore.get(key) ?? null;
		}
	},
	setItem: (key: string, value: string): void => {
		try {
			if (typeof window !== "undefined" && window.localStorage) {
				window.localStorage.setItem(key, value);
				return;
			}
			memoryStore.set(key, value);
		} catch {
			memoryStore.set(key, value);
		}
	},
	removeItem: (key: string): void => {
		try {
			if (typeof window !== "undefined" && window.localStorage) {
				window.localStorage.removeItem(key);
				return;
			}
			memoryStore.delete(key);
		} catch {
			memoryStore.delete(key);
		}
	},
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey || "", {
	auth: {
		storage: safeStorage,
		persistSession: true,
		autoRefreshToken: true,
	},
});
