import React, {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { UserRole } from "../types";

interface AuthContextType {
	user: User | null;
	role: UserRole | null;
	loading: boolean;
	signIn: (
		email: string,
		password: string,
	) => Promise<{ error: Error | null; role?: UserRole | null }>;
	signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
	user: null,
	role: null,
	loading: true,
	signIn: async () => ({ error: null }),
	signOut: async () => {},
});

const isValidRole = (value: unknown): value is UserRole => {
	return value === "admin" || value === "scanner";
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
	children,
}) => {
	const [user, setUser] = useState<User | null>(null);
	const [role, setRole] = useState<UserRole | null>(null);
	const [loading, setLoading] = useState(true);
	const isSigningInRef = useRef(false);

	const fetchRole = useCallback(async (): Promise<UserRole | null> => {
		try {
			const { data, error } = await supabase.rpc("get_user_role");
			if (error) {
				console.error("Error fetching role:", error);
				return null;
			}
			const rawRole = typeof data === "string" ? data : data?.role;
			return isValidRole(rawRole) ? rawRole : null;
		} catch (err) {
			console.error("Failed to get user role:", err);
			return null;
		}
	}, []);

	const signOut = useCallback(async () => {
		try {
			await supabase.auth.signOut();
		} catch (err) {
			console.error("Error signing out:", err);
		} finally {
			setUser(null);
			setRole(null);
		}
	}, []);

	useEffect(() => {
		let isMounted = true;

		const verifySessionAndRole = async (sessionUser: User | null) => {
			if (!sessionUser) {
				if (isMounted) {
					setUser(null);
					setRole(null);
					setLoading(false);
				}
				return;
			}

			const userRole = await fetchRole();
			if (!isMounted) return;

			if (!userRole) {
				// Force sign out if role is null for any reason
				await supabase.auth.signOut();
				if (isMounted) {
					setUser(null);
					setRole(null);
					setLoading(false);
				}
				return;
			}

			setUser(sessionUser);
			setRole(userRole);
			setLoading(false);
		};

		// Initial session check
		supabase.auth.getSession().then(({ data: { session } }) => {
			if (!isMounted) return;
			verifySessionAndRole(session?.user ?? null);
		});

		// Listen to auth changes
		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange(async (_event, session) => {
			if (!isMounted || isSigningInRef.current) return;
			await verifySessionAndRole(session?.user ?? null);
		});

		return () => {
			isMounted = false;
			subscription.unsubscribe();
		};
	}, [fetchRole]);

	// If at any point loading is complete and a user exists with role = null, force sign out
	useEffect(() => {
		if (!loading && user && !role) {
			signOut();
		}
	}, [loading, user, role, signOut]);

	// Re-verify role on window focus and via realtime subscription while authenticated
	useEffect(() => {
		if (!user) return;
		let isActive = true;

		const recheckRole = async () => {
			const currentRole = await fetchRole();
			if (!isActive) return;
			if (!currentRole) {
				await signOut();
			} else if (currentRole !== role) {
				setRole(currentRole);
			}
		};

		const handleVisibilityOrFocus = () => {
			if (document.visibilityState === "visible") {
				recheckRole();
			}
		};

		window.addEventListener("focus", handleVisibilityOrFocus);
		document.addEventListener("visibilitychange", handleVisibilityOrFocus);

		const roleChannel = supabase
			.channel(`user_role_watch_${user.id}`)
			.on(
				"postgres_changes",
				{
					event: "*",
					schema: "public",
					table: "user_roles",
				},
				() => {
					recheckRole();
				},
			)
			.subscribe();

		return () => {
			isActive = false;
			window.removeEventListener("focus", handleVisibilityOrFocus);
			document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
			supabase.removeChannel(roleChannel);
		};
	}, [user, role, fetchRole, signOut]);

	const signIn = async (email: string, password: string) => {
		isSigningInRef.current = true;
		try {
			const { data, error } = await supabase.auth.signInWithPassword({
				email: email.trim().toLowerCase(),
				password,
			});

			if (error) {
				return { error };
			}

			if (data.user) {
				const userRole = await fetchRole();
				if (!userRole) {
					await supabase.auth.signOut();
					setUser(null);
					setRole(null);
					return {
						error: new Error(
							"Your account is not authorized to access this portal.",
						),
						role: null,
					};
				}

				setUser(data.user);
				setRole(userRole);
				return { error: null, role: userRole };
			}

			await supabase.auth.signOut();
			setUser(null);
			setRole(null);
			return { error: null, role: null };
		} finally {
			isSigningInRef.current = false;
		}
	};

	return (
		<AuthContext.Provider value={{ user, role, loading, signIn, signOut }}>
			{children}
		</AuthContext.Provider>
	);
};

export const useAuth = () => useContext(AuthContext);
