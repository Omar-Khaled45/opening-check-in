import React, { useState, useEffect } from "react";
import { useSearchParams, useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import confetti from "canvas-confetti";
import {
	Calendar,
	Clock,
	MapPin,
	ShieldCheck,
	ArrowRight,
	Sparkles,
	CheckCircle2,
	AlertCircle,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import type { VerifyGuestResponse } from "../types";

export const GuestPortal: React.FC = () => {
	const [searchParams] = useSearchParams();
	const { token: routeToken } = useParams<{ token?: string }>();

	// Support ?token=..., ?invite=..., or /invite/:token
	const inviteTokenFromUrl =
		searchParams.get("token") || searchParams.get("invite") || routeToken || "";

	const [tokenInput, setTokenInput] = useState(inviteTokenFromUrl);
	const [phone, setPhone] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [verifiedData, setVerifiedData] = useState<VerifyGuestResponse | null>(
		null,
	);

	useEffect(() => {
		if (inviteTokenFromUrl) {
			setTokenInput(inviteTokenFromUrl);
		}
	}, [inviteTokenFromUrl]);

	const activeToken = inviteTokenFromUrl || tokenInput.trim();

	const handleVerify = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!activeToken) {
			setError("Please provide a valid invitation link or invitation code.");
			return;
		}
		if (!phone.trim()) {
			setError("Please enter your mobile phone number.");
			return;
		}

		setLoading(true);
		setError(null);

		try {
			const { data, error: rpcError } = await supabase.rpc(
				"verify_guest_invite",
				{
					p_invite_token: activeToken,
					p_phone: phone.trim(),
				},
			);

			if (rpcError) {
				setError(
					rpcError.message || "Verification service temporarily unavailable.",
				);
				setLoading(false);
				return;
			}

			const res = data as VerifyGuestResponse;
			if (!res || !res.success) {
				setError(
					res?.error ||
						"Verification failed. Please check the mobile number entered.",
				);
				setLoading(false);
				return;
			}

			setVerifiedData(res);
			// Trigger subtle celebration confetti
			try {
				confetti({
					particleCount: 50,
					spread: 60,
					origin: { y: 0.7 },
					colors: ["#f4ebda", "#1b4965", "#2d5a3f", "#c99a45"],
				});
			} catch (e) {
				// Confetti is a visual extra
			}
		} catch (err: unknown) {
			setError(
				err instanceof Error
					? err.message
					: "An unexpected error occurred. Please try again.",
			);
		} finally {
			setLoading(false);
		}
	};

	const handleDownloadCalendar = () => {
		const icsContent = [
			"BEGIN:VCALENDAR",
			"VERSION:2.0",
			"PRODID:-//The Shop//Opening Check In//EN",
			"CALSCALE:GREGORIAN",
			"BEGIN:VEVENT",
			"SUMMARY:The Shop — Private Store Opening",
			"DESCRIPTION:Private store opening celebration for The Shop. Present your digital QR code at entrance.",
			"LOCATION:The Shop, Cairo, Egypt",
			"DTSTART:20261212T160000Z", // 6:00 PM Africa/Cairo (UTC+2) is 16:00:00Z
			"DTEND:20261212T200000Z",
			"STATUS:CONFIRMED",
			"END:VEVENT",
			"END:VCALENDAR",
		].join("\r\n");

		const blob = new Blob([icsContent], {
			type: "text/calendar;charset=utf-8",
		});
		const link = document.createElement("a");
		link.href = window.URL.createObjectURL(blob);
		link.setAttribute("download", "the-shop-opening.ics");
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	};

	return (
		<div className="min-h-screen bg-shop-dark text-shop-cream flex flex-col justify-between relative overflow-hidden">
			{/* Background ambient lighting */}
			<div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-shop-blue/20 rounded-full blur-[140px] pointer-events-none" />
			<div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-shop-rust/10 rounded-full blur-[160px] pointer-events-none" />

			{/* Header */}
			<header className="relative z-10 w-full max-w-4xl mx-auto px-6 pt-8 pb-4 flex items-center justify-between">
				<div className="flex items-center space-x-3">
					<div className="w-10 h-10 rounded-lg bg-shop-cream text-shop-dark flex items-center justify-center font-display text-2xl font-black shadow-lg">
						B®
					</div>
					<div>
						<span className="font-display tracking-widest text-2xl uppercase font-bold text-shop-cream">
							BAZARNA®
						</span>
						<span className="block text-[11px] tracking-widest uppercase text-shop-cream/70 font-medium">
							The Shop Private Opening
						</span>
					</div>
				</div>
				<div className="hidden sm:flex items-center space-x-2 bg-shop-navy/60 border border-shop-cream/15 px-3 py-1.5 rounded-full text-xs text-shop-cream/90 font-medium">
					<Sparkles className="w-3.5 h-3.5 text-shop-gold" />
					<span>Private Invitation Only</span>
				</div>
			</header>

			{/* Main Content */}
			<main className="relative z-10 max-w-xl w-full mx-auto px-4 py-8 flex-1 flex flex-col justify-center">
				{!verifiedData ? (
					/* Phone Verification Card */
					<div className="glass-panel rounded-2xl p-6 sm:p-8 shadow-2xl relative">
						<div className="mb-6 text-center">
							<div className="inline-block mb-3 px-3 py-1 rounded-full bg-shop-cream/10 border border-shop-cream/20 text-xs font-semibold tracking-wider uppercase text-shop-cream">
								VIP Access
							</div>
							<h1 className="font-display text-4xl sm:text-5xl uppercase tracking-wider text-shop-cream mb-2 font-bold">
								The Shop
							</h1>
							<p className="text-shop-cream/80 text-sm max-w-md mx-auto leading-relaxed">
								You are cordially invited to celebrate the grand private opening
								of The Shop. Please enter your registered mobile number to
								retrieve your entry pass.
							</p>
						</div>

						{/* Event Overview Pill Grid */}
						<div className="grid grid-cols-2 gap-2.5 mb-8 text-xs bg-shop-navy/40 p-3 rounded-xl border border-shop-cream/10">
							<div className="flex items-center space-x-2 text-shop-cream/90">
								<Calendar className="w-4 h-4 text-shop-gold shrink-0" />
								<span>Dec 12, 2026</span>
							</div>
							<div className="flex items-center space-x-2 text-shop-cream/90">
								<Clock className="w-4 h-4 text-shop-gold shrink-0" />
								<span>6:00 PM (Cairo)</span>
							</div>
							<div className="flex items-center space-x-2 text-shop-cream/90 col-span-2">
								<MapPin className="w-4 h-4 text-shop-gold shrink-0" />
								<span>The Shop, Cairo, Egypt</span>
							</div>
						</div>

						<form onSubmit={handleVerify} className="space-y-4">
							{!inviteTokenFromUrl && (
								<div>
									<label className="block text-xs font-semibold uppercase tracking-wider text-shop-cream/70 mb-1">
										Invitation Code
									</label>
									<input
										type="text"
										value={tokenInput}
										onChange={(e) => setTokenInput(e.target.value)}
										placeholder="e.g. inv_ab12cd34"
										required
										className="w-full bg-shop-navy/80 border border-shop-cream/20 rounded-xl px-4 py-3 text-shop-cream placeholder-shop-cream/40 focus:outline-none focus:border-shop-gold text-sm transition"
									/>
									<p className="text-[11px] text-shop-cream/50 mt-1">
										Found in your personal invite link.
									</p>
								</div>
							)}

							<div>
								<label className="block text-xs font-semibold uppercase tracking-wider text-shop-cream/70 mb-1">
									Registered Mobile Number
								</label>
								<div className="relative">
									<input
										type="tel"
										value={phone}
										onChange={(e) => setPhone(e.target.value)}
										placeholder="01012345678 or +201..."
										required
										autoFocus
										className="w-full bg-shop-navy/80 border border-shop-cream/20 rounded-xl px-4 py-3 text-shop-cream placeholder-shop-cream/40 focus:outline-none focus:border-shop-gold text-sm tracking-wide transition font-mono"
									/>
								</div>
								<p className="text-[11px] text-shop-cream/50 mt-1">
									Enter the Egyptian phone number your invitation was sent to.
								</p>
							</div>

							{error && (
								<div className="bg-red-500/15 border border-red-500/30 text-red-200 text-xs p-3.5 rounded-xl flex items-start space-x-2">
									<AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
									<span>{error}</span>
								</div>
							)}

							<button
								type="submit"
								disabled={loading}
								className="w-full bg-shop-cream hover:bg-shop-cream-light text-shop-navy font-bold py-3.5 px-6 rounded-xl transition duration-200 flex items-center justify-center space-x-2 shadow-lg disabled:opacity-50 text-sm tracking-wide uppercase font-sans"
							>
								{loading ? (
									<>
										<div className="w-4 h-4 border-2 border-shop-navy/30 border-t-shop-navy rounded-full animate-spin" />
										<span>Verifying Invitation...</span>
									</>
								) : (
									<>
										<span>Unlock Digital Pass</span>
										<ArrowRight className="w-4 h-4" />
									</>
								)}
							</button>
						</form>
					</div>
				) : (
					/* Personalized Digital Invitation Pass */
					<div className="animate-fadeIn">
						{/* The Pass Card */}
						<div className="bg-shop-cream text-shop-navy rounded-3xl overflow-hidden shadow-2xl border border-shop-cream/30">
							{/* Card Header */}
							<div className="bg-shop-navy text-shop-cream p-6 pb-5 border-b border-shop-cream/15 text-center relative">
								<div className="flex items-center justify-between mb-2">
									<span className="text-[11px] font-mono tracking-widest uppercase bg-shop-cream/10 px-2.5 py-1 rounded-full border border-shop-cream/20">
										Official Entry Pass
									</span>
									<div className="flex items-center space-x-1 text-xs text-shop-gold font-semibold">
										<ShieldCheck className="w-4 h-4" />
										<span>Verified</span>
									</div>
								</div>
								<h2 className="font-display text-3xl sm:text-4xl tracking-wider uppercase font-bold text-shop-cream">
									The Shop
								</h2>
								<p className="text-xs uppercase tracking-widest text-shop-cream/70 font-medium">
									Grand Opening Ceremony
								</p>
							</div>

							{/* Guest Details */}
							<div className="p-6 text-center">
								<p className="text-xs font-semibold uppercase tracking-wider text-shop-navy/60 mb-1">
									Admit One
								</p>
								<h3 className="font-display text-3xl sm:text-4xl uppercase tracking-wide font-black text-shop-navy mb-4">
									{verifiedData.guest_name}
								</h3>

								{/* QR Code Container */}
								<div className="inline-block p-4 bg-white rounded-2xl shadow-inner border border-shop-navy/10 mb-4">
									{verifiedData.qr_token && (
										<QRCodeSVG
											value={verifiedData.qr_token}
											size={200}
											level="H"
											includeMargin={true}
										/>
									)}
								</div>

								{/* Scan Status Badge */}
								<div className="mb-6">
									{verifiedData.checked_in ? (
										<div className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-300">
											<CheckCircle2 className="w-4 h-4 text-emerald-600" />
											<span>Checked-In at Entrance</span>
										</div>
									) : (
										<div className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-shop-navy/5 text-shop-navy text-xs font-bold border border-shop-navy/15">
											<span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
											<span>Valid Invitation — Present at Entrance</span>
										</div>
									)}
								</div>

								{/* Event Schedule Info */}
								<div className="bg-shop-cream-dark/40 rounded-xl p-4 text-left text-xs space-y-2 border border-shop-navy/10 text-shop-navy mb-5">
									<div className="flex items-center justify-between">
										<span className="text-shop-navy/60">Date:</span>
										<span className="font-bold">
											Saturday, December 12, 2026
										</span>
									</div>
									<div className="flex items-center justify-between">
										<span className="text-shop-navy/60">Doors Open:</span>
										<span className="font-bold">6:00 PM (Africa/Cairo)</span>
									</div>
									<div className="flex items-center justify-between">
										<span className="text-shop-navy/60">Location:</span>
										<span className="font-bold">The Shop, Cairo</span>
									</div>
								</div>

								{/* Actions */}
								<div className="flex flex-col sm:flex-row gap-2.5">
									<button
										onClick={handleDownloadCalendar}
										className="flex-1 bg-shop-navy hover:bg-shop-dark text-shop-cream text-xs font-bold py-3 px-4 rounded-xl transition flex items-center justify-center space-x-2"
									>
										<Calendar className="w-4 h-4" />
										<span>Add to Calendar</span>
									</button>
									<button
										onClick={() => window.print()}
										className="flex-1 bg-shop-cream-dark/60 hover:bg-shop-cream-dark text-shop-navy text-xs font-bold py-3 px-4 rounded-xl transition flex items-center justify-center space-x-2 border border-shop-navy/20"
									>
										<span>Save Pass / Print</span>
									</button>
								</div>
							</div>
						</div>

						<p className="text-center text-xs text-shop-cream/60 mt-4">
							You can reopen this link at any time to display your pass.
						</p>
					</div>
				)}
			</main>

			{/* Footer */}
			<footer className="relative z-10 w-full max-w-4xl mx-auto px-6 py-6 text-center text-xs text-shop-cream/50">
				<p>© 2026 The Shop & BAZARNA®. All rights reserved.</p>
			</footer>
		</div>
	);
};
