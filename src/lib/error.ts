const TECHNICAL_ERROR_PATTERNS = [
	/row-level security/i,
	/\brls\b/i,
	/\bpolicy\b/i,
	/\btable\b/i,
	/\brelation\b/i,
	/\bcolumn\b/i,
	/\bconstraint\b/i,
	/\bviolates\b/i,
	/\bforeign key\b/i,
	/\bunique\b/i,
	/\bduplicate key\b/i,
	/\bpkey\b/i,
	/\bsyntax error\b/i,
	/\bpermission denied\b/i,
	/\bschema\b/i,
	/\bpublic\./i,
	/\bauth\./i,
	/\bguests\b/i,
	/\bcheck_ins\b/i,
	/\buser_roles\b/i,
	/\bsupabase\b/i,
	/\bpostgres/i,
	/\bpostgrest\b/i,
	/\bpgrst/i,
	/\bsql\b/i,
	/\brpc\b/i,
	/\bfunction\b/i,
	/\bnull value\b/i,
	/\buuid\b/i,
	/\bjson/i,
	/\bfetch\b/i,
	/\bnetworkerror\b/i,
	/\btypeerror\b/i,
	/\breferenceerror\b/i,
	/\bexception\b/i,
	/\bstack\b/i,
	/["'`]/,
];

export function isTechnicalErrorMessage(message: string): boolean {
	const trimmed = message.trim();
	if (!trimmed) return true;
	return TECHNICAL_ERROR_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function getUserFriendlyError(
	rawMessage: unknown,
	fallbackMessage: string,
): string {
	if (typeof rawMessage !== "string") {
		return fallbackMessage;
	}
	const trimmed = rawMessage.trim();
	if (!trimmed || isTechnicalErrorMessage(trimmed)) {
		return fallbackMessage;
	}
	return trimmed;
}

export function getFriendlyAuthError(error: unknown): string {
	const raw =
		error instanceof Error
			? error.message
			: typeof error === "string"
				? error
				: "";
	const lower = raw.toLowerCase();

	if (
		lower.includes("invalid login credentials") ||
		lower.includes("invalid email or password") ||
		lower.includes("invalid credentials")
	) {
		return "Invalid email or password. Please check your credentials and try again.";
	}

	if (lower.includes("email not confirmed")) {
		return "Please verify your email address before signing in.";
	}

	if (lower.includes("too many requests") || lower.includes("rate limit")) {
		return "Too many sign-in attempts. Please wait a moment and try again.";
	}

	if (
		lower.includes("not authorized") ||
		lower.includes("no assigned role") ||
		lower.includes("permission to access")
	) {
		return "Authentication Error";
	}

	return "Invalid email or password. Please try again.";
}
