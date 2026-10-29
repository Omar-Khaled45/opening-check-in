import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import {
	Camera,
	CheckCircle2,
	AlertTriangle,
	XCircle,
	RefreshCw,
	LogOut,
	ArrowLeft,
	Volume2,
	VolumeX,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { getUserFriendlyError } from "../lib/error";
import type { ScanGuestResponse } from "../types";

export const Scanner: React.FC = () => {
	const { role, signOut } = useAuth();
	const navigate = useNavigate();

	const [scanResult, setScanResult] = useState<ScanGuestResponse | null>(null);
	const [isProcessing, setIsProcessing] = useState(false);
	const [cameraError, setCameraError] = useState<string | null>(null);
	const [soundEnabled, setSoundEnabled] = useState(true);
	const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>(
		[],
	);
	const [selectedCameraId, setSelectedCameraId] = useState<string>("");

	const scannerRef = useRef<Html5Qrcode | null>(null);
	const audioCtxRef = useRef<AudioContext | null>(null);

	// Play audio tones using Web Audio API
	const playAudioTone = (type: "success" | "warning" | "error") => {
		if (!soundEnabled) return;
		try {
			if (!audioCtxRef.current) {
				const AudioContextClass =
					window.AudioContext ||
					(window as unknown as { webkitAudioContext: typeof AudioContext })
						.webkitAudioContext;
				audioCtxRef.current = new AudioContextClass();
			}
			const ctx = audioCtxRef.current;
			if (ctx.state === "suspended") {
				ctx.resume();
			}

			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.connect(gain);
			gain.connect(ctx.destination);

			const now = ctx.currentTime;

			if (type === "success") {
				// High, pleasant two-tone chime
				osc.type = "sine";
				osc.frequency.setValueAtTime(587.33, now); // D5
				osc.frequency.setValueAtTime(880, now + 0.1); // A5
				gain.gain.setValueAtTime(0.2, now);
				gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
				osc.start(now);
				osc.stop(now + 0.35);
			} else if (type === "warning") {
				// Double pulse warning tone
				osc.type = "triangle";
				osc.frequency.setValueAtTime(440, now);
				osc.frequency.setValueAtTime(370, now + 0.15);
				gain.gain.setValueAtTime(0.25, now);
				gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
				osc.start(now);
				osc.stop(now + 0.4);
			} else {
				// Low error buzz
				osc.type = "sawtooth";
				osc.frequency.setValueAtTime(180, now);
				gain.gain.setValueAtTime(0.25, now);
				gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
				osc.start(now);
				osc.stop(now + 0.45);
			}
		} catch (e) {
			// Audio not supported or blocked
		}
	};

	// Initialize camera and scanner
	useEffect(() => {
		let html5QrCode: Html5Qrcode;

		const startCamera = async () => {
			try {
				const devices = await Html5Qrcode.getCameras();
				if (!devices || devices.length === 0) {
					setCameraError(
						"No camera found on this device. Please ensure a camera is connected.",
					);
					return;
				}

				setCameras(devices);
				// Prefer back camera on mobile
				const backCamera = devices.find(
					(d) =>
						d.label.toLowerCase().includes("back") ||
						d.label.toLowerCase().includes("rear") ||
						d.label.toLowerCase().includes("environment"),
				);
				const camId = backCamera ? backCamera.id : devices[0].id;
				setSelectedCameraId(camId);

				html5QrCode = new Html5Qrcode("qr-reader-viewport", {
					formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
					verbose: false,
				});
				scannerRef.current = html5QrCode;

				await html5QrCode.start(
					camId,
					{
						fps: 15,
						qrbox: { width: 250, height: 250 },
						aspectRatio: 1.0,
					},
					onScanSuccess,
					() => {
						// Ignore frame-by-frame non-matches
					},
				);
				setCameraError(null);
			} catch (err: unknown) {
				console.error("Camera start error:", err);
				setCameraError(
					"Camera access was denied or is unavailable. Please grant camera permissions in your browser settings and try again.",
				);
			}
		};

		startCamera();

		return () => {
			if (scannerRef.current && scannerRef.current.isScanning) {
				scannerRef.current.stop().catch(() => {});
			}
		};
	}, []);

	// Handle scanned QR code
	const onScanSuccess = async (decodedText: string) => {
		// If already processing a scan or displaying modal, ignore
		if (isProcessing) return;

		setIsProcessing(true);

		try {
			// Stop or pause scanning momentarily
			if (scannerRef.current && scannerRef.current.isScanning) {
				await scannerRef.current.pause(true);
			}

			// Send to backend RPC
			const { data, error } = await supabase.rpc("scan_guest_qr", {
				p_qr_token: decodedText.trim(),
			});

			if (error) {
				console.error("Scan RPC error:", error);
				const errorResult: ScanGuestResponse = {
					status: "INVALID",
					message: "Unable to verify this pass right now. Please try scanning again.",
				};
				setScanResult(errorResult);
				playAudioTone("error");
			} else {
				const res = data as ScanGuestResponse;
				setScanResult({
					...res,
					message:
						res.status === "INVALID"
							? getUserFriendlyError(
									res.message,
									"The presented QR code is not recognized or has been revoked.",
								)
							: res.message,
				});

				if (res.status === "SUCCESS") {
					playAudioTone("success");
				} else if (res.status === "ALREADY_CHECKED_IN") {
					playAudioTone("warning");
				} else {
					playAudioTone("error");
				}
			}
		} catch (err) {
			console.error("Scan error:", err);
			setScanResult({
				status: "INVALID",
				message: "Unable to verify this pass right now. Please check your connection and try again.",
			});
			playAudioTone("error");
		} finally {
			setIsProcessing(false);
		}
	};

	// Resume scanning for next guest
	const handleScanNext = async () => {
		setScanResult(null);
		if (scannerRef.current) {
			try {
				scannerRef.current.resume();
			} catch (e) {
				console.warn("Resume error:", e);
			}
		}
	};

	// Switch camera if multiple cameras exist
	const handleSwitchCamera = async (newCamId: string) => {
		setSelectedCameraId(newCamId);
		if (scannerRef.current) {
			if (scannerRef.current.isScanning) {
				await scannerRef.current.stop();
			}
			await scannerRef.current.start(
				newCamId,
				{ fps: 15, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
				onScanSuccess,
				() => {},
			);
		}
	};

	return (
		<div className="min-h-screen bg-black text-shop-cream flex flex-col justify-between select-none">
			{/* Top Header */}
			<header className="bg-shop-dark/95 border-b border-shop-cream/15 p-4 z-20 flex items-center justify-between">
				<div className="flex items-center space-x-3">
					{role === "admin" && (
						<button
							onClick={() => navigate("/admin")}
							className="text-shop-cream/70 hover:text-shop-cream p-1.5 rounded-lg bg-shop-navy/60 border border-shop-cream/15"
							title="Return to Admin Dashboard"
						>
							<ArrowLeft className="w-4 h-4" />
						</button>
					)}

					<div className="flex items-center space-x-2">
						<div className="w-7 h-7 rounded bg-shop-cream text-shop-dark flex items-center justify-center font-display text-base font-black">
							B®
						</div>
						<div>
							<span className="font-display tracking-widest text-lg uppercase font-bold text-shop-cream leading-tight block">
								Entrance Check-In
							</span>
							<span className="text-[10px] uppercase tracking-wider text-shop-cream/60 font-mono">
								The Shop Opening
							</span>
						</div>
					</div>
				</div>

				<div className="flex items-center space-x-2">
					{/* Sound toggle */}
					<button
						onClick={() => setSoundEnabled(!soundEnabled)}
						className="p-2 rounded-lg bg-shop-navy/60 border border-shop-cream/15 text-shop-cream/80 hover:text-shop-cream text-xs"
						title={soundEnabled ? "Mute Audio" : "Unmute Audio"}
					>
						{soundEnabled ? (
							<Volume2 className="w-4 h-4" />
						) : (
							<VolumeX className="w-4 h-4 text-red-400" />
						)}
					</button>

					{/* Logout */}
					<button
						onClick={() => signOut()}
						className="p-2 rounded-lg bg-shop-navy/60 border border-shop-cream/15 text-shop-cream/80 hover:text-shop-cream text-xs flex items-center space-x-1"
					>
						<LogOut className="w-4 h-4" />
						<span className="hidden sm:inline">Logout</span>
					</button>
				</div>
			</header>

			{/* Camera Viewport Area */}
			<main className="flex-1 relative flex flex-col items-center justify-center p-3 sm:p-6 overflow-hidden">
				{cameraError ? (
					<div className="max-w-md w-full glass-panel p-6 rounded-2xl text-center border border-red-500/30">
						<XCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
						<h3 className="font-display text-xl uppercase font-bold text-shop-cream mb-2">
							Camera Access Required
						</h3>
						<p className="text-xs text-shop-cream/70 mb-4">{cameraError}</p>
						<button
							onClick={() => window.location.reload()}
							className="bg-shop-cream text-shop-navy font-bold text-xs py-2.5 px-5 rounded-xl uppercase tracking-wider font-sans"
						>
							Retry Camera
						</button>
					</div>
				) : (
					<div className="relative w-full max-w-sm sm:max-w-md aspect-square rounded-3xl overflow-hidden border-2 border-shop-cream/30 shadow-2xl bg-slate-900 flex items-center justify-center">
						{/* HTML5 QrCode mount target */}
						<div id="qr-reader-viewport" className="w-full h-full" />

						{/* Target Reticle Overlay */}
						<div className="absolute inset-0 pointer-events-none flex items-center justify-center">
							<div className="w-64 h-64 border-2 border-shop-cream/40 rounded-3xl relative">
								{/* Reticle corners */}
								<div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-shop-gold rounded-tl-xl" />
								<div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-shop-gold rounded-tr-xl" />
								<div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-shop-gold rounded-bl-xl" />
								<div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-shop-gold rounded-br-xl" />

								{/* Animated scan line */}
								<div className="w-full h-0.5 bg-gradient-to-r from-transparent via-shop-gold to-transparent animate-scanline" />
							</div>
						</div>

						{/* Processing Overlay */}
						{isProcessing && (
							<div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center z-20">
								<div className="w-10 h-10 border-4 border-shop-cream/20 border-t-shop-gold rounded-full animate-spin mb-3" />
								<p className="text-xs font-mono tracking-widest uppercase text-shop-cream">
									Verifying Pass...
								</p>
							</div>
						)}
					</div>
				)}

				{/* Camera Selector (if multiple) */}
				{cameras.length > 1 && (
					<div className="mt-3 flex items-center space-x-2">
						<Camera className="w-3.5 h-3.5 text-shop-cream/60" />
						<select
							value={selectedCameraId}
							onChange={(e) => handleSwitchCamera(e.target.value)}
							className="bg-shop-dark border border-shop-cream/20 rounded-lg text-xs text-shop-cream px-2.5 py-1 focus:outline-none"
						>
							{cameras.map((c) => (
								<option key={c.id} value={c.id}>
									{c.label || `Camera ${c.id.slice(0, 5)}`}
								</option>
							))}
						</select>
					</div>
				)}
			</main>

			{/* Result Card Modal / Drawer */}
			{scanResult && (
				<div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-3 sm:p-6 animate-fadeIn">
					<div
						className={`w-full max-w-md rounded-3xl p-6 sm:p-8 shadow-2xl border text-center transition-all ${
							scanResult.status === "SUCCESS"
								? "bg-emerald-950 border-emerald-500/50 text-emerald-100"
								: scanResult.status === "ALREADY_CHECKED_IN"
									? "bg-amber-950 border-amber-500/50 text-amber-100"
									: "bg-red-950 border-red-500/50 text-red-100"
						}`}
					>
						{/* Status Icon */}
						<div className="mx-auto mb-4">
							{scanResult.status === "SUCCESS" && (
								<div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-400 mx-auto flex items-center justify-center shadow-lg">
									<CheckCircle2 className="w-12 h-12 text-emerald-400" />
								</div>
							)}
							{scanResult.status === "ALREADY_CHECKED_IN" && (
								<div className="w-20 h-20 rounded-full bg-amber-500/20 border-2 border-amber-400 mx-auto flex items-center justify-center shadow-lg">
									<AlertTriangle className="w-12 h-12 text-amber-400" />
								</div>
							)}
							{scanResult.status === "INVALID" && (
								<div className="w-20 h-20 rounded-full bg-red-500/20 border-2 border-red-400 mx-auto flex items-center justify-center shadow-lg">
									<XCircle className="w-12 h-12 text-red-400" />
								</div>
							)}
						</div>

						{/* Status Heading */}
						<h2 className="font-display text-3xl sm:text-4xl uppercase tracking-wider font-bold mb-1">
							{scanResult.status === "SUCCESS" && "Admitted • Welcome"}
							{scanResult.status === "ALREADY_CHECKED_IN" &&
								"Already Checked In"}
							{scanResult.status === "INVALID" && "Entry Declined"}
						</h2>

						{/* Guest Name if available */}
						{scanResult.guest_name && (
							<div className="my-3 py-2 px-4 rounded-xl bg-black/30 border border-white/10">
								<span className="text-[11px] uppercase tracking-wider opacity-60 block">
									Guest Identity
								</span>
								<span className="font-display text-2xl sm:text-3xl font-black uppercase tracking-wide">
									{scanResult.guest_name}
								</span>
							</div>
						)}

						{/* Details / Message */}
						<p className="text-xs sm:text-sm opacity-80 my-3 leading-relaxed">
							{scanResult.status === "SUCCESS" && (
								<>
									Checked in at{" "}
									{new Date(
										scanResult.checked_in_at || Date.now(),
									).toLocaleTimeString([], {
										hour: "2-digit",
										minute: "2-digit",
										second: "2-digit",
									})}
									. Verification complete.
								</>
							)}
							{scanResult.status === "ALREADY_CHECKED_IN" && (
								<>
									This QR code was previously scanned at{" "}
									{new Date(
										scanResult.checked_in_at || Date.now(),
									).toLocaleTimeString([], {
										hour: "2-digit",
										minute: "2-digit",
									})}
									. Please verify guest identity.
								</>
							)}
							{scanResult.status === "INVALID" && (
								<>
									{getUserFriendlyError(
										scanResult.message,
										"The presented QR code is not recognized or has been revoked.",
									)}
								</>
							)}
						</p>

						{/* Next Scan Action Button */}
						<button
							onClick={handleScanNext}
							autoFocus
							className={`w-full py-4 px-6 rounded-2xl font-bold uppercase tracking-wider text-sm shadow-xl transition flex items-center justify-center space-x-2 font-sans mt-4 ${
								scanResult.status === "SUCCESS"
									? "bg-emerald-400 hover:bg-emerald-300 text-black"
									: scanResult.status === "ALREADY_CHECKED_IN"
										? "bg-amber-400 hover:bg-amber-300 text-black"
										: "bg-red-400 hover:bg-red-300 text-white"
							}`}
						>
							<RefreshCw className="w-4 h-4" />
							<span>Scan Next Guest</span>
						</button>
					</div>
				</div>
			)}

			{/* Footer Info */}
			<footer className="p-3 text-center text-[11px] text-shop-cream/50 bg-shop-dark border-t border-shop-cream/10">
				Position visitor QR code within camera frame. Results are verified
				atomically in real time.
			</footer>
		</div>
	);
};
