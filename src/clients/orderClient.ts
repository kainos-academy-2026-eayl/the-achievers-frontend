export type ShippingAddressInput = {
	addressLine1: string;
	addressLine2: string;
	city: string;
	postcode: string;
};

export class OrderApiError extends Error {
	constructor(
		public readonly status: number,
		message: string,
		public readonly fieldErrors: Record<string, string> = {},
	) {
		super(message);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readFieldErrors(value: unknown): Record<string, string> {
	if (!isRecord(value) || !isRecord(value.fieldErrors)) return {};
	return Object.fromEntries(
		Object.entries(value.fieldErrors).filter(
			(entry): entry is [string, string] => typeof entry[1] === "string",
		),
	);
}

export class OrderClient {
	constructor(private readonly baseUrl: string) {}

	private async request(
		accessToken: string,
		method: "GET" | "POST",
		path: string,
		cartId?: string,
		shippingAddress?: ShippingAddressInput,
	): Promise<unknown> {
		const response = await fetch(new URL(path, this.baseUrl), {
			method,
			headers: {
				Authorization: `Bearer ${accessToken}`,
				...(cartId ? { "X-Cart-Id": cartId } : {}),
				...(shippingAddress ? { "Content-Type": "application/json" } : {}),
			},
			...(shippingAddress ? { body: JSON.stringify({ shippingAddress }) } : {}),
			signal: AbortSignal.timeout(5000),
		});
		const data: unknown = await response.json().catch(() => undefined);
		if (!response.ok) {
			const message =
				isRecord(data) && typeof data.error === "string"
					? data.error
					: "The order request could not be completed.";
			throw new OrderApiError(response.status, message, readFieldErrors(data));
		}
		return data;
	}

	checkout(
		accessToken: string,
		cartId: string,
		shippingAddress: ShippingAddressInput,
	): Promise<unknown> {
		return this.request(
			accessToken,
			"POST",
			"/api/orders",
			cartId,
			shippingAddress,
		);
	}

	get(accessToken: string, id: string): Promise<unknown> {
		return this.request(
			accessToken,
			"GET",
			`/api/orders/${encodeURIComponent(id)}`,
		);
	}
}
