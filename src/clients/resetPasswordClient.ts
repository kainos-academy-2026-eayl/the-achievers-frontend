export class ResetPasswordApiError extends Error {
	constructor(
		public readonly status: number,
		// Backend-provided message for a rejected request, empty when there is none.
		public readonly detail = "",
	) {
		super(`Reset password request failed with status ${status}`);
	}
}

function readErrorDetail(data: unknown): string {
	if (typeof data !== "object" || data === null) return "";
	const { error } = data as { error?: unknown };
	return typeof error === "string" ? error.trim() : "";
}

export class ResetPasswordClient {
	constructor(private readonly baseUrl: string) {}

	private async post(path: string, body: Record<string, string>) {
		const response = await fetch(new URL(path, this.baseUrl), {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(5000),
		});
		const data: unknown = await response.json().catch(() => undefined);
		return { response, data };
	}

	// Resolves false when the backend rejects the email or safe word; throws for anything unexpected.
	async verifySafeWord(email: string, safeWord: string): Promise<boolean> {
		const { response } = await this.post("/api/reset-password/verify", {
			email,
			safeWord,
		});
		if (response.ok) return true;
		if (response.status === 400 || response.status === 401) return false;
		throw new ResetPasswordApiError(response.status);
	}

	// The backend checks the safe word again, so a skipped verify step cannot reset a password.
	async resetPassword(
		email: string,
		safeWord: string,
		newPassword: string,
	): Promise<void> {
		const { response, data } = await this.post("/api/reset-password", {
			email,
			safeWord,
			newPassword,
		});
		if (!response.ok) {
			throw new ResetPasswordApiError(response.status, readErrorDetail(data));
		}
	}
}
