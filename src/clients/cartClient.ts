export class CartApiError extends Error {
	constructor(public readonly status: number) {
		super(`Cart request failed with status ${status}`);
	}
}

export class CartClient {
	constructor(private readonly baseUrl: string) {}

	private async request(
		cartId: string,
		method: string,
		path: string,
		body?: { productId: string; quantity: number } | { quantity: number },
	): Promise<Response> {
		const response = await fetch(new URL(path, this.baseUrl), {
			method,
			headers: {
				"Content-Type": "application/json",
				"X-Cart-Id": cartId,
			},
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
			signal: AbortSignal.timeout(5000),
		});

		if (!response.ok) {
			throw new CartApiError(response.status);
		}
		return response;
	}

	async get(cartId: string): Promise<unknown> {
		const response = await this.request(cartId, "GET", "/api/cart");
		return response.json();
	}

	async add(
		cartId: string,
		productId: string,
		quantity: number,
	): Promise<void> {
		await this.request(cartId, "POST", "/api/cart/items", {
			productId,
			quantity,
		});
	}

	async update(
		cartId: string,
		productId: string,
		quantity: number,
	): Promise<void> {
		await this.request(
			cartId,
			"PATCH",
			`/api/cart/items/${encodeURIComponent(productId)}`,
			{ quantity },
		);
	}

	async remove(cartId: string, productId: string): Promise<void> {
		await this.request(
			cartId,
			"DELETE",
			`/api/cart/items/${encodeURIComponent(productId)}`,
		);
	}
}
