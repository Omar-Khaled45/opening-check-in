import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { GuestPortal } from "./pages/GuestPortal";
import { Login } from "./pages/Login";
import { AdminDashboard } from "./pages/AdminDashboard";
import { Scanner } from "./pages/Scanner";

export const App: React.FC = () => {
	return (
		<AuthProvider>
			<BrowserRouter>
				<Routes>
					{/* Public Guest Portal */}
					<Route path="/" element={<GuestPortal />} />
					<Route path="/invite/:token" element={<GuestPortal />} />

					{/* Staff Login */}
					<Route path="/login" element={<Login />} />

					{/* Admin Dashboard: Admin only */}
					<Route
						path="/admin"
						element={
							<ProtectedRoute allowedRoles={["admin"]}>
								<AdminDashboard />
							</ProtectedRoute>
						}
					/>

					{/* Scanner: Admin and Scanner Staff */}
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
			</BrowserRouter>
		</AuthProvider>
	);
};

export default App;
