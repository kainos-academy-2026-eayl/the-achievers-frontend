export class ProductApiError extends Error {
	constructor(readonly status: number) {
		super(`Product deletion failed with status ${status}`);
	}
}

export class ProductClient {
	constructor(private readonly baseUrl: string) {}

	async getAll(): Promise<unknown> {
		const response = await fetch(new URL("/api/products", this.baseUrl), {
			signal: AbortSignal.timeout(5000),
		});

		if (!response.ok) {
			throw new Error(`Products request failed with status ${response.status}`);
		}

		return response.json();
	}

	async delete(id: string, accessToken: string): Promise<void> {
		const response = await fetch(
			new URL(`/api/products/${encodeURIComponent(id)}`, this.baseUrl),
			{
				method: "DELETE",
				headers: { Authorization: `Bearer ${accessToken}` },
				signal: AbortSignal.timeout(5000),
			},
		);
		if (response.status !== 204) {
			throw new ProductApiError(response.status);
		}
	}
}
