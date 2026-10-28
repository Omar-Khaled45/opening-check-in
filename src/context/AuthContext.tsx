import React, { createContext, useContext, useEffect, useState } from "react";
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
	children,
}) => {
	const [user, setUser] = useState<User | null>(null);
	const [role, setRole] = useState<UserRole | null>(null);
	const [loading, setLoading] = useState(true);

	const fetchRole = async (): Promise<UserRole | null> => {
		try {
			const { data, error } = await supabase.rpc("get_user_role");
			if (error) {
				console.error("Error fetching role:", error);
				return null;
			}
			return (data?.role as UserRole) || null;
		} catch (err) {
			console.error("Failed to get user role:", err);
			return null;
		}
	};

	useEffect(() => {
		let isMounted = true;

		// Initial session check
		supabase.auth.getSession().then(async ({ data: { session } }) => {
			if (!isMounted) return;
			if (session?.user) {
				setUser(session.user);
				const userRole = await fetchRole();
				if (isMounted) setRole(userRole);
			} else {
				setUser(null);
				setRole(null);
			}
			if (isMounted) setLoading(false);
		});

		// Listen to auth changes
		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange(async (_event, session) => {
			if (!isMounted) return;
			if (session?.user) {
				setUser(session.user);
				const userRole = await fetchRole();
				if (isMounted) setRole(userRole);
			} else {
				setUser(null);
				setRole(null);
			}
			if (isMounted) setLoading(false);
		});

		return () => {
			isMounted = false;
			subscription.unsubscribe();
		};
	}, []);

	const signIn = async (email: string, password: string) => {
		const { data, error } = await supabase.auth.signInWithPassword({
			email: email.trim().toLowerCase(),
			password,
		});

		if (error) {
			return { error };
		}

		if (data.user) {
			setUser(data.user);
			const userRole = await fetchRole();
			setRole(userRole);
			return { error: null, role: userRole };
		}

		return { error: null, role: null };
	};

	const signOut = async () => {
		await supabase.auth.signOut();
		setUser(null);
		setRole(null);
	};

	return (
		<AuthContext.Provider value={{ user, role, loading, signIn, signOut }}>
			{children}
		</AuthContext.Provider>
	);
};

export const useAuth = () => useContext(AuthContext);
