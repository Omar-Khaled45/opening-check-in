import React, { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { GuestPortal } from "./pages/GuestPortal";

const Login = lazy(() =>
	import("./pages/Login").then((m) => ({ default: m.Login })),
);
const AdminDashboard = lazy(() =>
	import("./pages/AdminDashboard").then((m) => ({ default: m.AdminDashboard })),
);
const Scanner = lazy(() =>
	import("./pages/Scanner").then((m) => ({ default: m.Scanner })),
);

const PageLoader: React.FC = () => (
	<div className="min-h-screen bg-shop-dark flex flex-col items-center justify-center p-4">
		<div className="w-10 h-10 border-3 border-shop-cream/20 border-t-shop-gold rounded-full animate-spin mb-4" />
	</div>
);

export const App: React.FC = () => {
	return (
		<AuthProvider>
			<BrowserRouter>
				<Suspense fallback={<PageLoader />}>
					<Routes>
						{/* Public Guest Portal: Direct eager load for guests */}
						<Route path="/" element={<GuestPortal />} />
						<Route path="/invite/:token" element={<GuestPortal />} />

						{/* Staff Login */}
						<Route path="/login" element={<Login />} />

						{/* Admin Dashboard: Admin only (lazy loaded with xlsx) */}
						<Route
							path="/admin"
							element={
								<ProtectedRoute allowedRoles={["admin"]}>
									<AdminDashboard />
								</ProtectedRoute>
							}
						/>

						{/* Scanner: Admin and Scanner Staff (lazy loaded with html5-qrcode) */}
						<Route
							path="/scanner"
							element={
								<ProtectedRoute allowedRoles={["admin", "scanner"]}>
									<Scanner />
								</ProtectedRoute>
							}
						/>

						{/* Fallback to home */}
						<Route path="*" element={<Navigate to="/" replace />} />
					</Routes>
				</Suspense>
			</BrowserRouter>
		</AuthProvider>
	);
};

export default App;
