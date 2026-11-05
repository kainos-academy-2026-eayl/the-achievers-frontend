export interface ReviewInput {
	orderId: string;
	rating: number;
	comment: string;
}

export class ReviewApiError extends Error {
	constructor(
		public readonly status: number,
		message: string,
	) {
		super(message);
	}
}

export class ReviewClient {
	constructor(private readonly baseUrl: string) {}

	private async request(
		accessToken: string,
		method: "GET" | "PUT",
		path: string,
		body?: ReviewInput,
	): Promise<unknown> {
		const response = await fetch(new URL(path, this.baseUrl), {
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
			const message =
				typeof data === "object" &&
				data !== null &&
				typeof (data as Record<string, unknown>).error === "string"
					? ((data as Record<string, unknown>).error as string)
					: "The review request could not be completed.";
			throw new ReviewApiError(response.status, message);
		}
		return data;
	}

	listMine(accessToken: string): Promise<unknown> {
		return this.request(accessToken, "GET", "/api/reviews/me");
	}

	async listForProduct(
		productId: string,
		accessToken?: string,
	): Promise<unknown> {
		const response = await fetch(
			new URL(`/api/reviews/${encodeURIComponent(productId)}`, this.baseUrl),
			{
				headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
				signal: AbortSignal.timeout(5000),
			},
		);
		const data: unknown = await response.json().catch(() => undefined);
		if (!response.ok) {
			throw new ReviewApiError(response.status, "Reviews could not be loaded.");
		}
		return data;
	}

	// Backend upserts on (userId, productId) and recalculates Product.rating/reviewCount.
	save(
		accessToken: string,
		productId: string,
		review: ReviewInput,
	): Promise<unknown> {
		return this.request(
			accessToken,
			"PUT",
			`/api/reviews/${encodeURIComponent(productId)}`,
			review,
		);
	}
}
