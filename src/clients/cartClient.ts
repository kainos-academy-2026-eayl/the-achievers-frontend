import type { ShippingDestination } from "../models/shippingDestination";

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
		destination: ShippingDestination,
		body?: { productId: string; quantity: number } | { quantity: number },
	): Promise<Response> {
		const url = new URL(path, this.baseUrl);
		url.searchParams.set("country", destination.country);
		url.searchParams.set("postcode", destination.postcode);
		const response = await fetch(url, {
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

	async get(
		cartId: string,
		destination: ShippingDestination,
	): Promise<unknown> {
		const response = await this.request(
			cartId,
			"GET",
			"/api/cart",
			destination,
		);
		return response.json();
	}

	async add(
		cartId: string,
		productId: string,
		quantity: number,
		destination: ShippingDestination,
	): Promise<void> {
		await this.request(cartId, "POST", "/api/cart/items", destination, {
			productId,
			quantity,
		});
	}

	async update(
		cartId: string,
		productId: string,
		quantity: number,
		destination: ShippingDestination,
	): Promise<void> {
		await this.request(
			cartId,
			"PATCH",
			`/api/cart/items/${encodeURIComponent(productId)}`,
			destination,
			{ quantity },
		);
	}

	async remove(
		cartId: string,
		productId: string,
		destination: ShippingDestination,
	): Promise<void> {
		await this.request(
			cartId,
			"DELETE",
			`/api/cart/items/${encodeURIComponent(productId)}`,
			destination,
		);
	}
}
