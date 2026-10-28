export function normalizeEgyptianPhone(input: string): string {
	if (!input) return "";
	const cleaned = input.replace(/\D/g, "");

	if (/^01[0125]\d{8}$/.test(cleaned)) {
		return "20" + cleaned.slice(1);
	}

	// 12 digits starting with 201
	if (/^201[0125]\d{8}$/.test(cleaned)) {
		return cleaned;
	}

	// 14 digits starting with 00201
	if (/^00201[0125]\d{8}$/.test(cleaned)) {
		return cleaned.slice(2);
	}

	// 10 digits starting with 1 (e.g. 1012345678)
	if (/^1[0125]\d{8}$/.test(cleaned)) {
		return "20" + cleaned;
	}

	return cleaned;
}

export function isValidEgyptianPhone(input: string): boolean {
	if (!input) return false;
	const normalized = normalizeEgyptianPhone(input.trim());
	return /^201[0125]\d{8}$/.test(normalized);
}

export function capitalizeName(name: string): string {
	if (!name) return "";
	return name
		.trim()
		.replace(/\s+/g, " ")
		.split(" ")
		.filter(Boolean)
		.map((word) =>
			word
				.split("-")
				.map((part) =>
					part
						? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
						: "",
				)
				.join("-"),
		)
		.join(" ");
}

export function getFirstName(name: string): string {
	if (!name) return "";
	const firstWord = name.trim().split(/\s+/)[0] || "";
	return capitalizeName(firstWord);
}

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

export function generateToken(length = 24): string {
	const chars =
		"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
	const array = new Uint8Array(length);
	crypto.getRandomValues(array);
	return Array.from(array, (byte) => chars[byte % chars.length]).join("");
}

export function isValidInviteTokenFormat(token: string): boolean {
	if (!token) return false;
	return /^(?:[a-zA-Z0-9]{20,24}|inv_[a-zA-Z0-9]{8,24})$/.test(token.trim());
}
