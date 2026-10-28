import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Lock, Mail, ArrowRight, ShieldAlert, AlertCircle } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export const Login: React.FC = () => {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [fieldErrors, setFieldErrors] = useState<{
		email?: string;
		password?: string;
	}>({});
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	const { signIn } = useAuth();
	const navigate = useNavigate();
	const location = useLocation();

	const handleLogin = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);

		const trimmedEmail = email.trim();
		const errors: { email?: string; password?: string } = {};

		if (!trimmedEmail) {
			errors.email = "Please enter your email address.";
		} else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
			errors.email = "Please enter a valid email address.";
		}

		if (!password) {
			errors.password = "Please enter your password.";
		}

		if (errors.email || errors.password) {
			setFieldErrors(errors);
			return;
		}

		setFieldErrors({});
		setLoading(true);

		try {
			const { error: authError, role } = await signIn(trimmedEmail, password);

			if (authError) {
				setError(authError.message || "Invalid email or password.");
				setLoading(false);
				return;
			}

			// Check role and redirect accordingly
			const from = (location.state as { from?: { pathname: string } })?.from
				?.pathname;

			if (role === "admin") {
				navigate(from || "/admin", { replace: true });
			} else if (role === "scanner") {
				navigate("/scanner", { replace: true });
			} else {
				// Fallback
				navigate("/admin", { replace: true });
			}
		} catch (err: unknown) {
			setError(
				err instanceof Error
					? err.message
					: "An error occurred during authentication.",
			);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="min-h-screen bg-shop-dark text-shop-cream flex flex-col items-center justify-center p-4 relative overflow-hidden">
			{/* Background ambient lighting */}
			<div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-shop-blue/20 rounded-full blur-[140px] pointer-events-none" />

			<div className="relative z-10 w-full max-w-md">
				{/* Brand Monogram */}
				<div className="text-center mb-8">
					<div className="w-16 h-16 rounded-2xl bg-shop-cream text-shop-navy mx-auto flex items-center justify-center font-display text-4xl font-black shadow-xl mb-3">
						B®
					</div>
					<h1 className="font-display text-3xl uppercase tracking-wider text-shop-cream font-bold">
						Staff Portal
					</h1>
					<p className="text-shop-cream/60 text-xs tracking-wider uppercase mt-1">
						The Shop — Opening Event Operations
					</p>
				</div>

				{/* Login Card */}
				<div className="glass-panel rounded-2xl p-6 sm:p-8 shadow-2xl border border-shop-cream/15">
					<form onSubmit={handleLogin} noValidate className="space-y-4">
						<div>
							<label className="block text-xs font-semibold uppercase tracking-wider text-shop-cream/70 mb-2">
								Email
							</label>
							<div className="relative">
								<Mail className="w-4 h-4 text-shop-cream/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
								<input
									type="email"
									value={email}
									onChange={(e) => {
										setEmail(e.target.value);
										if (fieldErrors.email) {
											setFieldErrors((prev) => ({ ...prev, email: undefined }));
										}
										if (error) setError(null);
									}}
									placeholder="Enter Email"
									autoFocus
									aria-invalid={Boolean(fieldErrors.email)}
									className={`w-full bg-shop-navy/80 border rounded-xl pl-10 pr-4 py-3 text-shop-cream placeholder-shop-cream/30 focus:outline-none text-sm transition ${
										fieldErrors.email
											? "border-red-500 focus:border-red-500"
											: "border-shop-cream/20 focus:border-shop-gold"
									}`}
								/>
							</div>
							{fieldErrors.email && (
								<p className="text-xs text-red-400 mt-1.5 flex items-start space-x-1.5">
									<AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
									<span>{fieldErrors.email}</span>
								</p>
							)}
						</div>

						<div>
							<label className="block text-xs font-semibold uppercase tracking-wider text-shop-cream/70 mb-2">
								Password
							</label>
							<div className="relative">
								<Lock className="w-4 h-4 text-shop-cream/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
								<input
									type="password"
									value={password}
									onChange={(e) => {
										setPassword(e.target.value);
										if (fieldErrors.password) {
											setFieldErrors((prev) => ({
												...prev,
												password: undefined,
											}));
										}
										if (error) setError(null);
									}}
									placeholder="••••••••••••"
									aria-invalid={Boolean(fieldErrors.password)}
									className={`w-full bg-shop-navy/80 border rounded-xl pl-10 pr-4 py-3 text-shop-cream placeholder-shop-cream/30 focus:outline-none text-sm transition ${
										fieldErrors.password
											? "border-red-500 focus:border-red-500"
											: "border-shop-cream/20 focus:border-shop-gold"
									}`}
								/>
							</div>
							{fieldErrors.password && (
								<p className="text-xs text-red-400 mt-1.5 flex items-start space-x-1.5">
									<AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
									<span>{fieldErrors.password}</span>
								</p>
							)}
						</div>

						{error && (
							<div className="bg-red-500/15 border border-red-500/30 text-red-200 text-xs p-3.5 rounded-xl flex items-start space-x-2">
								<ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
								<span>{error}</span>
							</div>
						)}

						<button
							type="submit"
							disabled={loading}
							className="w-full bg-shop-cream hover:bg-shop-cream-light text-shop-navy font-bold py-3.5 px-6 rounded-xl transition duration-200 flex items-center justify-center space-x-2 shadow-lg disabled:opacity-50 text-sm tracking-wide uppercase font-sans mt-2"
						>
							{loading ? (
								<>
									<div className="w-4 h-4 border-2 border-shop-navy/30 border-t-shop-navy rounded-full animate-spin" />
									<span>Authenticating...</span>
								</>
							) : (
								<>
									<span>Sign In</span>
									<ArrowRight className="w-4 h-4" />
								</>
							)}
						</button>
					</form>

					<div className="mt-6 pt-5 border-t border-shop-cream/10 text-center">
						<p className="text-[11px] text-shop-cream/50">
							Restricted to authorized event management and gate personnel only.
						</p>
					</div>
				</div>
			</div>
		</div>
	);
};
