import {
	PRODUCT_FIELDS,
	type ProductFieldErrors,
	type ProductInput,
} from "../services/productValidation";

export class ProductApiError extends Error {
	constructor(
		readonly status: number,
		readonly fieldErrors: ProductFieldErrors = {},
	) {
		super(`Product request failed with status ${status}`);
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

	async create(input: ProductInput, accessToken: string): Promise<void> {
		const response = await fetch(new URL("/api/products", this.baseUrl), {
			method: "POST",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(input),
			signal: AbortSignal.timeout(5000),
		});
		if (response.status === 400) {
			const body: unknown = await response.json();
			if (
				typeof body !== "object" ||
				body === null ||
				!("fieldErrors" in body)
			) {
				throw new Error("Invalid product validation response");
			}
			const errors = body.fieldErrors;
			if (
				typeof errors !== "object" ||
				errors === null ||
				Array.isArray(errors)
			) {
				throw new Error("Invalid product field errors");
			}
			const fieldErrors: ProductFieldErrors = {};
			for (const field of PRODUCT_FIELDS) {
				if (field in errors) {
					const message = Reflect.get(errors, field);
					if (typeof message !== "string" || !message.trim()) {
						throw new Error("Invalid product field error");
					}
					fieldErrors[field] = message;
				}
			}
			if (Object.keys(fieldErrors).length === 0) {
				throw new Error("Missing product field errors");
			}
			throw new ProductApiError(400, fieldErrors);
		}
		if (response.status !== 201) {
			throw new ProductApiError(response.status);
		}
		const product: unknown = await response.json();
		if (
			typeof product !== "object" ||
			product === null ||
			!("id" in product) ||
			typeof product.id !== "string" ||
			!product.id.trim() ||
			!("name" in product) ||
			product.name !== input.name ||
			!("description" in product) ||
			product.description !== input.description ||
			!("category" in product) ||
			product.category !== input.category ||
			!("price" in product) ||
			product.price !== Number(input.price)
		) {
			throw new Error("Unexpected product creation response");
		}
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
