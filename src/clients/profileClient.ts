export type Address = {
	label: string | null;
	addressLine1: string | null;
	addressLine2: string | null;
	city: string | null;
	postcode: string | null;
};

export type Profile = {
	name: string;
	email: string;
	phone: string | null;
	creditBalance: number;
	createdAt: string;
	homeAddress: Address | null;
	otherAddresses: Address[];
};

export type AddressInput = {
	label?: string;
	addressLine1: string;
	addressLine2: string;
	city: string;
	postcode: string;
};

export type ProfileUpdate = {
	name: string;
	email: string;
	phone: string;
	homeAddress: AddressInput;
	otherAddresses: AddressInput[];
	currentPassword: string;
};

// Keys match the backend, e.g. "phone", "homeAddress.city", "otherAddresses.1.label".
export type FieldErrors = Record<string, string>;

export class ProfileApiError extends Error {
	constructor(
		public readonly status: number,
		public readonly fieldErrors: FieldErrors = {},
	) {
		super(`Profile request failed with status ${status}`);
	}
}

const ADDRESS_KEYS = [
	"label",
	"addressLine1",
	"addressLine2",
	"city",
	"postcode",
] as const;

function isNullableString(value: unknown): boolean {
	return value === null || typeof value === "string";
}

function isAddress(value: unknown): value is Address {
	if (typeof value !== "object" || value === null) return false;
	const data = value as Record<string, unknown>;
	return ADDRESS_KEYS.every((key) => isNullableString(data[key]));
}

function isProfile(value: unknown): value is Profile {
	if (typeof value !== "object" || value === null) return false;
	const data = value as Record<string, unknown>;
	return (
		typeof data.name === "string" &&
		typeof data.email === "string" &&
		typeof data.createdAt === "string" &&
		isNullableString(data.phone) &&
		typeof data.creditBalance === "number" &&
		Number.isFinite(data.creditBalance) &&
		data.creditBalance >= 0 &&
		(data.homeAddress === null || isAddress(data.homeAddress)) &&
		Array.isArray(data.otherAddresses) &&
		data.otherAddresses.every(isAddress)
	);
}

function readFieldErrors(body: unknown): FieldErrors {
	if (typeof body !== "object" || body === null) return {};
	const { fieldErrors } = body as { fieldErrors?: unknown };
	if (typeof fieldErrors !== "object" || fieldErrors === null) return {};
	return Object.fromEntries(
		Object.entries(fieldErrors).filter(
			([, message]) => typeof message === "string",
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
