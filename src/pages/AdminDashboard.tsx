import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import {
	Users,
	UserCheck,
	UserX,
	Plus,
	Upload,
	Download,
	Search,
	Copy,
	Check,
	MessageCircle,
	QrCode,
	RefreshCw,
	Trash2,
	Edit2,
	Camera,
	LogOut,
	X,
	CheckCircle2,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import {
	normalizeEgyptianPhone,
	formatPhoneDisplay,
	generateToken,
} from "../lib/phone";
import type { Guest } from "../types";

export const AdminDashboard: React.FC = () => {
	const { signOut } = useAuth();
	const navigate = useNavigate();

	const [guests, setGuests] = useState<Guest[]>([]);
	const [loading, setLoading] = useState(true);
	const [searchQuery, setSearchQuery] = useState("");
	const [statusFilter, setStatusFilter] = useState<
		"all" | "checked_in" | "pending"
	>("all");

	// Modals state
	const [isAddModalOpen, setIsAddModalOpen] = useState(false);
	const [editingGuest, setEditingGuest] = useState<Guest | null>(null);
	const [guestForm, setGuestForm] = useState({ name: "", phone: "" });
	const [isImportModalOpen, setIsImportModalOpen] = useState(false);
	const [importLoading, setImportLoading] = useState(false);
	const [importSummary, setImportSummary] = useState<string | null>(null);

	// Copied invite feedback tracking
	const [copiedToken, setCopiedToken] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	// Load guests from database
	const fetchGuests = async () => {
		try {
			const { data, error } = await supabase
				.from("guests")
				.select("*")
				.order("created_at", { ascending: false });

			if (error) {
				console.error("Failed to fetch guests:", error);
			} else {
				setGuests(data || []);
			}
		} catch (err) {
			console.error("Error fetching guests:", err);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchGuests();

		// Subscribe to Realtime changes on guests table
		const channel = supabase
			.channel("admin_guests_realtime")
			.on(
				"postgres_changes",
				{ event: "*", schema: "public", table: "guests" },
				() => {
					fetchGuests();
				},
			)
			.subscribe();

		return () => {
			supabase.removeChannel(channel);
		};
	}, []);

	// Compute metrics
	const totalGuests = guests.length;
	const checkedInCount = guests.filter((g) => g.checked_in).length;
	const remainingCount = totalGuests - checkedInCount;
	const checkInRate =
		totalGuests > 0 ? Math.round((checkedInCount / totalGuests) * 100) : 0;

	// Filtered guests
	const filteredGuests = useMemo(() => {
		return guests.filter((guest) => {
			const matchesSearch =
				guest.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
				guest.phone.includes(searchQuery) ||
				guest.phone_normalized.includes(searchQuery);

			if (!matchesSearch) return false;

			if (statusFilter === "checked_in") return guest.checked_in;
			if (statusFilter === "pending") return !guest.checked_in;
			return true;
		});
	}, [guests, searchQuery, statusFilter]);

	// Handle Add Guest
	const handleSaveGuest = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!guestForm.name.trim() || !guestForm.phone.trim()) return;

		const normalized = normalizeEgyptianPhone(guestForm.phone);

		if (editingGuest) {
			// Update
			const { error } = await supabase
				.from("guests")
				.update({
					name: guestForm.name.trim(),
					phone: guestForm.phone.trim(),
					phone_normalized: normalized,
					updated_at: new Date().toISOString(),
				})
				.eq("id", editingGuest.id);

			if (error) {
				alert("Failed to update guest: " + error.message);
			} else {
				setEditingGuest(null);
				setGuestForm({ name: "", phone: "" });
				fetchGuests();
			}
		} else {
			// Create new
			const invite_token = generateToken(20);
			const qr_token = generateToken(24);

			const { error } = await supabase.from("guests").insert([
				{
					name: guestForm.name.trim(),
					phone: guestForm.phone.trim(),
					phone_normalized: normalized,
					invite_token,
					qr_token,
				},
			]);

			if (error) {
				alert("Failed to add guest: " + error.message);
			} else {
				setIsAddModalOpen(false);
				setGuestForm({ name: "", phone: "" });
				fetchGuests();
			}
		}
	};

	// Handle Delete
	const handleDeleteGuest = async (id: string, name: string) => {
		if (
			!window.confirm(
				`Are you sure you want to remove ${name} from the guest list?`,
			)
		)
			return;

		const { error } = await supabase.from("guests").delete().eq("id", id);
		if (error) {
			alert("Failed to delete guest: " + error.message);
		} else {
			fetchGuests();
		}
	};

	// Handle Manual Check-in
	const handleManualCheckIn = async (guest: Guest) => {
		if (guest.checked_in) return;
		if (!window.confirm(`Manually check in ${guest.name}?`)) return;

		const { data, error } = await supabase.rpc("manual_check_in", {
			p_guest_id: guest.id,
		});

		if (error || !data?.success) {
			alert(error?.message || data?.error || "Manual check-in failed.");
		} else {
			fetchGuests();
		}
	};

	// Reissue QR code
	const handleReissueQr = async (guest: Guest) => {
		if (
			!window.confirm(
				`Generate a new QR code for ${guest.name}? Any previous QR code will immediately be invalidated.`,
			)
		)
			return;

		const { data, error } = await supabase.rpc("reissue_guest_qr", {
			p_guest_id: guest.id,
		});

		if (error || !data?.success) {
			alert(error?.message || data?.error || "Failed to reissue QR code.");
		} else {
			alert(`New QR code issued for ${guest.name}`);
			fetchGuests();
		}
	};

	// Base URL for invitations (defaults to Vercel production domain)
	const getAppOrigin = () => {
		return (
			import.meta.env.VITE_APP_URL || "https://the-shop-invitation.vercel.app"
		).replace(/\/$/, "");
	};

	// Copy invitation link
	const handleCopyInviteLink = (token: string) => {
		const origin = getAppOrigin();
		const url = `${origin}/?token=${token}`;
		navigator.clipboard.writeText(url);
		setCopiedToken(token);
		setTimeout(() => setCopiedToken(null), 2000);
	};

	// Open WhatsApp with prefilled invitation message
	const handleWhatsApp = (guest: Guest) => {
		const origin = getAppOrigin();
		const inviteUrl = `${origin}/?token=${guest.invite_token}`;
		const message = `Hello ${guest.name}! You are cordially invited to the private store opening of The Shop on Saturday, December 12, 2026 at 6:00 PM. Please access your digital entrance pass here: ${inviteUrl}`;
		const encoded = encodeURIComponent(message);
		const phoneNum =
			guest.phone_normalized || normalizeEgyptianPhone(guest.phone);
		window.open(`https://wa.me/${phoneNum}?text=${encoded}`, "_blank");
	};

	// Export report to CSV
	const handleExportCSV = () => {
		if (guests.length === 0) {
			alert("No guests to export.");
			return;
		}

		const headers = [
			"Name",
			"Phone",
			"Normalized Phone",
			"Checked In",
			"Check-in Time",
			"Invite Link",
		];
		const origin = getAppOrigin();
		const rows = guests.map((g) => [
			`"${g.name.replace(/"/g, '""')}"`,
			`"${g.phone}"`,
			`"${g.phone_normalized}"`,
			g.checked_in ? "Yes" : "No",
			g.checked_in_at
				? `"${new Date(g.checked_in_at).toLocaleString()}"`
				: '""',
			`"${origin}/?token=${g.invite_token}"`,
		]);

		const csvContent = [
			headers.join(","),
			...rows.map((r) => r.join(",")),
		].join("\n");
		const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.setAttribute(
			"download",
			`the-shop-guests-${new Date().toISOString().slice(0, 10)}.csv`,
		);
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	};

	// Handle CSV/Excel file upload
	const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		setImportLoading(true);
		setImportSummary(null);

		try {
			const buffer = await file.arrayBuffer();
			const workbook = XLSX.read(buffer, { type: "array" });
			const firstSheetName = workbook.SheetNames[0];
			const worksheet = workbook.Sheets[firstSheetName];
			const jsonData =
				XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);

			if (jsonData.length === 0) {
				alert("Uploaded file is empty.");
				setImportLoading(false);
				return;
			}

			// Map rows: find name and phone columns case-insensitively
			const newGuestsToInsert: Array<{
				name: string;
				phone: string;
				phone_normalized: string;
				invite_token: string;
				qr_token: string;
			}> = [];

			for (const row of jsonData) {
				let name = "";
				let phone = "";

				for (const key of Object.keys(row)) {
					const lowerKey = key.trim().toLowerCase();
					if (
						lowerKey === "name" ||
						lowerKey === "guest name" ||
						lowerKey === "guest_name" ||
						lowerKey === "full name"
					) {
						name = String(row[key] || "").trim();
					} else if (
						lowerKey === "phone" ||
						lowerKey === "mobile" ||
						lowerKey === "phone number" ||
						lowerKey === "phone_number" ||
						lowerKey === "tel"
					) {
						phone = String(row[key] || "").trim();
					}
				}

				// If not matched by column name, fallback to first 2 columns
				if (!name || !phone) {
					const values = Object.values(row);
					if (values.length >= 2) {
						name = name || String(values[0] || "").trim();
						phone = phone || String(values[1] || "").trim();
					}
				}

				if (name && phone) {
					newGuestsToInsert.push({
						name,
						phone,
						phone_normalized: normalizeEgyptianPhone(phone),
						invite_token: generateToken(20),
						qr_token: generateToken(24),
					});
				}
			}

			if (newGuestsToInsert.length === 0) {
				alert(
					"Could not find valid guest rows with Name and Phone in the file.",
				);
				setImportLoading(false);
				return;
			}

			// Batch insert in chunks of 50
			const chunkSize = 50;
			let insertedCount = 0;
			for (let i = 0; i < newGuestsToInsert.length; i += chunkSize) {
				const chunk = newGuestsToInsert.slice(i, i + chunkSize);
				const { error } = await supabase.from("guests").insert(chunk);
				if (error) {
					console.error("Batch insert error:", error);
					alert(`Error during import: ${error.message}`);
					break;
				}
				insertedCount += chunk.length;
			}

			setImportSummary(`Successfully imported ${insertedCount} guests!`);
			fetchGuests();
			if (fileInputRef.current) fileInputRef.current.value = "";
		} catch (err: unknown) {
			alert(
				"Failed to parse file: " +
					(err instanceof Error ? err.message : String(err)),
			);
		} finally {
			setImportLoading(false);
		}
	};

	return (
		<div className="min-h-screen bg-shop-dark text-shop-cream flex flex-col">
			{/* Top Navigation */}
			<header className="bg-shop-navy/90 border-b border-shop-cream/15 sticky top-0 z-30 backdrop-blur-md px-6 py-4">
				<div className="max-w-7xl mx-auto flex items-center justify-between">
					<div className="flex items-center space-x-3">
						<div className="w-9 h-9 rounded-lg bg-shop-cream text-shop-dark flex items-center justify-center font-display text-xl font-black shadow">
							B®
						</div>
						<div>
							<span className="font-display tracking-widest text-xl uppercase font-bold text-shop-cream block leading-tight">
								The Shop
							</span>
							<span className="text-[11px] tracking-wider uppercase text-shop-cream/70 font-mono">
								Admin Operations
							</span>
						</div>
					</div>

					<div className="flex items-center space-x-3">
						<button
							onClick={() => navigate("/scanner")}
							className="bg-shop-green hover:bg-emerald-700 text-shop-cream text-xs font-bold py-2 px-3.5 rounded-lg transition flex items-center space-x-1.5 shadow"
						>
							<Camera className="w-3.5 h-3.5" />
							<span>Launch Scanner</span>
						</button>
						<button
							onClick={() => signOut()}
							className="bg-shop-navy hover:bg-shop-dark border border-shop-cream/20 text-shop-cream/80 hover:text-shop-cream text-xs font-semibold py-2 px-3 rounded-lg transition flex items-center space-x-1.5"
						>
							<LogOut className="w-3.5 h-3.5" />
							<span className="hidden sm:inline">Sign Out</span>
						</button>
					</div>
				</div>
			</header>

			{/* Main Content Area */}
			<main className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 flex-1 space-y-6">
				{/* Metric Cards */}
				<div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
					<div className="glass-panel p-4 sm:p-5 rounded-2xl border border-shop-cream/15">
						<div className="flex items-center justify-between text-shop-cream/70 mb-2">
							<span className="text-xs uppercase tracking-wider font-semibold">
								Total Invited
							</span>
							<Users className="w-4 h-4 text-shop-gold" />
						</div>
						<div className="font-display text-3xl sm:text-4xl font-bold text-shop-cream">
							{totalGuests}
						</div>
						<span className="text-[11px] text-shop-cream/50 mt-1 block">
							Expected Attendees
						</span>
					</div>

					<div className="glass-panel p-4 sm:p-5 rounded-2xl border border-shop-cream/15">
						<div className="flex items-center justify-between text-shop-cream/70 mb-2">
							<span className="text-xs uppercase tracking-wider font-semibold">
								Checked In
							</span>
							<UserCheck className="w-4 h-4 text-emerald-400" />
						</div>
						<div className="font-display text-3xl sm:text-4xl font-bold text-emerald-400">
							{checkedInCount}
						</div>
						<span className="text-[11px] text-shop-cream/50 mt-1 block">
							Guests Admitted
						</span>
					</div>

					<div className="glass-panel p-4 sm:p-5 rounded-2xl border border-shop-cream/15">
						<div className="flex items-center justify-between text-shop-cream/70 mb-2">
							<span className="text-xs uppercase tracking-wider font-semibold">
								Remaining
							</span>
							<UserX className="w-4 h-4 text-amber-400" />
						</div>
						<div className="font-display text-3xl sm:text-4xl font-bold text-amber-400">
							{remainingCount}
						</div>
						<span className="text-[11px] text-shop-cream/50 mt-1 block">
							Yet to Arrive
						</span>
					</div>

					<div className="glass-panel p-4 sm:p-5 rounded-2xl border border-shop-cream/15">
						<div className="flex items-center justify-between text-shop-cream/70 mb-2">
							<span className="text-xs uppercase tracking-wider font-semibold">
								Turnout
							</span>
							<RefreshCw className="w-4 h-4 text-shop-cream" />
						</div>
						<div className="font-display text-3xl sm:text-4xl font-bold text-shop-cream">
							{checkInRate}%
						</div>
						<div className="w-full bg-shop-navy/80 rounded-full h-1.5 mt-2 overflow-hidden border border-shop-cream/10">
							<div
								className="bg-emerald-400 h-full rounded-full transition-all duration-500"
								style={{ width: `${checkInRate}%` }}
							/>
						</div>
					</div>
				</div>

				{/* Action Bar */}
				<div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
					{/* Search & Filter */}
					<div className="flex flex-1 items-center space-x-2">
						<div className="relative flex-1 max-w-md">
							<Search className="w-4 h-4 text-shop-cream/40 absolute left-3 top-1/2 -translate-y-1/2" />
							<input
								type="text"
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								placeholder="Search guest name or phone..."
								className="w-full bg-shop-navy/60 border border-shop-cream/20 rounded-xl pl-9 pr-3 py-2 text-sm text-shop-cream placeholder-shop-cream/40 focus:outline-none focus:border-shop-gold"
							/>
						</div>

						<select
							value={statusFilter}
							onChange={(e) =>
								setStatusFilter(
									e.target.value as "all" | "checked_in" | "pending",
								)
							}
							className="bg-shop-navy/60 border border-shop-cream/20 rounded-xl px-3 py-2 text-xs text-shop-cream focus:outline-none focus:border-shop-gold font-medium"
						>
							<option value="all">All Guests ({totalGuests})</option>
							<option value="checked_in">Checked In ({checkedInCount})</option>
							<option value="pending">Pending ({remainingCount})</option>
						</select>
					</div>

					{/* Action Buttons */}
					<div className="flex items-center space-x-2">
						<button
							onClick={() => {
								setEditingGuest(null);
								setGuestForm({ name: "", phone: "" });
								setIsAddModalOpen(true);
							}}
							className="bg-shop-cream hover:bg-shop-cream-light text-shop-navy font-bold text-xs py-2 px-3.5 rounded-xl transition flex items-center space-x-1.5 shadow"
						>
							<Plus className="w-4 h-4" />
							<span>Add Guest</span>
						</button>

						<button
							onClick={() => setIsImportModalOpen(true)}
							className="bg-shop-navy hover:bg-shop-navy/80 border border-shop-cream/20 text-shop-cream text-xs font-semibold py-2 px-3 rounded-xl transition flex items-center space-x-1.5"
						>
							<Upload className="w-3.5 h-3.5" />
							<span>Import List</span>
						</button>

						<button
							onClick={handleExportCSV}
							className="bg-shop-navy hover:bg-shop-navy/80 border border-shop-cream/20 text-shop-cream text-xs font-semibold py-2 px-3 rounded-xl transition flex items-center space-x-1.5"
						>
							<Download className="w-3.5 h-3.5" />
							<span>Export CSV</span>
						</button>
					</div>
				</div>

				{/* Guest Table */}
				<div className="glass-panel rounded-2xl overflow-hidden border border-shop-cream/15 shadow-xl">
					<div className="overflow-x-auto">
						<table className="w-full text-left text-xs">
							<thead className="bg-shop-navy/80 border-b border-shop-cream/15 text-shop-cream/70 uppercase tracking-wider font-semibold">
								<tr>
									<th className="py-3 px-4">Guest Name</th>
									<th className="py-3 px-4">Mobile</th>
									<th className="py-3 px-4">Check-In Status</th>
									<th className="py-3 px-4">Invitation Link</th>
									<th className="py-3 px-4 text-right">Actions</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-shop-cream/10">
								{loading ? (
									<tr>
										<td
											colSpan={5}
											className="py-12 text-center text-shop-cream/60"
										>
											<div className="w-8 h-8 border-2 border-shop-cream/20 border-t-shop-cream rounded-full animate-spin mx-auto mb-2" />
											Loading guest records...
										</td>
									</tr>
								) : filteredGuests.length === 0 ? (
									<tr>
										<td
											colSpan={5}
											className="py-12 text-center text-shop-cream/60"
										>
											No guests match your criteria. Click "Add Guest" or
											"Import List" to get started.
										</td>
									</tr>
								) : (
									filteredGuests.map((guest) => (
										<tr
											key={guest.id}
											className="hover:bg-shop-cream/5 transition duration-150"
										>
											<td className="py-3.5 px-4 font-bold text-shop-cream text-sm">
												{guest.name}
											</td>
											<td className="py-3.5 px-4 font-mono text-shop-cream/80">
												{formatPhoneDisplay(guest.phone)}
											</td>
											<td className="py-3.5 px-4">
												{guest.checked_in ? (
													<div className="inline-flex items-center space-x-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 rounded-full font-semibold">
														<CheckCircle2 className="w-3.5 h-3.5" />
														<span>
															Checked In{" "}
															{guest.checked_in_at && (
																<span className="font-normal opacity-70">
																	(
																	{new Date(
																		guest.checked_in_at,
																	).toLocaleTimeString([], {
																		hour: "2-digit",
																		minute: "2-digit",
																	})}
																	)
																</span>
															)}
														</span>
													</div>
												) : guest.is_revoked ? (
													<span className="inline-flex items-center space-x-1 bg-red-500/20 text-red-300 border border-red-500/30 px-2 py-0.5 rounded-full font-semibold">
														Revoked
													</span>
												) : (
													<span className="inline-flex items-center space-x-1 bg-amber-500/15 text-amber-300 border border-amber-500/20 px-2 py-0.5 rounded-full font-medium">
														Pending
													</span>
												)}
											</td>
											<td className="py-3.5 px-4">
												<div className="flex items-center space-x-1.5">
													<button
														onClick={() =>
															handleCopyInviteLink(guest.invite_token)
														}
														className="bg-shop-navy/70 hover:bg-shop-navy border border-shop-cream/15 text-shop-cream px-2.5 py-1 rounded-lg text-[11px] font-medium transition flex items-center space-x-1"
														title="Copy Invitation Link"
													>
														{copiedToken === guest.invite_token ? (
															<>
																<Check className="w-3 h-3 text-emerald-400" />
																<span className="text-emerald-400">Copied</span>
															</>
														) : (
															<>
																<Copy className="w-3 h-3" />
																<span>Copy Link</span>
															</>
														)}
													</button>

													<button
														onClick={() => handleWhatsApp(guest)}
														className="bg-emerald-600/80 hover:bg-emerald-600 text-white px-2 py-1 rounded-lg text-[11px] font-medium transition flex items-center space-x-1"
														title="Send Invitation via WhatsApp"
													>
														<MessageCircle className="w-3 h-3" />
														<span className="hidden sm:inline">WhatsApp</span>
													</button>
												</div>
											</td>
											<td className="py-3.5 px-4 text-right">
												<div className="inline-flex items-center space-x-1">
													{!guest.checked_in && (
														<button
															onClick={() => handleManualCheckIn(guest)}
															className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 p-1.5 rounded-lg transition"
															title="Manual Check-In"
														>
															<UserCheck className="w-3.5 h-3.5" />
														</button>
													)}

													<button
														onClick={() => handleReissueQr(guest)}
														className="bg-shop-navy hover:bg-shop-navy/80 border border-shop-cream/20 text-shop-cream/70 hover:text-shop-cream p-1.5 rounded-lg transition"
														title="Reissue QR Code"
													>
														<QrCode className="w-3.5 h-3.5" />
													</button>

													<button
														onClick={() => {
															setEditingGuest(guest);
															setGuestForm({
																name: guest.name,
																phone: guest.phone,
															});
															setIsAddModalOpen(true);
														}}
														className="bg-shop-navy hover:bg-shop-navy/80 border border-shop-cream/20 text-shop-cream/70 hover:text-shop-cream p-1.5 rounded-lg transition"
														title="Edit Guest"
													>
														<Edit2 className="w-3.5 h-3.5" />
													</button>

													<button
														onClick={() =>
															handleDeleteGuest(guest.id, guest.name)
														}
														className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 p-1.5 rounded-lg transition"
														title="Delete Guest"
													>
														<Trash2 className="w-3.5 h-3.5" />
													</button>
												</div>
											</td>
										</tr>
									))
								)}
							</tbody>
						</table>
					</div>
				</div>
			</main>

			{/* Add / Edit Guest Modal */}
			{isAddModalOpen && (
				<div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
					<div className="glass-panel bg-shop-dark border border-shop-cream/20 max-w-md w-full rounded-2xl p-6 shadow-2xl relative">
						<button
							onClick={() => {
								setIsAddModalOpen(false);
								setEditingGuest(null);
							}}
							className="absolute top-4 right-4 text-shop-cream/60 hover:text-shop-cream"
						>
							<X className="w-5 h-5" />
						</button>

						<h3 className="font-display text-2xl font-bold uppercase tracking-wide text-shop-cream mb-4">
							{editingGuest ? "Edit Guest" : "Add New Guest"}
						</h3>

						<form onSubmit={handleSaveGuest} className="space-y-4">
							<div>
								<label className="block text-xs font-semibold uppercase tracking-wider text-shop-cream/70 mb-1">
									Full Name
								</label>
								<input
									type="text"
									value={guestForm.name}
									onChange={(e) =>
										setGuestForm({ ...guestForm, name: e.target.value })
									}
									placeholder="e.g. Youssef Mansour"
									required
									autoFocus
									className="w-full bg-shop-navy/80 border border-shop-cream/20 rounded-xl px-4 py-2.5 text-sm text-shop-cream focus:outline-none focus:border-shop-gold"
								/>
							</div>

							<div>
								<label className="block text-xs font-semibold uppercase tracking-wider text-shop-cream/70 mb-1">
									Egyptian Mobile Number
								</label>
								<input
									type="tel"
									value={guestForm.phone}
									onChange={(e) =>
										setGuestForm({ ...guestForm, phone: e.target.value })
									}
									placeholder="010xxxxxxxx or +201xxxxxxxx"
									required
									className="w-full bg-shop-navy/80 border border-shop-cream/20 rounded-xl px-4 py-2.5 text-sm font-mono text-shop-cream focus:outline-none focus:border-shop-gold"
								/>
								<p className="text-[11px] text-shop-cream/50 mt-1">
									Supports formats: 010..., 011..., 012..., 015..., +201...
								</p>
							</div>

							<div className="flex justify-end space-x-2 pt-2">
								<button
									type="button"
									onClick={() => {
										setIsAddModalOpen(false);
										setEditingGuest(null);
									}}
									className="px-4 py-2 rounded-xl text-xs font-semibold text-shop-cream/70 hover:text-shop-cream"
								>
									Cancel
								</button>
								<button
									type="submit"
									className="bg-shop-cream hover:bg-shop-cream-light text-shop-navy font-bold text-xs py-2.5 px-5 rounded-xl transition shadow"
								>
									{editingGuest ? "Update Guest" : "Generate Invitation"}
								</button>
							</div>
						</form>
					</div>
				</div>
			)}

			{/* Import Guests Modal */}
			{isImportModalOpen && (
				<div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
					<div className="glass-panel bg-shop-dark border border-shop-cream/20 max-w-lg w-full rounded-2xl p-6 shadow-2xl relative">
						<button
							onClick={() => {
								setIsImportModalOpen(false);
								setImportSummary(null);
							}}
							className="absolute top-4 right-4 text-shop-cream/60 hover:text-shop-cream"
						>
							<X className="w-5 h-5" />
						</button>

						<h3 className="font-display text-2xl font-bold uppercase tracking-wide text-shop-cream mb-2">
							Import Guest List
						</h3>
						<p className="text-xs text-shop-cream/70 mb-4">
							Upload a CSV or Excel (.xlsx) file containing guest names and
							mobile numbers.
						</p>

						<div className="border-2 border-dashed border-shop-cream/25 rounded-2xl p-6 text-center bg-shop-navy/30">
							<Upload className="w-8 h-8 text-shop-gold mx-auto mb-2" />
							<p className="text-xs text-shop-cream/80 mb-3">
								Expected columns: <strong>Name</strong> and{" "}
								<strong>Phone</strong> (or Mobile)
							</p>
							<input
								ref={fileInputRef}
								type="file"
								accept=".csv, .xlsx, .xls"
								onChange={handleFileUpload}
								disabled={importLoading}
								className="text-xs text-shop-cream file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-shop-cream file:text-shop-navy hover:file:bg-shop-cream-light cursor-pointer"
							/>
						</div>

						{importLoading && (
							<div className="mt-4 p-3 bg-shop-navy/80 rounded-xl text-center text-xs text-shop-cream flex items-center justify-center space-x-2">
								<div className="w-4 h-4 border-2 border-shop-cream/30 border-t-shop-cream rounded-full animate-spin" />
								<span>
									Processing file and generating secure invitation tokens...
								</span>
							</div>
						)}

						{importSummary && (
							<div className="mt-4 p-3 bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs flex items-center space-x-2">
								<CheckCircle2 className="w-4 h-4 shrink-0" />
								<span>{importSummary}</span>
							</div>
						)}

						<div className="mt-5 flex justify-end">
							<button
								onClick={() => {
									setIsImportModalOpen(false);
									setImportSummary(null);
								}}
								className="bg-shop-navy border border-shop-cream/20 text-shop-cream text-xs font-semibold py-2 px-4 rounded-xl"
							>
								Close
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};
