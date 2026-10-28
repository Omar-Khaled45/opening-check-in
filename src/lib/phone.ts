/**
 * Normalizes Egyptian mobile phone numbers to a consistent digits-only format.
 * Matches backend normalize_phone SQL function.
 * Examples:
 *   "01012345678" -> "201012345678"
 *   "+20 10 1234 5678" -> "201012345678"
 *   "201012345678" -> "201012345678"
 *   "1012345678" -> "201012345678"
 */
export function normalizeEgyptianPhone(input: string): string {
	if (!input) return "";
	// Remove all non-digits
	const cleaned = input.replace(/\D/g, "");

	// 11 digits starting with 01 (010, 011, 012, 015)
	if (/^01[0125]\d{8}$/.test(cleaned)) {
		return "20" + cleaned.slice(1);
	}

	// 12 digits starting with 201
	if (/^201[0125]\d{8}$/.test(cleaned)) {
		return cleaned;
	}

	// 10 digits starting with 1 (e.g. 1012345678)
	if (/^1[0125]\d{8}$/.test(cleaned)) {
		return "20" + cleaned;
	}

	return cleaned;
}

/**
 * Format Egyptian phone number for display (e.g., "+20 10 1234 5678" or "010 1234 5678")
 */
export function formatPhoneDisplay(phone: string): string {
	const norm = normalizeEgyptianPhone(phone);
	if (norm.length === 12 && norm.startsWith("20")) {
		const operator = norm.slice(2, 4);
		const part1 = norm.slice(4, 8);
		const part2 = norm.slice(8, 12);
		return `+20 ${operator} ${part1} ${part2}`;
	}
	return phone;
}

/**
 * Generates a cryptographically strong, URL-safe random token.
 */
export function generateToken(length = 24): string {
	const chars =
		"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
	const array = new Uint8Array(length);
	crypto.getRandomValues(array);
	return Array.from(array, (byte) => chars[byte % chars.length]).join("");
}
