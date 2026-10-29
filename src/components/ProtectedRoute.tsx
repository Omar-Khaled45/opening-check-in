import React, { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { UserRole } from "../types";

interface ProtectedRouteProps {
	children: React.ReactNode;
	allowedRoles?: UserRole[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
	children,
	allowedRoles,
}) => {
	const { user, role, loading, signOut } = useAuth();
	const location = useLocation();

	useEffect(() => {
		if (!loading && user && !role) {
			signOut();
		}
	}, [loading, user, role, signOut]);

	if (loading) {
		return (
			<div className="min-h-screen bg-shop-dark flex flex-col items-center justify-center p-4">
				<div className="w-12 h-12 border-4 border-shop-cream/20 border-t-shop-cream rounded-full animate-spin mb-4" />
				<p className="text-shop-cream/80 text-sm tracking-widest uppercase font-mono">
					Authenticating...
				</p>
			</div>
		);
	}

	if (!user || !role) {
		return <Navigate to="/login" state={{ from: location }} replace />;
	}

	if (allowedRoles && !allowedRoles.includes(role)) {
		if (role === "scanner") {
			return <Navigate to="/scanner" replace />;
		}

		return <Navigate to="/admin" replace />;
	}

	return <>{children}</>;
};
