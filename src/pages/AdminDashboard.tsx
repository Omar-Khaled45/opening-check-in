import React, {
	useState,
	useEffect,
	useMemo,
	useRef,
	useCallback,
	useDeferredValue,
} from "react";
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
	AlertTriangle,
	AlertCircle,
	ArrowUpDown,
	ArrowUp,
	ArrowDown,
	Ban,
	ChevronLeft,
	ChevronRight,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import {
	normalizeEgyptianPhone,
	isValidEgyptianPhone,
	capitalizeName,
	formatPhoneDisplay,
	generateToken,
} from "../lib/phone";
import { getUserFriendlyError } from "../lib/error";
import type { Guest } from "../types";

interface ConfirmModalDetail {
	label: string;
	value: string | number;
	colorClass?: string;
}

interface ConfirmModalState {
	isOpen: boolean;
	type: "confirm" | "danger";
	title: string;
	message: string;
	details?: ConfirmModalDetail[];
	guestPreviewList?: string[];
	confirmText?: string;
	loadingText?: string;
	cancelText?: string;
	onConfirm: () => Promise<void> | void;
}

interface ToastMessage {
	id: string;
	type: "success" | "error";
	title: string;
	message: string;
}

export const AdminDashboard: React.FC = () => {
	const { signOut } = useAuth();
	const navigate = useNavigate();

	const [guests, setGuests] = useState<Guest[]>([]);
	const [loading, setLoading] = useState(true);
	const [searchQuery, setSearchQuery] = useState("");
	const deferredSearchQuery = useDeferredValue(searchQuery);
	const [statusFilter, setStatusFilter] = useState<
		"all" | "checked_in" | "pending"
	>("all");
	const [nameSortOrder, setNameSortOrder] = useState<"asc" | "desc" | null>(
		null,
	);
	const [currentPage, setCurrentPage] = useState(1);
	const [pageSize, setPageSize] = useState(50);

	// Modals state
	const [isAddModalOpen, setIsAddModalOpen] = useState(false);
	const [editingGuest, setEditingGuest] = useState<Guest | null>(null);
	const [guestForm, setGuestForm] = useState({ name: "", phone: "" });
	const [guestFormErrors, setGuestFormErrors] = useState<{
		name?: string;
		phone?: string;
	}>({});
	const [isSavingGuest, setIsSavingGuest] = useState(false);

	const [isImportModalOpen, setIsImportModalOpen] = useState(false);
	const [importLoading, setImportLoading] = useState(false);
	const [importProgress, setImportProgress] = useState<{
		current: number;
		total: number;
	} | null>(null);
	const [importSummary, setImportSummary] = useState<string | null>(null);

	// Custom styled Confirmation modal state (only for pre-action confirmation prompts)
	const [confirmModal, setConfirmModal] = useState<ConfirmModalState | null>(
		null,
	);
	const [confirmActionLoading, setConfirmActionLoading] = useState(false);

	// System-styled Toaster notifications state
	const [toasts, setToasts] = useState<ToastMessage[]>([]);

	// Copied invite feedback tracking
	const [copiedToken, setCopiedToken] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const isBulkMutatingRef = useRef(false);
	const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);
	const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(
		null,
	);

	const dismissToast = useCallback((id: string) => {
		setToasts((prev) => prev.filter((t) => t.id !== id));
	}, []);

	const showToast = useCallback(
		(type: ToastMessage["type"], title: string, message: string) => {
			const safeMessage =
				type === "error"
					? getUserFriendlyError(
							message,
							"Something went wrong. Please try again.",
						)
					: message;
			const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
			setToasts((prev) => [...prev, { id, type, title, message: safeMessage }]);
			setTimeout(() => {
				dismissToast(id);
			}, 4000);
		},
		[dismissToast],
	);

	const openConfirmModal = (
		type: ConfirmModalState["type"],
		title: string,
		message: string,
		options: Omit<ConfirmModalState, "isOpen" | "type" | "title" | "message">,
	) => {
		setConfirmModal({
			isOpen: true,
			type,
			title,
			message,
			...options,
		});
	};

	const closeConfirmModal = () => {
		if (confirmActionLoading) return;
		setConfirmModal(null);
	};

	const handleConfirmAction = async () => {
		if (!confirmModal?.onConfirm || confirmActionLoading) return;
		setConfirmActionLoading(true);
		try {
			await confirmModal.onConfirm();
		} finally {
			setConfirmActionLoading(false);
		}
	};

	const handleCloseGuestModal = () => {
		if (isSavingGuest) return;
		setIsAddModalOpen(false);
		setEditingGuest(null);
		setGuestForm({ name: "", phone: "" });
		setGuestFormErrors({});
	};

	const fetchGuests = useCallback(async () => {
		try {
			const batchSize = 1000;
			const allGuests: Guest[] = [];
			let from = 0;

			while (true) {
				const { data, error } = await supabase
					.from("guests")
					.select("*")
					.order("created_at", { ascending: false })
					.order("id", { ascending: false })
					.range(from, from + batchSize - 1);

				if (error) {
					console.error("Failed to fetch guests:", error);
					return;
				}

				if (!data || data.length === 0) {
					break;
				}

				allGuests.push(...(data as Guest[]));

				if (data.length < batchSize) {
					break;
				}
				from += batchSize;
			}

			setGuests(allGuests);
		} catch (err) {
			console.error("Error fetching guests:", err);
		} finally {
			setLoading(false);
		}
	}, []);

	const subscribeRealtime = useCallback(() => {
		if (realtimeChannelRef.current) {
			supabase.removeChannel(realtimeChannelRef.current);
			realtimeChannelRef.current = null;
		}

		const channel = supabase
			.channel("admin_guests_realtime")
			.on(
				"postgres_changes",
				{ event: "*", schema: "public", table: "guests" },
				(payload) => {
					if (isBulkMutatingRef.current) return;

					if (
						payload.eventType === "UPDATE" &&
						payload.new &&
						typeof (payload.new as Partial<Guest>).id === "string"
					) {
						const updatedGuest = payload.new as Guest;
						setGuests((prev) =>
							prev.map((g) => (g.id === updatedGuest.id ? updatedGuest : g)),
						);
						return;
					}

					if (realtimeDebounceRef.current) {
						clearTimeout(realtimeDebounceRef.current);
					}
					realtimeDebounceRef.current = setTimeout(() => {
						fetchGuests();
					}, 300);
				},
			)
			.subscribe();

		realtimeChannelRef.current = channel;
	}, [fetchGuests]);

	const pauseRealtime = useCallback(() => {
		isBulkMutatingRef.current = true;
		if (realtimeDebounceRef.current) {
			clearTimeout(realtimeDebounceRef.current);
			realtimeDebounceRef.current = null;
		}
		if (realtimeChannelRef.current) {
			supabase.removeChannel(realtimeChannelRef.current);
			realtimeChannelRef.current = null;
		}
	}, []);

	const resumeRealtime = useCallback(() => {
		isBulkMutatingRef.current = false;
		subscribeRealtime();
	}, [subscribeRealtime]);

	useEffect(() => {
		fetchGuests();
		subscribeRealtime();

		return () => {
			if (realtimeDebounceRef.current) {
				clearTimeout(realtimeDebounceRef.current);
			}
			if (realtimeChannelRef.current) {
				supabase.removeChannel(realtimeChannelRef.current);
				realtimeChannelRef.current = null;
			}
		};
	}, [fetchGuests, subscribeRealtime]);

	const totalGuests = guests.length;
	const checkedInCount = useMemo(
		() => guests.reduce((acc, g) => acc + (g.checked_in ? 1 : 0), 0),
		[guests],
	);
	const remainingCount = totalGuests - checkedInCount;
	const checkInRate =
		totalGuests > 0 ? Math.round((checkedInCount / totalGuests) * 100) : 0;

	// Filtered and sorted guests
	const filteredGuests = useMemo(() => {
		const query = deferredSearchQuery.trim().toLowerCase();
		const filtered = guests.filter((guest) => {
			if (statusFilter === "checked_in" && !guest.checked_in) return false;
			if (statusFilter === "pending" && guest.checked_in) return false;

			if (!query) return true;

			return (
				guest.name.toLowerCase().includes(query) ||
				guest.phone.includes(query) ||
				guest.phone_normalized.includes(query)
			);
		});

		if (!nameSortOrder) return filtered;

		return [...filtered].sort((a, b) => {
			const comparison = capitalizeName(a.name).localeCompare(
				capitalizeName(b.name),
				undefined,
				{ sensitivity: "base", numeric: true },
			);
			return nameSortOrder === "asc" ? comparison : -comparison;
		});
	}, [guests, deferredSearchQuery, statusFilter, nameSortOrder]);

	const totalPages = Math.max(1, Math.ceil(filteredGuests.length / pageSize));
	const safeCurrentPage = Math.min(currentPage, totalPages);
	const pageStartIndex = (safeCurrentPage - 1) * pageSize;
	const paginatedGuests = useMemo(
		() => filteredGuests.slice(pageStartIndex, pageStartIndex + pageSize),
		[filteredGuests, pageStartIndex, pageSize],
	);

	const handleToggleNameSort = () => {
		setNameSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
		setCurrentPage(1);
	};

	// Handle Add / Edit Guest
	const handleSaveGuest = async (e: React.FormEvent) => {
		e.preventDefault();
		if (isSavingGuest) return;

		const formattedName = capitalizeName(guestForm.name);
		const rawPhone = guestForm.phone.trim();
		const errors: { name?: string; phone?: string } = {};

		if (!formattedName) {
			errors.name = "Please enter the guest's full name.";
		}

		if (!rawPhone) {
			errors.phone = "Please enter a mobile phone number.";
		} else if (!isValidEgyptianPhone(rawPhone)) {
			errors.phone =
				"Please enter a valid Egyptian mobile number starting with 010, 011, 012, or 015 (e.g. 01012345678 or +201xxxxxxxxx).";
		} else {
			const normalizedCheck = normalizeEgyptianPhone(rawPhone);
			const isDuplicate = guests.some(
				(g) =>
					g.id !== editingGuest?.id &&
					(g.phone_normalized || normalizeEgyptianPhone(g.phone)) ===
						normalizedCheck,
			);
			if (isDuplicate) {
				errors.phone =
					"This phone number is already registered in the guest list.";
			}
		}

		if (errors.name || errors.phone) {
			setGuestFormErrors(errors);
			return;
		}

		setGuestFormErrors({});
		const normalized = normalizeEgyptianPhone(rawPhone);
		setIsSavingGuest(true);

		try {
			// Verify uniqueness in the database as well
			let duplicateQuery = supabase
				.from("guests")
				.select("id")
				.eq("phone_normalized", normalized)
				.limit(1);

			if (editingGuest) {
				duplicateQuery = duplicateQuery.neq("id", editingGuest.id);
			}

			const { data: existingDup } = await duplicateQuery;
			if (existingDup && existingDup.length > 0) {
				setGuestFormErrors({
					phone: "This phone number is already registered in the guest list.",
				});
				return;
			}

			if (editingGuest) {
				// Update
				const { error } = await supabase
					.from("guests")
					.update({
						name: formattedName,
						phone: rawPhone,
						phone_normalized: normalized,
						updated_at: new Date().toISOString(),
					})
					.eq("id", editingGuest.id);

				if (error) {
					if (
						error.code === "23505" ||
						error.message.toLowerCase().includes("duplicate") ||
						error.message.toLowerCase().includes("unique")
					) {
						setGuestFormErrors({
							phone:
								"This phone number is already registered in the guest list.",
						});
					} else {
						console.error("Failed to update guest:", error);
						showToast(
							"error",
							"Update Failed",
							"Unable to update guest details right now. Please try again.",
						);
					}
				} else {
					setIsAddModalOpen(false);
					setEditingGuest(null);
					setGuestForm({ name: "", phone: "" });
					setGuestFormErrors({});
					await fetchGuests();
					showToast(
						"success",
						"Guest Updated",
						`${formattedName}'s information has been updated successfully.`,
					);
				}
			} else {
				// Create new
				const invite_token = generateToken(20);
				const qr_token = generateToken(24);

				const { error } = await supabase.from("guests").insert([
					{
						name: formattedName,
						phone: rawPhone,
						phone_normalized: normalized,
						invite_token,
						qr_token,
					},
				]);

				if (error) {
					if (
						error.code === "23505" ||
						error.message.toLowerCase().includes("duplicate") ||
						error.message.toLowerCase().includes("unique")
					) {
						setGuestFormErrors({
							phone:
								"This phone number is already registered in the guest list.",
						});
					} else {
						console.error("Failed to add guest:", error);
						showToast(
							"error",
							"Failed to Add Guest",
							"Unable to add this guest right now. Please try again.",
						);
					}
				} else {
					setIsAddModalOpen(false);
					setGuestForm({ name: "", phone: "" });
					setGuestFormErrors({});
					await fetchGuests();
					showToast(
						"success",
						"Guest Added",
						`${formattedName} has been added and their digital invitation is ready.`,
					);
				}
			}
		} catch (err) {
			console.error("Error saving guest:", err);
			showToast(
				"error",
				editingGuest ? "Update Failed" : "Failed to Add Guest",
				"An unexpected error occurred while saving the guest. Please try again.",
			);
		} finally {
			setIsSavingGuest(false);
		}
	};

	// Handle Delete Single Guest
	const handleDeleteGuest = (id: string, name: string) => {
		const displayName = capitalizeName(name);
		openConfirmModal(
			"danger",
			"Delete Guest",
			`Are you sure you want to remove ${displayName} from the guest list? This action cannot be undone.`,
			{
				confirmText: "Delete Guest",
				loadingText: "Deleting...",
				cancelText: "Cancel",
				onConfirm: async () => {
					const { error } = await supabase.from("guests").delete().eq("id", id);
					setConfirmModal(null);

					if (error) {
						console.error("Failed to delete guest:", error);
						showToast(
							"error",
							"Delete Failed",
							"Unable to remove this guest right now. Please try again.",
						);
					} else {
						await fetchGuests();
						showToast(
							"success",
							"Guest Removed",
							`${displayName} has been removed from the guest list.`,
						);
					}
				},
			},
		);
	};

	// Handle Delete All Guests
	const handleDeleteAllGuests = () => {
		if (guests.length === 0) {
			showToast(
				"error",
				"No Guests Found",
				"There are currently no guest records to delete.",
			);
			return;
		}

		const countToDelete = guests.length;
		const checkedInToDelete = checkedInCount;
		const pendingToDelete = remainingCount;
		const previewNames = guests
			.slice(0, 5)
			.map((g) => `${capitalizeName(g.name)} (${formatPhoneDisplay(g.phone)})`);
		if (guests.length > 5) {
			previewNames.push(`...and ${guests.length - 5} more guest(s)`);
		}

		openConfirmModal(
			"danger",
			"Delete All Guests",
			"Are you sure you want to permanently delete all guest records from the system? All invitations and QR codes will be invalidated. This action cannot be undone.",
			{
				details: [
					{
						label: "Total Guests to Delete",
						value: countToDelete,
						colorClass: "text-shop-cream font-bold",
					},
					{
						label: "Checked-In Guests",
						value: checkedInToDelete,
						colorClass: "text-emerald-400 font-bold",
					},
					{
						label: "Pending Guests",
						value: pendingToDelete,
						colorClass: "text-amber-400 font-bold",
					},
				],
				guestPreviewList: previewNames,
				confirmText: `Delete All (${countToDelete})`,
				loadingText: "Deleting All...",
				cancelText: "Cancel",
				onConfirm: async () => {
					pauseRealtime();
					try {
						// Only delete from check_ins if any guest was actually checked in
						if (checkedInToDelete > 0) {
							await supabase
								.from("check_ins")
								.delete()
								.neq("id", "00000000-0000-0000-0000-000000000000");
						}

						const guestIds = guests.map((g) => g.id);
						const deleteChunkSize = 150;
						let deleteError: unknown = null;

						if (guestIds.length <= deleteChunkSize) {
							const { error } = await supabase
								.from("guests")
								.delete()
								.neq("id", "00000000-0000-0000-0000-000000000000");
							deleteError = error;
						} else {
							const idChunks: string[][] = [];
							for (let i = 0; i < guestIds.length; i += deleteChunkSize) {
								idChunks.push(guestIds.slice(i, i + deleteChunkSize));
							}

							// Execute parallel batch deletes across multiple Postgres workers
							const concurrency = 6;
							for (let i = 0; i < idChunks.length; i += concurrency) {
								const batch = idChunks.slice(i, i + concurrency);
								const results = await Promise.all(
									batch.map((chunkIds) =>
										supabase.from("guests").delete().in("id", chunkIds),
									),
								);
								const failed = results.find((r) => r.error);
								if (failed?.error) {
									deleteError = failed.error;
									break;
								}
							}
						}

						setConfirmModal(null);

						if (deleteError) {
							console.error("Failed to delete all guests:", deleteError);
							await fetchGuests();
							showToast(
								"error",
								"Delete All Failed",
								"Unable to delete guest records right now. Please try again.",
							);
						} else {
							setGuests([]);
							setCurrentPage(1);
							showToast(
								"success",
								"All Guests Deleted",
								`Successfully deleted all ${countToDelete} guest record(s) from the system.`,
							);
						}
					} finally {
						resumeRealtime();
					}
				},
			},
		);
	};

	// Handle Manual Check-in
	const handleManualCheckIn = (guest: Guest) => {
		if (guest.checked_in) return;
		const displayName = capitalizeName(guest.name);

		openConfirmModal(
			"confirm",
			"Manual Check-In",
			`Are you sure you want to manually check in ${displayName}?`,
			{
				confirmText: "Check In Guest",
				loadingText: "Checking In...",
				cancelText: "Cancel",
				onConfirm: async () => {
					const { data, error } = await supabase.rpc("manual_check_in", {
						p_guest_id: guest.id,
					});

					setConfirmModal(null);

					if (error || !data?.success) {
						if (error) console.error("Manual check-in error:", error);
						showToast(
							"error",
							"Check-In Failed",
							getUserFriendlyError(
								data?.error,
								"Unable to check in this guest right now. Please try again.",
							),
						);
					} else {
						await fetchGuests();
						showToast(
							"success",
							"Guest Checked In",
							`${displayName} has been manually checked in.`,
						);
					}
				},
			},
		);
	};

	const handleReissueQr = (guest: Guest) => {
		const displayName = capitalizeName(guest.name);
		const wasCheckedIn = guest.checked_in;

		openConfirmModal(
			"confirm",
			"Reissue QR Code",
			wasCheckedIn
				? `Generate a new QR code for ${displayName}? Any previous QR code will be invalidated, and ${displayName} will be checked out so the new QR code can be scanned again at the entrance.`
				: `Generate a new QR code for ${displayName}? Any previous QR code will immediately be invalidated.`,
			{
				confirmText: "Reissue QR Code",
				loadingText: "Reissuing...",
				cancelText: "Cancel",
				onConfirm: async () => {
					// Clean up any existing check-in log for this guest
					await supabase.from("check_ins").delete().eq("guest_id", guest.id);

					// Also call RPC if available
					await supabase.rpc("reissue_guest_qr", {
						p_guest_id: guest.id,
					});

					// Generate new QR token and ensure guest is checked out so scanner can scan again
					const { error: checkoutError } = await supabase
						.from("guests")
						.update({
							qr_token: generateToken(24),
							checked_in: false,
							checked_in_at: null,
							is_revoked: false,
							updated_at: new Date().toISOString(),
						})
						.eq("id", guest.id);

					setConfirmModal(null);

					if (checkoutError) {
						console.error("Failed to reissue QR code:", checkoutError);
						showToast(
							"error",
							"Reissue Failed",
							"Unable to reissue the QR code right now. Please try again.",
						);
						await fetchGuests();
						return;
					}

					await fetchGuests();
					showToast(
						"success",
						"QR Code Reissued",
						wasCheckedIn
							? `New QR code issued for ${displayName}, and status reset to Pending so they can be scanned again.`
							: `A new QR code has been issued for ${displayName}.`,
					);
				},
			},
		);
	};

	const handleRevokeQr = (guest: Guest) => {
		if (guest.is_revoked) return;
		const displayName = capitalizeName(guest.name);

		openConfirmModal(
			"danger",
			"Revoke QR Code",
			guest.checked_in
				? `Are you sure you want to revoke the QR code for ${displayName}? Their pass will immediately be invalidated and their check-in status will be reset.`
				: `Are you sure you want to revoke the QR code for ${displayName}? Their digital pass will immediately be invalidated and will be declined at the entrance.`,
			{
				confirmText: "Revoke QR Code",
				loadingText: "Revoking...",
				cancelText: "Cancel",
				onConfirm: async () => {
					if (guest.checked_in) {
						await supabase.from("check_ins").delete().eq("guest_id", guest.id);
					}

					const { error: revokeError } = await supabase
						.from("guests")
						.update({
							is_revoked: true,
							checked_in: false,
							checked_in_at: null,
							updated_at: new Date().toISOString(),
						})
						.eq("id", guest.id);

					setConfirmModal(null);

					if (revokeError) {
						console.error("Failed to revoke QR code:", revokeError);
						showToast(
							"error",
							"Revoke Failed",
							"Unable to revoke the QR code right now. Please try again.",
						);
						await fetchGuests();
						return;
					}

					await fetchGuests();
					showToast(
						"success",
						"QR Code Revoked",
						`The QR code for ${displayName} has been revoked and can no longer be used.`,
					);
				},
			},
		);
	};

	const getAppOrigin = () => {
		return import.meta.env.VITE_APP_URL.replace(/\/$/, "");
	};

	// Copy invitation link
	const handleCopyInviteLink = (token: string) => {
		const origin = getAppOrigin();
		const url = `${origin}/invite/${token}`;
		navigator.clipboard.writeText(url);
		setCopiedToken(token);
		setTimeout(() => setCopiedToken(null), 2000);
	};

	// Open WhatsApp with prefilled invitation message
	const handleWhatsApp = (guest: Guest) => {
		const origin = getAppOrigin();
		const inviteUrl = `${origin}/invite/${guest.invite_token}`;
		const displayName = capitalizeName(guest.name);
		const message = `Hello ${displayName}! You are cordially invited to the private store opening of The Shop on Saturday, December 12, 2026 at 6:00 PM. Please access your digital entrance pass here: ${inviteUrl}`;
		const encoded = encodeURIComponent(message);
		const phoneNum =
			guest.phone_normalized || normalizeEgyptianPhone(guest.phone);
		window.open(`https://wa.me/${phoneNum}?text=${encoded}`, "_blank");
	};

	// Export report to CSV
	const handleExportCSV = () => {
		if (guests.length === 0) {
			showToast("error", "Export Unavailable", "No guests to export.");
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
			`"${capitalizeName(g.name).replace(/"/g, '""')}"`,
			`"${g.phone}"`,
			`"${g.phone_normalized}"`,
			g.checked_in ? "Yes" : "No",
			g.checked_in_at
				? `"${new Date(g.checked_in_at).toLocaleString()}"`
				: '""',
			`"${origin}/invite/${g.invite_token}"`,
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
				showToast(
					"error",
					"Empty File",
					"The uploaded file does not contain any rows.",
				);
				setImportLoading(false);
				return;
			}

			// Track existing normalized phone numbers to prevent duplicates in guest list
			const seenNormalizedPhones = new Set(
				guests.map(
					(g) => g.phone_normalized || normalizeEgyptianPhone(g.phone),
				),
			);

			// Map rows: find name and phone columns case-insensitively
			const newGuestsToInsert: Array<{
				name: string;
				phone: string;
				phone_normalized: string;
				invite_token: string;
				qr_token: string;
			}> = [];
			let skippedInvalidPhoneCount = 0;
			let skippedDuplicatePhoneCount = 0;

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
					if (!isValidEgyptianPhone(phone)) {
						skippedInvalidPhoneCount++;
						continue;
					}
					const normalized = normalizeEgyptianPhone(phone);
					if (seenNormalizedPhones.has(normalized)) {
						skippedDuplicatePhoneCount++;
						continue;
					}
					seenNormalizedPhones.add(normalized);
					newGuestsToInsert.push({
						name: capitalizeName(name),
						phone,
						phone_normalized: normalized,
						invite_token: generateToken(20),
						qr_token: generateToken(24),
					});
				}
			}

			if (newGuestsToInsert.length === 0) {
				const reasons: string[] = [];
				if (skippedDuplicatePhoneCount > 0) {
					reasons.push(
						`${skippedDuplicatePhoneCount} duplicate phone number(s)`,
					);
				}
				if (skippedInvalidPhoneCount > 0) {
					reasons.push(
						`${skippedInvalidPhoneCount} invalid Egyptian phone number(s)`,
					);
				}
				showToast(
					"error",
					"No Valid Guests Found",
					reasons.length > 0
						? `No rows could be imported (${reasons.join(", ")} skipped).`
						: "Could not find valid guest rows with Name and Egyptian Phone in the file.",
				);
				setImportLoading(false);
				if (fileInputRef.current) fileInputRef.current.value = "";
				return;
			}

			// Batch upsert in chunks of 500 while pausing realtime subscription
			const chunkSize = 500;
			let insertedCount = 0;
			let hasChunkError = false;
			pauseRealtime();
			setImportProgress({ current: 0, total: newGuestsToInsert.length });

			for (let i = 0; i < newGuestsToInsert.length; i += chunkSize) {
				const chunk = newGuestsToInsert.slice(i, i + chunkSize);
				let { error } = await supabase.from("guests").upsert(chunk, {
					onConflict: "phone_normalized",
					ignoreDuplicates: true,
				});

				if (error && error.code === "42P10") {
					const fallback = await supabase.from("guests").insert(chunk);
					error = fallback.error;
				}

				if (error) {
					console.error("Batch insert error:", error);
					hasChunkError = true;
					showToast(
						"error",
						"Import Error",
						"Unable to import the guest list right now. Please try again.",
					);
					break;
				}
				insertedCount += chunk.length;
				setImportProgress({
					current: insertedCount,
					total: newGuestsToInsert.length,
				});
			}

			await fetchGuests();
			setCurrentPage(1);

			if (!hasChunkError || insertedCount > 0) {
				const skippedParts: string[] = [];
				if (skippedDuplicatePhoneCount > 0) {
					skippedParts.push(
						`${skippedDuplicatePhoneCount} duplicate phone number(s)`,
					);
				}
				if (skippedInvalidPhoneCount > 0) {
					skippedParts.push(
						`${skippedInvalidPhoneCount} invalid Egyptian phone number(s)`,
					);
				}
				const skippedMsg =
					skippedParts.length > 0 ? ` (${skippedParts.join(", ")} skipped)` : "";
				const summaryMsg = `Successfully imported ${insertedCount} guests!${skippedMsg}`;
				setImportSummary(summaryMsg);
				if (insertedCount > 0) {
					showToast("success", "Guests Imported", summaryMsg);
				}
			}
			if (fileInputRef.current) fileInputRef.current.value = "";
		} catch (err: unknown) {
			console.error("File parse error:", err);
			showToast(
				"error",
				"File Parse Error",
				"Unable to read the uploaded file. Please ensure it is a valid CSV or Excel (.xlsx) file.",
			);
		} finally {
			resumeRealtime();
			setImportProgress(null);
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
				<div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
					{/* Search & Filter */}
					<div className="flex flex-1 items-center space-x-2 min-w-0">
						<div className="relative flex-1 min-w-0 lg:max-w-md">
							<Search className="w-4 h-4 text-shop-cream/40 absolute left-3 top-1/2 -translate-y-1/2" />
							<input
								type="text"
								value={searchQuery}
								onChange={(e) => {
									setSearchQuery(e.target.value);
									setCurrentPage(1);
								}}
								placeholder="Search guest name or phone..."
								className="w-full bg-shop-navy/60 border border-shop-cream/20 rounded-xl pl-9 pr-3 py-2 text-sm text-shop-cream placeholder-shop-cream/40 focus:outline-none focus:border-shop-gold"
							/>
						</div>

						<select
							value={statusFilter}
							onChange={(e) => {
								setStatusFilter(
									e.target.value as "all" | "checked_in" | "pending",
								);
								setCurrentPage(1);
							}}
							className="shrink-0 bg-shop-navy/60 border border-shop-cream/20 rounded-xl px-3 py-2 text-xs text-shop-cream focus:outline-none focus:border-shop-gold font-medium"
						>
							<option value="all">All Guests ({totalGuests})</option>
							<option value="checked_in">Checked In ({checkedInCount})</option>
							<option value="pending">Pending ({remainingCount})</option>
						</select>
					</div>

					{/* Action Buttons */}
					<div className="flex flex-wrap items-center gap-2 shrink-0">
						<button
							onClick={() => {
								setEditingGuest(null);
								setGuestForm({ name: "", phone: "" });
								setGuestFormErrors({});
								setIsAddModalOpen(true);
							}}
							className="bg-shop-cream hover:bg-shop-cream-light text-shop-navy font-bold text-xs py-2 px-3.5 rounded-xl transition flex items-center space-x-1.5 shadow whitespace-nowrap"
						>
							<Plus className="w-4 h-4 shrink-0" />
							<span>Add Guest</span>
						</button>

						<button
							onClick={() => setIsImportModalOpen(true)}
							className="bg-shop-navy hover:bg-shop-navy/80 border border-shop-cream/20 text-shop-cream text-xs font-semibold py-2 px-3 rounded-xl transition flex items-center space-x-1.5 whitespace-nowrap"
						>
							<Upload className="w-3.5 h-3.5 shrink-0" />
							<span>Import List</span>
						</button>

						<button
							onClick={handleExportCSV}
							className="bg-shop-navy hover:bg-shop-navy/80 border border-shop-cream/20 text-shop-cream text-xs font-semibold py-2 px-3 rounded-xl transition flex items-center space-x-1.5 whitespace-nowrap"
						>
							<Download className="w-3.5 h-3.5 shrink-0" />
							<span>Export CSV</span>
						</button>

						<button
							onClick={handleDeleteAllGuests}
							disabled={guests.length === 0}
							className="bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 hover:text-red-200 text-xs font-semibold py-2 px-3 rounded-xl transition flex items-center space-x-1.5 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
							title="Delete all guest records"
						>
							<Trash2 className="w-3.5 h-3.5 shrink-0" />
							<span>Delete All</span>
						</button>
					</div>
				</div>

				{/* Guest Table */}
				<div className="glass-panel rounded-2xl overflow-hidden border border-shop-cream/15 shadow-xl">
					<div className="overflow-x-auto">
						<table className="w-full min-w-[880px] text-left text-xs">
							<thead className="bg-shop-navy/80 border-b border-shop-cream/15 text-shop-cream/70 uppercase tracking-wider font-semibold">
								<tr>
									<th className="py-3.5 px-4 w-14 min-w-[3.5rem] text-center whitespace-nowrap">
										#
									</th>
									<th
										onClick={handleToggleNameSort}
										aria-sort={
											nameSortOrder === "asc"
												? "ascending"
												: nameSortOrder === "desc"
													? "descending"
													: "none"
										}
										className="py-3.5 px-4 min-w-[190px] whitespace-nowrap cursor-pointer select-none group hover:text-shop-cream transition-colors"
										title={
											nameSortOrder === "asc"
												? "Sorted A–Z (Click to sort Z–A)"
												: "Click to sort A–Z"
										}
									>
										<div className="inline-flex items-center space-x-1.5 whitespace-nowrap">
											<span>Guest Name</span>
											{nameSortOrder === "asc" ? (
												<ArrowUp className="w-3.5 h-3.5 text-shop-gold shrink-0" />
											) : nameSortOrder === "desc" ? (
												<ArrowDown className="w-3.5 h-3.5 text-shop-gold shrink-0" />
											) : (
												<ArrowUpDown className="w-3.5 h-3.5 text-shop-cream/40 group-hover:text-shop-cream/80 transition-colors shrink-0" />
											)}
										</div>
									</th>
									<th className="py-3.5 px-4 min-w-[160px] whitespace-nowrap">
										Mobile
									</th>
									<th className="py-3.5 px-4 min-w-[170px] whitespace-nowrap">
										Check-In Status
									</th>
									<th className="py-3.5 px-4 min-w-[210px] whitespace-nowrap">
										Invitation Link
									</th>
									<th className="py-3.5 px-4 min-w-[180px] text-right whitespace-nowrap">
										Actions
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-shop-cream/10">
								{loading ? (
									<tr>
										<td
											colSpan={6}
											className="py-12 text-center text-shop-cream/60"
										>
											<div className="w-8 h-8 border-2 border-shop-cream/20 border-t-shop-cream rounded-full animate-spin mx-auto mb-2" />
											Loading guest records...
										</td>
									</tr>
								) : filteredGuests.length === 0 ? (
									<tr>
										<td
											colSpan={6}
											className="py-12 text-center text-shop-cream/60"
										>
											No guests match your criteria. Click "Add Guest" or
											"Import List" to get started.
										</td>
									</tr>
								) : (
									paginatedGuests.map((guest, index) => (
										<tr
											key={guest.id}
											className="hover:bg-shop-cream/5 transition duration-150"
										>
											<td className="py-3.5 px-4 text-center font-mono text-shop-cream/60 text-xs whitespace-nowrap">
												{pageStartIndex + index + 1}
											</td>
											<td className="py-3.5 px-4 font-bold text-shop-cream text-sm whitespace-nowrap">
												{capitalizeName(guest.name)}
											</td>
											<td className="py-3.5 px-4 font-mono text-shop-cream/80 whitespace-nowrap">
												{formatPhoneDisplay(guest.phone)}
											</td>
											<td className="py-3.5 px-4 whitespace-nowrap">
												{guest.checked_in ? (
													<div className="inline-flex items-center space-x-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 rounded-full font-semibold whitespace-nowrap">
														<CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
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
													<span className="inline-flex items-center space-x-1 bg-red-500/20 text-red-300 border border-red-500/30 px-2.5 py-1 rounded-full font-semibold whitespace-nowrap">
														Revoked
													</span>
												) : (
													<span className="inline-flex items-center space-x-1 bg-amber-500/15 text-amber-300 border border-amber-500/20 px-2.5 py-1 rounded-full font-medium whitespace-nowrap">
														Pending
													</span>
												)}
											</td>
											<td className="py-3.5 px-4 whitespace-nowrap">
												<div className="flex items-center space-x-2 whitespace-nowrap">
													<button
														onClick={() =>
															handleCopyInviteLink(guest.invite_token)
														}
														className="bg-shop-navy/70 hover:bg-shop-navy border border-shop-cream/15 text-shop-cream px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition inline-flex items-center space-x-1.5 whitespace-nowrap shrink-0"
														title="Copy Invitation Link"
													>
														{copiedToken === guest.invite_token ? (
															<>
																<Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
																<span className="text-emerald-400">Copied</span>
															</>
														) : (
															<>
																<Copy className="w-3.5 h-3.5 shrink-0" />
																<span>Copy Link</span>
															</>
														)}
													</button>

													<button
														onClick={() => handleWhatsApp(guest)}
														className="bg-emerald-600/80 hover:bg-emerald-600 text-white px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition inline-flex items-center space-x-1.5 whitespace-nowrap shrink-0"
														title="Send Invitation via WhatsApp"
													>
														<MessageCircle className="w-3.5 h-3.5 shrink-0" />
														<span>WhatsApp</span>
													</button>
												</div>
											</td>
											<td className="py-3.5 px-4 text-right whitespace-nowrap">
												<div className="inline-flex items-center justify-end space-x-1.5 whitespace-nowrap">
													{!guest.checked_in && !guest.is_revoked && (
														<button
															onClick={() => handleManualCheckIn(guest)}
															className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 p-1.5 rounded-lg transition shrink-0"
															title="Manual Check-In"
														>
															<UserCheck className="w-3.5 h-3.5" />
														</button>
													)}

													<button
														onClick={() => handleReissueQr(guest)}
														className="bg-shop-navy hover:bg-shop-navy/80 border border-shop-cream/20 text-shop-cream/70 hover:text-shop-cream p-1.5 rounded-lg transition shrink-0"
														title="Reissue QR Code"
													>
														<QrCode className="w-3.5 h-3.5" />
													</button>

													<button
														onClick={() => handleRevokeQr(guest)}
														disabled={guest.is_revoked}
														className="bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 p-1.5 rounded-lg transition shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
														title={
															guest.is_revoked
																? "QR Code Already Revoked"
																: "Revoke QR Code"
														}
													>
														<Ban className="w-3.5 h-3.5" />
													</button>

													<button
														onClick={() => {
															setEditingGuest(guest);
															setGuestForm({
																name: capitalizeName(guest.name),
																phone: guest.phone,
															});
															setGuestFormErrors({});
															setIsAddModalOpen(true);
														}}
														className="bg-shop-navy hover:bg-shop-navy/80 border border-shop-cream/20 text-shop-cream/70 hover:text-shop-cream p-1.5 rounded-lg transition shrink-0"
														title="Edit Guest"
													>
														<Edit2 className="w-3.5 h-3.5" />
													</button>

													<button
														onClick={() =>
															handleDeleteGuest(guest.id, guest.name)
														}
														className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 p-1.5 rounded-lg transition shrink-0"
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

					{/* Pagination Footer */}
					{!loading && filteredGuests.length > 0 && (
						<div className="bg-shop-navy/60 border-t border-shop-cream/15 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-shop-cream/80">
							<div className="flex items-center space-x-3">
								<span>
									Showing{" "}
									<strong className="text-shop-cream">
										{pageStartIndex + 1}
									</strong>
									–
									<strong className="text-shop-cream">
										{Math.min(pageStartIndex + pageSize, filteredGuests.length)}
									</strong>{" "}
									of{" "}
									<strong className="text-shop-cream">
										{filteredGuests.length}
									</strong>{" "}
									guests
								</span>

								<div className="flex items-center space-x-1.5">
									<span className="text-shop-cream/50">Rows:</span>
									<select
										value={pageSize}
										onChange={(e) => {
											setPageSize(Number(e.target.value));
											setCurrentPage(1);
										}}
										className="bg-shop-navy border border-shop-cream/20 rounded-lg px-2 py-1 text-xs text-shop-cream focus:outline-none focus:border-shop-gold"
									>
										<option value={50}>50</option>
										<option value={100}>100</option>
										<option value={250}>250</option>
									</select>
								</div>
							</div>

							{totalPages > 1 && (
								<div className="flex items-center space-x-2">
									<button
										type="button"
										onClick={() =>
											setCurrentPage((prev) => Math.max(1, prev - 1))
										}
										disabled={safeCurrentPage <= 1}
										className="bg-shop-navy hover:bg-shop-navy/80 border border-shop-cream/20 text-shop-cream px-2.5 py-1.5 rounded-lg text-xs font-medium transition inline-flex items-center space-x-1 disabled:opacity-40 disabled:cursor-not-allowed"
									>
										<ChevronLeft className="w-3.5 h-3.5" />
										<span>Prev</span>
									</button>

									<span className="px-2 font-mono text-shop-cream/80">
										Page <strong className="text-shop-cream">{safeCurrentPage}</strong> of{" "}
										<strong className="text-shop-cream">{totalPages}</strong>
									</span>

									<button
										type="button"
										onClick={() =>
											setCurrentPage((prev) =>
												Math.min(totalPages, prev + 1),
											)
										}
										disabled={safeCurrentPage >= totalPages}
										className="bg-shop-navy hover:bg-shop-navy/80 border border-shop-cream/20 text-shop-cream px-2.5 py-1.5 rounded-lg text-xs font-medium transition inline-flex items-center space-x-1 disabled:opacity-40 disabled:cursor-not-allowed"
									>
										<span>Next</span>
										<ChevronRight className="w-3.5 h-3.5" />
									</button>
								</div>
							)}
						</div>
					)}
				</div>
			</main>

			{/* Add / Edit Guest Modal */}
			{isAddModalOpen && (
				<div
					onClick={handleCloseGuestModal}
					className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
				>
					<div
						onClick={(e) => e.stopPropagation()}
						className="bg-shop-dark border border-shop-cream/20 max-w-md w-full rounded-2xl p-6 shadow-2xl relative"
					>
						<button
							type="button"
							onClick={handleCloseGuestModal}
							disabled={isSavingGuest}
							className="absolute top-4 right-4 text-shop-cream/60 hover:text-shop-cream disabled:opacity-40 disabled:cursor-not-allowed"
						>
							<X className="w-5 h-5" />
						</button>

						<h3 className="font-display text-2xl font-bold uppercase tracking-wide text-shop-cream mb-4">
							{editingGuest ? "Edit Guest" : "Add New Guest"}
						</h3>

						<form onSubmit={handleSaveGuest} noValidate className="space-y-4">
							<div>
								<label className="block text-xs font-semibold uppercase tracking-wider text-shop-cream/70 mb-1">
									Full Name
								</label>
								<input
									type="text"
									value={guestForm.name}
									onChange={(e) => {
										setGuestForm({ ...guestForm, name: e.target.value });
										if (guestFormErrors.name) {
											setGuestFormErrors((prev) => ({
												...prev,
												name: undefined,
											}));
										}
									}}
									placeholder="e.g. Youssef Mansour"
									autoFocus
									disabled={isSavingGuest}
									aria-invalid={Boolean(guestFormErrors.name)}
									className={`w-full bg-shop-navy border rounded-xl px-4 py-2.5 text-sm text-shop-cream focus:outline-none transition disabled:opacity-50 ${
										guestFormErrors.name
											? "border-red-500 focus:border-red-500"
											: "border-shop-cream/20 focus:border-shop-gold"
									}`}
								/>
								{guestFormErrors.name ? (
									<p className="text-xs text-red-400 mt-1.5 flex items-start space-x-1.5">
										<AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
										<span>{guestFormErrors.name}</span>
									</p>
								) : (
									<p className="text-[11px] text-shop-cream/50 mt-1">
										Initials will be automatically capitalized.
									</p>
								)}
							</div>

							<div>
								<label className="block text-xs font-semibold uppercase tracking-wider text-shop-cream/70 mb-1">
									Egyptian Mobile Number
								</label>
								<input
									type="tel"
									value={guestForm.phone}
									onChange={(e) => {
										setGuestForm({ ...guestForm, phone: e.target.value });
										if (guestFormErrors.phone) {
											setGuestFormErrors((prev) => ({
												...prev,
												phone: undefined,
											}));
										}
									}}
									placeholder="010xxxxxxxx or +201xxxxxxxx"
									disabled={isSavingGuest}
									aria-invalid={Boolean(guestFormErrors.phone)}
									className={`w-full bg-shop-navy border rounded-xl px-4 py-2.5 text-sm font-mono text-shop-cream focus:outline-none transition disabled:opacity-50 ${
										guestFormErrors.phone
											? "border-red-500 focus:border-red-500"
											: "border-shop-cream/20 focus:border-shop-gold"
									}`}
								/>
								{guestFormErrors.phone ? (
									<p className="text-xs text-red-400 mt-1.5 flex items-start space-x-1.5">
										<AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
										<span>{guestFormErrors.phone}</span>
									</p>
								) : (
									<p className="text-[11px] text-shop-cream/50 mt-1">
										Valid Egyptian formats: 010..., 011..., 012..., 015...,
										+201...
									</p>
								)}
							</div>

							<div className="flex justify-end space-x-2 pt-2">
								<button
									type="button"
									onClick={handleCloseGuestModal}
									disabled={isSavingGuest}
									className="px-4 py-2 rounded-xl text-xs font-semibold text-shop-cream/70 hover:text-shop-cream disabled:opacity-40 disabled:cursor-not-allowed"
								>
									Cancel
								</button>
								<button
									type="submit"
									disabled={isSavingGuest}
									className="bg-shop-cream hover:bg-shop-cream-light text-shop-navy font-bold text-xs py-2.5 px-5 rounded-xl transition shadow flex items-center space-x-1.5 disabled:opacity-50 disabled:bg-shop-cream/40 disabled:text-shop-navy/60 disabled:cursor-not-allowed disabled:shadow-none"
								>
									{isSavingGuest && (
										<div className="w-3.5 h-3.5 border-2 border-shop-navy/30 border-t-shop-navy rounded-full animate-spin" />
									)}
									<span>
										{editingGuest
											? isSavingGuest
												? "Updating..."
												: "Update Guest"
											: isSavingGuest
												? "Adding..."
												: "Generate Invitation"}
									</span>
								</button>
							</div>
						</form>
					</div>
				</div>
			)}

			{/* Import Guests Modal */}
			{isImportModalOpen && (
				<div
					onClick={() => {
						if (importLoading) return;
						setIsImportModalOpen(false);
						setImportSummary(null);
					}}
					className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
				>
					<div
						onClick={(e) => e.stopPropagation()}
						className="bg-shop-dark border border-shop-cream/20 max-w-lg w-full rounded-2xl p-6 shadow-2xl relative"
					>
						<button
							onClick={() => {
								if (importLoading) return;
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
							Egyptian mobile numbers.
						</p>

						<div className="border-2 border-dashed border-shop-cream/25 rounded-2xl p-6 text-center bg-shop-navy">
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
							<div className="mt-4 p-3 bg-shop-navy rounded-xl text-center text-xs text-shop-cream flex items-center justify-center space-x-2">
								<div className="w-4 h-4 border-2 border-shop-cream/30 border-t-shop-cream rounded-full animate-spin shrink-0" />
								<span>
									{importProgress
										? `Importing guests (${importProgress.current} / ${importProgress.total})...`
										: "Processing file and generating secure invitation tokens..."}
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
									if (importLoading) return;
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

			{/* System-Styled Confirmation Modal (only for pre-action confirmations) */}
			{confirmModal?.isOpen && (
				<div
					onClick={closeConfirmModal}
					className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
				>
					<div
						onClick={(e) => e.stopPropagation()}
						className="bg-shop-dark border border-shop-cream/20 max-w-md w-full rounded-2xl p-6 shadow-2xl relative"
					>
						<button
							type="button"
							onClick={closeConfirmModal}
							disabled={confirmActionLoading}
							className="absolute top-4 right-4 text-shop-cream/60 hover:text-shop-cream disabled:opacity-40 disabled:cursor-not-allowed"
						>
							<X className="w-5 h-5" />
						</button>

						<div className="flex items-start space-x-3.5">
							{/* Status Icon Badge */}
							<div
								className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${
									confirmModal.type === "danger"
										? "bg-red-500/15 border-red-500/30 text-red-400"
										: "bg-amber-500/15 border-amber-500/30 text-shop-gold"
								}`}
							>
								{confirmModal.type === "danger" ? (
									confirmModal.title.toLowerCase().includes("revoke") ? (
										<Ban className="w-5 h-5 text-red-400" />
									) : (
										<Trash2 className="w-5 h-5 text-red-400" />
									)
								) : (
									<AlertTriangle className="w-5 h-5 text-shop-gold" />
								)}
							</div>

							<div className="flex-1 pr-4">
								<h3 className="font-display text-2xl font-bold uppercase tracking-wide text-shop-cream leading-tight">
									{confirmModal.title}
								</h3>
								<p className="text-xs sm:text-sm text-shop-cream/80 mt-1.5 leading-relaxed">
									{confirmModal.message}
								</p>
							</div>
						</div>

						{/* Optional Breakdown Details (e.g. Delete All Guests Summary) */}
						{confirmModal.details && confirmModal.details.length > 0 && (
							<div className="mt-4 bg-shop-navy border border-shop-cream/15 rounded-xl p-3.5 space-y-2 text-xs">
								{confirmModal.details.map((item, idx) => (
									<div
										key={idx}
										className="flex items-center justify-between border-b border-shop-cream/10 last:border-b-0 pb-1.5 last:pb-0"
									>
										<span className="text-shop-cream/70">{item.label}</span>
										<span
											className={
												item.colorClass || "text-shop-cream font-semibold"
											}
										>
											{item.value}
										</span>
									</div>
								))}
							</div>
						)}

						{/* Optional Preview of Guests Affected */}
						{confirmModal.guestPreviewList &&
							confirmModal.guestPreviewList.length > 0 && (
								<div className="mt-3 bg-shop-navy border border-shop-cream/10 rounded-xl p-3">
									<span className="block text-[10px] uppercase tracking-wider text-shop-cream/50 font-semibold mb-1.5">
										Records to be deleted
									</span>
									<ul className="text-xs text-shop-cream/80 space-y-1 max-h-28 overflow-y-auto font-mono">
										{confirmModal.guestPreviewList.map((line, i) => (
											<li key={i} className="truncate">
												• {line}
											</li>
										))}
									</ul>
								</div>
							)}

						{/* Modal Footer Actions */}
						<div className="mt-6 flex items-center justify-end space-x-2.5">
							<button
								type="button"
								onClick={closeConfirmModal}
								disabled={confirmActionLoading}
								className="px-4 py-2.5 rounded-xl text-xs font-semibold text-shop-cream/70 hover:text-shop-cream border border-shop-cream/15 hover:bg-shop-cream/5 transition disabled:opacity-40 disabled:cursor-not-allowed"
							>
								{confirmModal.cancelText || "Cancel"}
							</button>
							<button
								type="button"
								onClick={handleConfirmAction}
								disabled={confirmActionLoading}
								className={`font-bold text-xs py-2.5 px-5 rounded-xl transition shadow flex items-center space-x-1.5 disabled:opacity-50 disabled:cursor-not-allowed ${
									confirmModal.type === "danger"
										? "bg-red-500 hover:bg-red-600 text-white"
										: "bg-shop-cream hover:bg-shop-cream-light text-shop-navy"
								}`}
							>
								{confirmActionLoading ? (
									<>
										<div
											className={`w-3.5 h-3.5 border-2 rounded-full animate-spin ${
												confirmModal.type === "danger"
													? "border-white/30 border-t-white"
													: "border-shop-navy/30 border-t-shop-navy"
											}`}
										/>
										<span>{confirmModal.loadingText || "Processing..."}</span>
									</>
								) : (
									<span>{confirmModal.confirmText || "Confirm"}</span>
								)}
							</button>
						</div>
					</div>
				</div>
			)}

			{/* System-Styled Toaster Notifications (Success & Error UI) */}
			<div className="fixed bottom-5 right-5 z-[70] flex flex-col gap-3 max-w-sm w-full px-4 sm:px-0 pointer-events-none">
				{toasts.map((toast) => (
					<div
						key={toast.id}
						className={`pointer-events-auto bg-shop-dark rounded-2xl p-4 shadow-2xl border flex items-start space-x-3 animate-toastIn ${
							toast.type === "success"
								? "border-emerald-500/40 shadow-emerald-950/40"
								: "border-red-500/40 shadow-red-950/40"
						}`}
					>
						<div
							className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
								toast.type === "success"
									? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
									: "bg-red-500/15 border-red-500/30 text-red-400"
							}`}
						>
							{toast.type === "success" ? (
								<CheckCircle2 className="w-5 h-5 text-emerald-400" />
							) : (
								<AlertCircle className="w-5 h-5 text-red-400" />
							)}
						</div>

						<div className="flex-1 min-w-0 pr-2">
							<h4
								className={`font-display text-lg uppercase tracking-wider font-bold leading-tight ${
									toast.type === "success" ? "text-emerald-300" : "text-red-300"
								}`}
							>
								{toast.title}
							</h4>
							<p className="text-xs text-shop-cream/85 mt-0.5 leading-relaxed">
								{toast.message}
							</p>
						</div>

						<button
							type="button"
							onClick={() => dismissToast(toast.id)}
							className="text-shop-cream/50 hover:text-shop-cream transition p-0.5 shrink-0"
							title="Dismiss notification"
						>
							<X className="w-4 h-4" />
						</button>
					</div>
				))}
			</div>
		</div>
	);
};
