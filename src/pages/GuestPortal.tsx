import React, { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useParams } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
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
	Download,
	ShieldAlert,
	Lock,
	X,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import {
	getFirstName,
	isValidEgyptianPhone,
	isValidInviteTokenFormat,
} from "../lib/phone";
import { getUserFriendlyError } from "../lib/error";
import type { VerifyGuestResponse } from "../types";

type TokenStatus = "checking" | "valid" | "invalid" | "missing";

export const GuestPortal: React.FC = () => {
	const [searchParams] = useSearchParams();
	const { token: routeToken } = useParams<{ token?: string }>();

	// Support ?token=..., ?invite=..., or /invite/:token
	const inviteTokenFromUrl = (
		searchParams.get("token") ||
		searchParams.get("invite") ||
		routeToken ||
		""
	).trim();

	const [tokenStatus, setTokenStatus] = useState<TokenStatus>(() => {
		if (!inviteTokenFromUrl) return "missing";
		if (!isValidInviteTokenFormat(inviteTokenFromUrl)) return "invalid";
		return "checking";
	});
	const [tokenErrorReason, setTokenErrorReason] = useState<string | null>(null);
	const [phone, setPhone] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [verifiedData, setVerifiedData] = useState<VerifyGuestResponse | null>(
		null,
	);
	const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
	const [passImageUrl, setPassImageUrl] = useState<string | null>(null);
	const [isPassPreviewOpen, setIsPassPreviewOpen] = useState(false);
	const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
	const passAssetsRef = useRef<{
		dataUrl: string;
		blob: Blob;
		file: File;
		fileName: string;
	} | null>(null);

	// Validate the invitation token from the URL on page load
	useEffect(() => {
		let isCancelled = false;
		setVerifiedData(null);
		setError(null);

		if (!inviteTokenFromUrl) {
			setTokenStatus("missing");
			setTokenErrorReason(null);
			return;
		}

		if (!isValidInviteTokenFormat(inviteTokenFromUrl)) {
			setTokenStatus("invalid");
			setTokenErrorReason(
				"This invitation link is invalid or malformed. Please use the exact link sent to you.",
			);
			return;
		}

		const verifyTokenExists = async () => {
			setTokenStatus("checking");
			setTokenErrorReason(null);

			try {
				const { data, error: rpcError } = await supabase.rpc(
					"verify_guest_invite",
					{
						p_invite_token: inviteTokenFromUrl,
						p_phone: "__token_check__",
					},
				);

				if (isCancelled) return;

				if (rpcError) {
					setTokenStatus("invalid");
					setTokenErrorReason(
						"Unable to verify this invitation link right now. Please try again shortly.",
					);
					return;
				}

				const res = data as VerifyGuestResponse | null;
				if (res?.success) {
					setTokenStatus("valid");
					return;
				}

				const errMsg = (res?.error || "").toLowerCase();
				// If the RPC reached the phone number comparison step, the token itself exists and is active
				const isPhoneMismatchError =
					errMsg.includes("phone") ||
					errMsg.includes("mobile") ||
					errMsg.includes("number");

				if (isPhoneMismatchError) {
					setTokenStatus("valid");
				} else {
					setTokenStatus("invalid");
					setTokenErrorReason(
						getUserFriendlyError(
							res?.error,
							"This invitation link is not recognized or is no longer valid.",
						),
					);
				}
			} catch {
				if (!isCancelled) {
					setTokenStatus("invalid");
					setTokenErrorReason(
						"Unable to verify this invitation link. Please check your connection and try again.",
					);
				}
			}
		};

		verifyTokenExists();

		return () => {
			isCancelled = true;
		};
	}, [inviteTokenFromUrl]);

	const handleVerify = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!inviteTokenFromUrl || tokenStatus !== "valid") {
			setError("Please open a valid personal invitation link.");
			return;
		}
		if (!phone.trim()) {
			setError("Please enter your mobile phone number.");
			return;
		}
		if (!isValidEgyptianPhone(phone.trim())) {
			setError(
				"Please enter a valid Egyptian mobile number (e.g. 01012345678 or +201xxxxxxxxx).",
			);
			return;
		}

		setLoading(true);
		setError(null);

		try {
			const { data, error: rpcError } = await supabase.rpc(
				"verify_guest_invite",
				{
					p_invite_token: inviteTokenFromUrl,
					p_phone: phone.trim(),
				},
			);

			if (rpcError) {
				setError(
					"Unable to verify your invitation right now. Please try again shortly.",
				);
				setLoading(false);
				return;
			}

			const res = data as VerifyGuestResponse;
			if (!res || !res.success) {
				const errMsg = (res?.error || "").toLowerCase();
				const isPhoneMismatchError =
					errMsg.includes("phone") ||
					errMsg.includes("mobile") ||
					errMsg.includes("number");

				if (res?.error && !isPhoneMismatchError) {
					setTokenStatus("invalid");
					setTokenErrorReason(
						getUserFriendlyError(
							res.error,
							"This invitation link is not recognized or is no longer valid.",
						),
					);
					setLoading(false);
					return;
				}

				setError(
					getUserFriendlyError(
						res?.error,
						"Verification failed. Please check the mobile number entered.",
					),
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
		} catch {
			setError("An unexpected error occurred. Please try again.");
		} finally {
			setLoading(false);
		}
	};

	const buildPassAssets = useCallback(() => {
		const qrCanvas = qrCanvasRef.current;
		if (!qrCanvas || !verifiedData) return null;

		try {
			const qrDataUrl = qrCanvas.toDataURL("image/png");
			setQrImageUrl(qrDataUrl);
		} catch {
			// Ignore QR preview data URL error
		}

		const width = 1080;
		const height = 1560;
		const exportCanvas = document.createElement("canvas");
		exportCanvas.width = width;
		exportCanvas.height = height;
		const ctx = exportCanvas.getContext("2d");
		if (!ctx) return null;

		const drawRoundedRect = (
			x: number,
			y: number,
			w: number,
			h: number,
			r: number,
		) => {
			ctx.beginPath();
			ctx.moveTo(x + r, y);
			ctx.lineTo(x + w - r, y);
			ctx.quadraticCurveTo(x + w, y, x + w, y + r);
			ctx.lineTo(x + w, y + h - r);
			ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
			ctx.lineTo(x + r, y + h);
			ctx.quadraticCurveTo(x, y + h, x, y + h - r);
			ctx.lineTo(x, y + r);
			ctx.quadraticCurveTo(x, y, x + r, y);
			ctx.closePath();
		};

		// 1. Ambient Dark Navy Backdrop
		const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
		bgGrad.addColorStop(0, "#081726");
		bgGrad.addColorStop(0.5, "#0e243a");
		bgGrad.addColorStop(1, "#0a1b2e");
		ctx.fillStyle = bgGrad;
		ctx.fillRect(0, 0, width, height);

		// Subtle radial gold & blue ambient lighting
		const topGlow = ctx.createRadialGradient(
			width / 2,
			140,
			20,
			width / 2,
			140,
			520,
		);
		topGlow.addColorStop(0, "rgba(201, 154, 69, 0.18)");
		topGlow.addColorStop(1, "rgba(201, 154, 69, 0)");
		ctx.fillStyle = topGlow;
		ctx.fillRect(0, 0, width, height);

		const bottomGlow = ctx.createRadialGradient(
			width / 2,
			height - 160,
			40,
			width / 2,
			height - 160,
			560,
		);
		bottomGlow.addColorStop(0, "rgba(27, 73, 101, 0.35)");
		bottomGlow.addColorStop(1, "rgba(27, 73, 101, 0)");
		ctx.fillStyle = bottomGlow;
		ctx.fillRect(0, 0, width, height);

		// Outer decorative frame border
		drawRoundedRect(36, 36, width - 72, height - 72, 52);
		ctx.strokeStyle = "rgba(244, 235, 218, 0.08)";
		ctx.lineWidth = 2;
		ctx.stroke();

		// 2. Main Ticket Card Geometry
		const cardX = 76;
		const cardY = 76;
		const cardW = width - cardX * 2; // 928
		const cardH = height - cardY * 2; // 1408
		const cardR = 44;
		const headerH = 320;
		const perfY = cardY + 1075;

		// Card Drop Shadow
		ctx.save();
		drawRoundedRect(cardX, cardY, cardW, cardH, cardR);
		ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
		ctx.shadowBlur = 50;
		ctx.shadowOffsetY = 24;
		ctx.fillStyle = "#f4ebda";
		ctx.fill();
		ctx.restore();

		// Clip to Main Ticket Card
		ctx.save();
		drawRoundedRect(cardX, cardY, cardW, cardH, cardR);
		ctx.clip();

		// Card Cream Body Background
		const bodyGrad = ctx.createLinearGradient(
			0,
			cardY + headerH,
			0,
			cardY + cardH,
		);
		bodyGrad.addColorStop(0, "#fbf8f1");
		bodyGrad.addColorStop(1, "#f4ebda");
		ctx.fillStyle = bodyGrad;
		ctx.fillRect(cardX, cardY, cardW, cardH);

		// 3. Card Header Banner
		const headerGrad = ctx.createLinearGradient(
			cardX,
			cardY,
			cardX + cardW,
			cardY + headerH,
		);
		headerGrad.addColorStop(0, "#16395b");
		headerGrad.addColorStop(0.55, "#12304d");
		headerGrad.addColorStop(1, "#0e243a");
		ctx.fillStyle = headerGrad;
		ctx.fillRect(cardX, cardY, cardW, headerH);

		// Header ambient gold glow
		const headerGlow = ctx.createRadialGradient(
			width / 2,
			cardY + 40,
			10,
			width / 2,
			cardY + 40,
			380,
		);
		headerGlow.addColorStop(0, "rgba(201, 154, 69, 0.18)");
		headerGlow.addColorStop(1, "rgba(201, 154, 69, 0)");
		ctx.fillStyle = headerGlow;
		ctx.fillRect(cardX, cardY, cardW, headerH);

		// Header Top Row: Brand Monogram (Left) + VIP Verified Badge (Right)
		const topBarY = cardY + 42;
		const logoX = cardX + 48;
		drawRoundedRect(logoX, topBarY, 56, 56, 14);
		ctx.fillStyle = "#f4ebda";
		ctx.fill();

		ctx.fillStyle = "#0e243a";
		ctx.font = '700 32px "Bebas Neue", "Oswald", sans-serif';
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText("B®", logoX + 28, topBarY + 30);

		ctx.textAlign = "left";
		ctx.textBaseline = "alphabetic";
		ctx.fillStyle = "#f4ebda";
		ctx.font = '700 26px "Bebas Neue", "Oswald", sans-serif';
		ctx.fillText("BAZARNA®", logoX + 72, topBarY + 27);

		ctx.fillStyle = "rgba(244, 235, 218, 0.65)";
		ctx.font = '600 13px "Plus Jakarta Sans", system-ui, sans-serif';
		ctx.fillText("PRIVATE OPENING", logoX + 72, topBarY + 47);

		// Right VIP Pill Badge
		const badgeW = 220;
		const badgeH = 42;
		const badgeX = cardX + cardW - 48 - badgeW;
		const badgeY = topBarY + 7;
		drawRoundedRect(badgeX, badgeY, badgeW, badgeH, 21);
		ctx.fillStyle = "rgba(201, 154, 69, 0.14)";
		ctx.fill();
		ctx.strokeStyle = "rgba(201, 154, 69, 0.5)";
		ctx.lineWidth = 1.5;
		ctx.stroke();

		ctx.fillStyle = "#e5b869";
		ctx.font = '700 13px "Plus Jakarta Sans", system-ui, sans-serif';
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText("✦  OFFICIAL ENTRY PASS", badgeX + badgeW / 2, badgeY + 21);

		// Center Header Main Title
		ctx.textAlign = "center";
		ctx.textBaseline = "alphabetic";
		ctx.fillStyle = "#f4ebda";
		ctx.font = '700 88px "Bebas Neue", "Oswald", sans-serif';
		ctx.fillText("THE SHOP", width / 2, cardY + 225);

		// Subtitle with decorative gold flanking lines
		const subY = cardY + 266;
		ctx.fillStyle = "#c99a45";
		ctx.font = '700 16px "Plus Jakarta Sans", system-ui, sans-serif';
		ctx.fillText("G R A N D   O P E N I N G", width / 2, subY);

		ctx.strokeStyle = "rgba(201, 154, 69, 0.45)";
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		ctx.moveTo(cardX + 160, subY - 6);
		ctx.lineTo(width / 2 - 140, subY - 6);
		ctx.moveTo(width / 2 + 140, subY - 6);
		ctx.lineTo(cardX + cardW - 160, subY - 6);
		ctx.stroke();

		// Gold separator bar at bottom of header
		const goldLineGrad = ctx.createLinearGradient(cardX, 0, cardX + cardW, 0);
		goldLineGrad.addColorStop(0, "rgba(201, 154, 69, 0.2)");
		goldLineGrad.addColorStop(0.5, "#c99a45");
		goldLineGrad.addColorStop(1, "rgba(201, 154, 69, 0.2)");
		ctx.fillStyle = goldLineGrad;
		ctx.fillRect(cardX, cardY + headerH - 4, cardW, 4);

		// 4. Guest Identity Section
		const admitPillW = 200;
		const admitPillH = 34;
		const admitPillX = (width - admitPillW) / 2;
		const admitPillY = cardY + headerH + 34;
		drawRoundedRect(admitPillX, admitPillY, admitPillW, admitPillH, 17);
		ctx.fillStyle = "rgba(22, 57, 91, 0.08)";
		ctx.fill();

		ctx.fillStyle = "#16395b";
		ctx.font = '700 13px "Plus Jakarta Sans", system-ui, sans-serif';
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText("INVITED GUEST", width / 2, admitPillY + admitPillH / 2);

		// Guest First Name (auto-scaled to fit cleanly)
		const guestFirstName = getFirstName(verifiedData?.guest_name || "Guest");
		let nameFontSize = 68;
		ctx.textBaseline = "alphabetic";
		while (nameFontSize > 38) {
			ctx.font = `700 ${nameFontSize}px "Bebas Neue", "Oswald", sans-serif`;
			if (ctx.measureText(guestFirstName.toUpperCase()).width <= cardW - 110) {
				break;
			}
			nameFontSize -= 4;
		}
		ctx.fillStyle = "#0e243a";
		ctx.fillText(
			guestFirstName.toUpperCase(),
			width / 2,
			cardY + headerH + 128,
		);

		// 5. QR Code Showcase Frame
		const qrBoxSize = 460;
		const qrBoxX = (width - qrBoxSize) / 2;
		const qrBoxY = cardY + headerH + 158;

		// White QR card with soft shadow
		ctx.save();
		drawRoundedRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 32);
		ctx.shadowColor = "rgba(14, 36, 58, 0.12)";
		ctx.shadowBlur = 28;
		ctx.shadowOffsetY = 10;
		ctx.fillStyle = "#ffffff";
		ctx.fill();
		ctx.restore();

		drawRoundedRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 32);
		ctx.strokeStyle = "rgba(22, 57, 91, 0.14)";
		ctx.lineWidth = 2;
		ctx.stroke();

		// Gold scanner target corner brackets inside the QR card
		const cornerInset = 22;
		const cornerLen = 30;
		const cLeft = qrBoxX + cornerInset;
		const cRight = qrBoxX + qrBoxSize - cornerInset;
		const cTop = qrBoxY + cornerInset;
		const cBottom = qrBoxY + qrBoxSize - cornerInset;

		ctx.strokeStyle = "#c99a45";
		ctx.lineWidth = 4;
		ctx.lineCap = "round";
		ctx.beginPath();
		// Top-left
		ctx.moveTo(cLeft, cTop + cornerLen);
		ctx.lineTo(cLeft, cTop);
		ctx.lineTo(cLeft + cornerLen, cTop);
		// Top-right
		ctx.moveTo(cRight - cornerLen, cTop);
		ctx.lineTo(cRight, cTop);
		ctx.lineTo(cRight, cTop + cornerLen);
		// Bottom-left
		ctx.moveTo(cLeft, cBottom - cornerLen);
		ctx.lineTo(cLeft, cBottom);
		ctx.lineTo(cLeft + cornerLen, cBottom);
		// Bottom-right
		ctx.moveTo(cRight - cornerLen, cBottom);
		ctx.lineTo(cRight, cBottom);
		ctx.lineTo(cRight, cBottom - cornerLen);
		ctx.stroke();

		// Draw crisp QR Code image
		const qrDrawSize = 376;
		const qrDrawX = (width - qrDrawSize) / 2;
		const qrDrawY = qrBoxY + (qrBoxSize - qrDrawSize) / 2;
		ctx.save();
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(qrCanvas, qrDrawX, qrDrawY, qrDrawSize, qrDrawSize);
		ctx.restore();

		// 6. Status Badge & Pass Reference
		const statusPillW = 460;
		const statusPillH = 46;
		const statusPillX = (width - statusPillW) / 2;
		const statusPillY = qrBoxY + qrBoxSize + 28;

		drawRoundedRect(statusPillX, statusPillY, statusPillW, statusPillH, 23);
		if (verifiedData?.checked_in) {
			ctx.fillStyle = "#d1fae5";
			ctx.fill();
			ctx.strokeStyle = "#6ee7b7";
			ctx.lineWidth = 1.5;
			ctx.stroke();
			ctx.fillStyle = "#065f46";
		} else {
			ctx.fillStyle = "rgba(22, 57, 91, 0.07)";
			ctx.fill();
			ctx.strokeStyle = "rgba(22, 57, 91, 0.18)";
			ctx.lineWidth = 1.5;
			ctx.stroke();
			ctx.fillStyle = "#16395b";
		}

		ctx.font = '700 15px "Plus Jakarta Sans", system-ui, sans-serif';
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText(
			verifiedData?.checked_in
				? "✓  CHECKED-IN AT ENTRANCE"
				: "●  VALID PASS — PRESENT AT ENTRANCE",
			width / 2,
			statusPillY + statusPillH / 2,
		);

		const passRef = (verifiedData?.qr_token || "VIPPASS")
			.slice(0, 10)
			.toUpperCase();
		ctx.fillStyle = "rgba(22, 57, 91, 0.5)";
		ctx.font = '600 13px "Plus Jakarta Sans", monospace';
		ctx.textBaseline = "alphabetic";
		ctx.fillText(
			`PASS REF: #${passRef}`,
			width / 2,
			statusPillY + statusPillH + 28,
		);

		// 7. Perforated Ticket Divider Line
		ctx.save();
		ctx.setLineDash([12, 10]);
		ctx.strokeStyle = "rgba(22, 57, 91, 0.22)";
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(cardX + 40, perfY);
		ctx.lineTo(cardX + cardW - 40, perfY);
		ctx.stroke();
		ctx.restore();

		// 8. Event Schedule & Venue Details Box
		const infoX = cardX + 48;
		const infoY = perfY + 32;
		const infoW = cardW - 96; // 832
		const infoH = 200;

		drawRoundedRect(infoX, infoY, infoW, infoH, 24);
		ctx.fillStyle = "rgba(22, 57, 91, 0.055)";
		ctx.fill();
		ctx.strokeStyle = "rgba(22, 57, 91, 0.12)";
		ctx.lineWidth = 1.5;
		ctx.stroke();

		// Internal dividers inside Event Details box
		const midY = infoY + infoH / 2;
		const midX = infoX + infoW / 2;
		ctx.strokeStyle = "rgba(22, 57, 91, 0.1)";
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		ctx.moveTo(infoX + 24, midY);
		ctx.lineTo(infoX + infoW - 24, midY);
		ctx.moveTo(midX, infoY + 18);
		ctx.lineTo(midX, midY - 18);
		ctx.stroke();

		// Top-Left Cell: Date
		ctx.textAlign = "left";
		ctx.fillStyle = "rgba(22, 57, 91, 0.55)";
		ctx.font = '700 12px "Plus Jakarta Sans", system-ui, sans-serif';
		ctx.fillText("EVENT DATE", infoX + 32, infoY + 36);

		ctx.fillStyle = "#0e243a";
		ctx.font = '700 22px "Plus Jakarta Sans", system-ui, sans-serif';
		ctx.fillText("Sat, Dec 12, 2026", infoX + 32, infoY + 70);

		// Top-Right Cell: Time
		ctx.fillStyle = "rgba(22, 57, 91, 0.55)";
		ctx.font = '700 12px "Plus Jakarta Sans", system-ui, sans-serif';
		ctx.fillText("DOORS OPEN", midX + 32, infoY + 36);

		ctx.fillStyle = "#0e243a";
		ctx.font = '700 22px "Plus Jakarta Sans", system-ui, sans-serif';
		ctx.fillText("6:00 PM (Cairo)", midX + 32, infoY + 70);

		// Bottom Row: Location & Access Note
		ctx.fillStyle = "rgba(22, 57, 91, 0.55)";
		ctx.font = '700 12px "Plus Jakarta Sans", system-ui, sans-serif';
		ctx.fillText("LOCATION", infoX + 32, midY + 36);

		ctx.fillStyle = "#0e243a";
		ctx.font = '700 22px "Plus Jakarta Sans", system-ui, sans-serif';
		ctx.fillText("The Shop — Cairo, Egypt", infoX + 32, midY + 70);

		ctx.textAlign = "right";
		ctx.fillStyle = "#c99a45";
		ctx.font = '700 14px "Plus Jakarta Sans", system-ui, sans-serif';
		ctx.fillText("PRIVATE INVITATION", infoX + infoW - 32, midY + 68);

		// Footer inside Card
		ctx.textAlign = "center";
		ctx.fillStyle = "rgba(22, 57, 91, 0.5)";
		ctx.font = '600 14px "Plus Jakarta Sans", system-ui, sans-serif';
		ctx.fillText(
			"© 2026 THE SHOP & BAZARNA®  •  NON-TRANSFERABLE DIGITAL ENTRY PASS",
			width / 2,
			cardY + cardH - 36,
		);

		ctx.restore(); // End card clip

		// Card outer border
		drawRoundedRect(cardX, cardY, cardW, cardH, cardR);
		ctx.strokeStyle = "rgba(244, 235, 218, 0.35)";
		ctx.lineWidth = 2;
		ctx.stroke();

		// Ticket Side Cutout Notches at perforation line
		const notchR = 24;
		ctx.fillStyle = "#0c1f33";
		ctx.strokeStyle = "rgba(244, 235, 218, 0.3)";
		ctx.lineWidth = 2;

		ctx.beginPath();
		ctx.arc(cardX, perfY, notchR, -Math.PI / 2, Math.PI / 2);
		ctx.fill();
		ctx.stroke();

		ctx.beginPath();
		ctx.arc(cardX + cardW, perfY, notchR, Math.PI / 2, (Math.PI * 3) / 2);
		ctx.fill();
		ctx.stroke();

		const dataUrl = exportCanvas.toDataURL("image/png");
		const safeName = getFirstName(verifiedData?.guest_name || "guest")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "");
		const fileName = `the-shop-pass-${safeName || "guest"}.png`;

		const base64Data = dataUrl.split(",")[1] || "";
		const byteString = atob(base64Data);
		const byteArray = new Uint8Array(byteString.length);
		for (let i = 0; i < byteString.length; i++) {
			byteArray[i] = byteString.charCodeAt(i);
		}
		const blob = new Blob([byteArray], { type: "image/png" });
		const file = new File([blob], fileName, {
			type: "image/png",
			lastModified: Date.now(),
		});

		const assets = { dataUrl, blob, file, fileName };
		passAssetsRef.current = assets;
		setPassImageUrl(dataUrl);
		return assets;
	}, [verifiedData]);

	// Pre-generate high-resolution PNG pass image as soon as guest is verified
	useEffect(() => {
		passAssetsRef.current = null;
		if (!verifiedData) return;

		let cancelled = false;
		const preparePassImage = async () => {
			await Promise.resolve();
			if (cancelled) return;
			buildPassAssets();
			try {
				if (document.fonts?.ready) {
					await document.fonts.ready;
				}
			} catch {
				// Proceed with fallback fonts
			}
			if (!cancelled) {
				buildPassAssets();
			}
		};

		preparePassImage();

		return () => {
			cancelled = true;
		};
	}, [verifiedData, buildPassAssets]);

	const triggerBlobDownload = (blob: Blob, fileName: string) => {
		const blobUrl = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = blobUrl;
		link.download = fileName;
		document.body.appendChild(link);
		link.click();
		setTimeout(() => {
			document.body.removeChild(link);
			URL.revokeObjectURL(blobUrl);
		}, 1000);
	};

	const handleDownloadQR = async () => {
		// Retrieve pre-built PNG assets or build synchronously to preserve mobile user-gesture activation
		const assets = passAssetsRef.current || buildPassAssets();
		if (!assets) return;

		const ua = navigator.userAgent || "";
		const isIOS =
			/iPad|iPhone|iPod/i.test(ua) ||
			(navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
		const isAndroid = /Android/i.test(ua);
		const isMobile = isIOS || isAndroid || /Mobile/i.test(ua);

		if (isMobile) {
			// On mobile (iOS & Android), use Web Share API with only `{ files: [file] }`
			// so the native sheet offers "Save Image" directly into the Photos app (instead of downloading to Files as a document/PDF)
			if (
				typeof navigator.share === "function" &&
				typeof navigator.canShare === "function"
			) {
				try {
					if (navigator.canShare({ files: [assets.file] })) {
						await navigator.share({ files: [assets.file] });
						return;
					}
				} catch (err: unknown) {
					if (err instanceof Error && err.name === "AbortError") {
						return;
					}
				}
			}

			// Fallback for mobile in-app browsers where Web Share for files isn't supported:
			// On Android, also trigger proper binary image/png Blob download; on all mobile devices, open the image preview modal so user can press & hold -> "Save to Photos"
			if (isAndroid) {
				triggerBlobDownload(assets.blob, assets.fileName);
			}
			setIsPassPreviewOpen(true);
			return;
		}

		// Desktop browsers: download PNG Blob directly
		triggerBlobDownload(assets.blob, assets.fileName);
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
							The Shop Opening
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
					tokenStatus === "checking" ? (
						/* Validating Token Loading Card */
						<div className="glass-panel rounded-2xl p-8 sm:p-10 shadow-2xl text-center">
							<div className="w-12 h-12 border-3 border-shop-cream/20 border-t-shop-gold rounded-full animate-spin mx-auto mb-4" />
							<h2 className="font-display text-2xl sm:text-3xl uppercase tracking-wider text-shop-cream font-bold mb-2">
								Verifying Invitation
							</h2>
							<p className="text-shop-cream/70 text-xs sm:text-sm max-w-sm mx-auto leading-relaxed">
								Please wait while we validate your personal invitation link...
							</p>
						</div>
					) : tokenStatus !== "valid" ? (
						/* Missing or Invalid Token Screen */
						<div className="glass-panel rounded-2xl p-6 sm:p-8 shadow-2xl text-center border border-red-500/20">
							<div className="w-14 h-14 rounded-2xl bg-red-500/15 border border-red-500/30 mx-auto mb-4 flex items-center justify-center">
								{tokenStatus === "missing" ? (
									<Lock className="w-7 h-7 text-shop-gold" />
								) : (
									<ShieldAlert className="w-7 h-7 text-red-400" />
								)}
							</div>
							<div className="inline-block mb-3 px-3 py-1 rounded-full bg-shop-cream/10 border border-shop-cream/20 text-xs font-semibold tracking-wider uppercase text-shop-cream">
								Private Access Only
							</div>
							<h1 className="font-display text-3xl sm:text-4xl uppercase tracking-wider text-shop-cream mb-3 font-bold">
								{tokenStatus === "missing"
									? "Invitation Required"
									: "Invalid Invitation Link"}
							</h1>
							<p className="text-shop-cream/75 text-sm max-w-md mx-auto leading-relaxed mb-6">
								{tokenStatus === "missing"
									? "Access to The Shop Opening is strictly by personal invitation. Please open the unique invitation link sent to your mobile number."
									: tokenErrorReason ||
										"This invitation link is not recognized or is no longer active. Please check the exact link sent to your mobile number."}
							</p>
							<div className="bg-shop-navy/40 border border-shop-cream/10 rounded-xl p-3.5 text-xs text-shop-cream/60">
								If you believe this is an error, please contact the event
								organizer for a new invitation link.
							</div>
						</div>
					) : (
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
									You are cordially invited to celebrate the grand private
									opening of The Shop. Please enter your registered mobile
									number to retrieve your entry pass.
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

							<form onSubmit={handleVerify} noValidate className="space-y-4">
								<div>
									<label className="block text-xs font-semibold uppercase tracking-wider text-shop-cream/70 mb-1">
										Registered Mobile Number
									</label>
									<div className="relative">
										<input
											type="tel"
											value={phone}
											onChange={(e) => {
												setPhone(e.target.value);
												if (error) setError(null);
											}}
											placeholder="01012345678 or +201..."
											autoFocus
											aria-invalid={Boolean(error)}
											className={`w-full bg-shop-navy/80 border rounded-xl px-4 py-3 text-shop-cream placeholder-shop-cream/40 focus:outline-none text-sm tracking-wide transition font-mono ${
												error
													? "border-red-500 focus:border-red-500"
													: "border-shop-cream/20 focus:border-shop-gold"
											}`}
										/>
									</div>
									{error ? (
										<p className="text-xs text-red-400 mt-1.5 flex items-start space-x-1.5">
											<AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
											<span>{error}</span>
										</p>
									) : (
										<p className="text-[11px] text-shop-cream/50 mt-1">
											Enter the Egyptian phone number your invitation was sent
											to.
										</p>
									)}
								</div>

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
					)
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
									Grand Opening
								</p>
							</div>

							{/* Guest Details */}
							<div className="p-6 text-center">
								<p className="text-xs font-semibold uppercase tracking-wider text-shop-navy/60 mb-1">
									Invited Guest
								</p>
								<h3 className="font-display text-3xl sm:text-4xl tracking-wide font-black text-shop-navy mb-4">
									{getFirstName(verifiedData.guest_name || "")}
								</h3>

								{/* QR Code Container */}
								<div className="inline-block p-4 bg-white rounded-2xl shadow-inner border border-shop-navy/10 mb-4">
									{verifiedData.qr_token && (
										<>
											<QRCodeCanvas
												ref={qrCanvasRef}
												value={verifiedData.qr_token}
												size={400}
												style={{ width: 200, height: 200 }}
												className={qrImageUrl ? "hidden" : "block"}
												level="H"
												includeMargin={true}
												bgColor="#ffffff"
												fgColor="#000000"
											/>
											{qrImageUrl && (
												<img
													src={qrImageUrl}
													alt="Official Entry Pass QR Code"
													className="w-[200px] h-[200px] block mx-auto"
												/>
											)}
										</>
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
								<button
									type="button"
									onClick={handleDownloadQR}
									className="w-full bg-shop-navy hover:bg-shop-dark text-shop-cream text-xs font-bold py-3.5 px-4 rounded-xl transition flex items-center justify-center space-x-2 shadow-md"
								>
									<Download className="w-4 h-4" />
									<span>Download QR Code</span>
								</button>
							</div>
						</div>

						<p className="text-center text-xs text-shop-cream/60 mt-4">
							You can reopen this link at any time to display your pass.
						</p>
					</div>
				)}
			</main>

			{/* Mobile Save-to-Photos Image Preview Modal */}
			{isPassPreviewOpen && passImageUrl && (
				<div
					onClick={() => setIsPassPreviewOpen(false)}
					className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
				>
					<div
						onClick={(e) => e.stopPropagation()}
						className="bg-shop-dark border border-shop-cream/20 max-w-sm w-full rounded-2xl p-4 shadow-2xl relative text-center"
					>
						<button
							type="button"
							onClick={() => setIsPassPreviewOpen(false)}
							className="absolute top-3 right-3 text-shop-cream/60 hover:text-shop-cream p-1"
							aria-label="Close preview"
						>
							<X className="w-5 h-5" />
						</button>

						<h3 className="font-display text-xl font-bold uppercase tracking-wider text-shop-cream mb-1">
							Save Pass to Photos
						</h3>
						<p className="text-xs text-shop-cream/80 mb-3 leading-relaxed">
							Press and hold the pass image below, then tap{" "}
							<strong className="text-shop-gold">Save to Photos</strong> (or{" "}
							<strong className="text-shop-gold">Add to Photos</strong>).
						</p>

						<div className="rounded-xl overflow-hidden border border-shop-cream/20 shadow-lg bg-shop-navy max-h-[65vh] flex items-center justify-center">
							<img
								src={passImageUrl}
								alt="The Shop Digital Entry Pass"
								className="max-h-[65vh] w-auto object-contain mx-auto block"
							/>
						</div>

						<button
							type="button"
							onClick={() => setIsPassPreviewOpen(false)}
							className="mt-3 w-full bg-shop-cream text-shop-navy font-bold text-xs py-2.5 px-4 rounded-xl transition hover:bg-shop-cream-light"
						>
							Done
						</button>
					</div>
				</div>
			)}

			{/* Footer */}
			<footer className="relative z-10 w-full max-w-4xl mx-auto px-6 py-6 text-center text-xs text-shop-cream/50">
				<p>© 2026 The Shop & BAZARNA®. All rights reserved.</p>
			</footer>
		</div>
	);
};
