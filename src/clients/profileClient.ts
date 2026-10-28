export const PROFILE_FIELDS = [
	"name",
	"email",
	"phone",
	"addressLine1",
	"addressLine2",
	"city",
	"postcode",
] as const;

export type ProfileField = (typeof PROFILE_FIELDS)[number];
export type Profile = Record<ProfileField, string | null> & {
	createdAt: string;
};
export type ProfileUpdate = Record<ProfileField, string> & {
	currentPassword: string;
};
export type FieldErrors = Partial<
	Record<ProfileField | "currentPassword", string>
>;

const errorFields = [...PROFILE_FIELDS, "currentPassword"] as const;

export class ProfileApiError extends Error {
	constructor(
		public readonly status: number,
		public readonly fieldErrors: FieldErrors = {},
	) {
		super(`Profile request failed with status ${status}`);
	}
}

function isProfile(value: unknown): value is Profile {
	if (typeof value !== "object" || value === null) return false;
	const data = value as Record<string, unknown>;
	return (
		typeof data.name === "string" &&
		typeof data.email === "string" &&
		typeof data.createdAt === "string" &&
		PROFILE_FIELDS.every(
			(field) => data[field] === null || typeof data[field] === "string",
		)
	);
}

function readFieldErrors(body: unknown): FieldErrors {
	if (typeof body !== "object" || body === null) return {};
	const { fieldErrors } = body as { fieldErrors?: unknown };
	if (typeof fieldErrors !== "object" || fieldErrors === null) return {};
	return Object.fromEntries(
		Object.entries(fieldErrors).filter(
			([field, message]) =>
				(errorFields as readonly string[]).includes(field) &&
				typeof message === "string",
		),
	);
}

export class ProfileClient {
	constructor(private readonly baseUrl: string) {}

	private async request(
		accessToken: string,
		method: "GET" | "PATCH",
		body?: ProfileUpdate,
	): Promise<Profile> {
		const response = await fetch(new URL("/api/me", this.baseUrl), {
			method,
			headers: {
				Authorization: `Bearer ${accessToken}`,
				...(body ? { "Content-Type": "application/json" } : {}),
			},
			...(body ? { body: JSON.stringify(body) } : {}),
			signal: AbortSignal.timeout(5000),
		});
		const data: unknown = await response.json().catch(() => undefined);
		if (!response.ok) {
			throw new ProfileApiError(response.status, readFieldErrors(data));
		}
		if (!isProfile(data)) {
			throw new Error("Profile response has an unexpected shape");
		}
		return data;
	}

	get(accessToken: string): Promise<Profile> {
		return this.request(accessToken, "GET");
	}

	update(accessToken: string, update: ProfileUpdate): Promise<Profile> {
		return this.request(accessToken, "PATCH", update);
	}
}
