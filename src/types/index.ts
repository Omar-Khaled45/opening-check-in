export type UserRole = "admin" | "scanner";

export interface Guest {
	id: string;
	name: string;
	phone: string;
	phone_normalized: string;
	invite_token: string;
	qr_token: string;
	is_revoked: boolean;
	checked_in: boolean;
	checked_in_at: string | null;
	created_at: string;
	updated_at: string;
}

export interface VerifyGuestResponse {
	success: boolean;
	error?: string;
	guest_name?: string;
	qr_token?: string;
	checked_in?: boolean;
	checked_in_at?: string | null;
}

export type ScanStatus =
	| "SUCCESS"
	| "ALREADY_CHECKED_IN"
	| "INVALID"
	| "UNAUTHORIZED";

export interface ScanGuestResponse {
	status: ScanStatus;
	message?: string;
	guest_name?: string;
	checked_in_at?: string | null;
}

export interface CheckInRecord {
	id: string;
	guest_id: string;
	scanned_by: string | null;
	scanned_at: string;
	method: "qr" | "manual";
}
