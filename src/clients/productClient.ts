import {
	PRODUCT_FIELDS,
	PRODUCT_EDIT_FIELDS,
	type ProductEditInput,
	type ProductEditFieldErrors,
	type ProductInput,
} from "../services/productValidation";

export const SUPPORTED_IMAGE_TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp",
] as const;

export interface ImageUpload {
	buffer: Buffer;
	mimeType: string;
	filename: string;
}

export interface ProductImageSummary {
	id: string;
}

export interface ProductForEdit {
	values: ProductEditInput;
	images: ProductImageSummary[];
}

export interface ProductImageFile {
	contentType: (typeof SUPPORTED_IMAGE_TYPES)[number];
	body: Buffer;
}

function parseImages(product: object): ProductImageSummary[] {
	if (!("images" in product)) {
		return [];
	}
	if (!Array.isArray(product.images)) {
		throw new Error("Unexpected product images response");
	}
	return product.images.map((image: unknown) => {
		if (
			typeof image !== "object" ||
			image === null ||
			!("id" in image) ||
			typeof image.id !== "string" ||
			!image.id.trim()
		) {
			throw new Error("Unexpected product image response");
		}
		return { id: image.id };
	});
}

function imageForm(file: ImageUpload): FormData {
	const form = new FormData();
	form.append(
		"image",
		new Blob([new Uint8Array(file.buffer)], { type: file.mimeType }),
		file.filename,
	);
	return form;
}

async function assertImageStatus(
	response: Response,
	expectedStatus: number,
): Promise<void> {
	if (response.status === expectedStatus) {
		return;
	}
	await response.body?.cancel();
	throw new ProductApiError(response.status);
}

export class ProductApiError extends Error {
	constructor(
		readonly status: number,
		readonly fieldErrors: ProductEditFieldErrors = {},
	) {
		super(`Product request failed with status ${status}`);
	}
}

async function throwValidationError(
	response: Response,
	fields: readonly (keyof ProductEditInput)[],
): Promise<never> {
	const body: unknown = await response.json();
	if (
		typeof body !== "object" ||
		body === null ||
		!("fieldErrors" in body) ||
		typeof body.fieldErrors !== "object" ||
		body.fieldErrors === null ||
		Array.isArray(body.fieldErrors)
	) {
		throw new Error("Invalid product validation response");
	}
	const errors = body.fieldErrors;
	const fieldErrors: ProductEditFieldErrors = {};
	for (const field of fields) {
		if (field in errors) {
			const message: unknown = Reflect.get(errors, field);
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
			await throwValidationError(response, PRODUCT_FIELDS);
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

	async getForEdit(id: string): Promise<ProductForEdit> {
		const response = await fetch(
			new URL(`/api/products/${encodeURIComponent(id)}`, this.baseUrl),
			{ signal: AbortSignal.timeout(5000) },
		);
		if (response.status !== 200) {
			throw new ProductApiError(response.status);
		}
		const product: unknown = await response.json();
		if (
			typeof product !== "object" ||
			product === null ||
			!("id" in product) ||
			product.id !== id ||
			!("name" in product) ||
			typeof product.name !== "string" ||
			!("description" in product) ||
			(typeof product.description !== "string" &&
				product.description !== null) ||
			!("category" in product) ||
			typeof product.category !== "string" ||
			!("price" in product) ||
			(product.price !== null &&
				(typeof product.price !== "number" ||
					!Number.isFinite(product.price) ||
					product.price < 0 ||
					product.price > 21474836.47)) ||
			!("stock" in product) ||
			typeof product.stock !== "number" ||
			!Number.isInteger(product.stock) ||
			product.stock < 0 ||
			product.stock > 2147483647
		) {
			throw new Error("Unexpected product editing response");
		}
		return {
			values: {
				name: product.name,
				description: product.description ?? "",
				category: product.category,
				price: product.price === null ? "" : product.price.toFixed(2),
				stock: String(product.stock),
			},
			images: parseImages(product),
		};
	}

	async uploadImage(
		productId: string,
		file: ImageUpload,
		accessToken: string,
	): Promise<void> {
		const response = await fetch(
			new URL(
				`/api/products/${encodeURIComponent(productId)}/images`,
				this.baseUrl,
			),
			{
				method: "POST",
				headers: { Authorization: ["Bearer", accessToken].join(" ") },
				body: imageForm(file),
				signal: AbortSignal.timeout(20000),
			},
		);
		await assertImageStatus(response, 201);
	}

	async replaceImage(
		productId: string,
		imageId: string,
		file: ImageUpload,
		accessToken: string,
	): Promise<void> {
		const response = await fetch(
			new URL(
				`/api/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}`,
				this.baseUrl,
			),
			{
				method: "PUT",
				headers: { Authorization: ["Bearer", accessToken].join(" ") },
				body: imageForm(file),
				signal: AbortSignal.timeout(20000),
			},
		);
		await assertImageStatus(response, 200);
	}

	async deleteImage(
		productId: string,
		imageId: string,
		accessToken: string,
	): Promise<void> {
		const response = await fetch(
			new URL(
				`/api/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}`,
				this.baseUrl,
			),
			{
				method: "DELETE",
				headers: { Authorization: ["Bearer", accessToken].join(" ") },
				signal: AbortSignal.timeout(5000),
			},
		);
		await assertImageStatus(response, 204);
	}

	async fetchImage(
		productId: string,
		imageId: string,
	): Promise<ProductImageFile> {
		const response = await fetch(
			new URL(
				`/api/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}`,
				this.baseUrl,
			),
			{ signal: AbortSignal.timeout(10000) },
		);
		if (response.status !== 200) {
			await response.body?.cancel();
			throw new ProductApiError(response.status);
		}
		const contentType = response.headers.get("content-type");
		const supported = SUPPORTED_IMAGE_TYPES.find(
			(type) => type === contentType,
		);
		if (!supported) {
			throw new Error("Unexpected product image content type");
		}
		return {
			contentType: supported,
			body: Buffer.from(await response.arrayBuffer()),
		};
	}

	async update(
		id: string,
		input: ProductEditInput,
		accessToken: string,
	): Promise<void> {
		const response = await fetch(
			new URL(`/api/products/${encodeURIComponent(id)}`, this.baseUrl),
			{
				method: "PUT",
				headers: {
					Authorization: ["Bearer", accessToken].join(" "),
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ ...input, stock: Number(input.stock) }),
				signal: AbortSignal.timeout(5000),
			},
		);
		if (response.status === 400) {
			await throwValidationError(response, PRODUCT_EDIT_FIELDS);
		}
		if (response.status !== 200) {
			throw new ProductApiError(response.status);
		}
		const product: unknown = await response.json();
		if (
			typeof product !== "object" ||
			product === null ||
			!("id" in product) ||
			product.id !== id ||
			!("name" in product) ||
			product.name !== input.name ||
			!("description" in product) ||
			product.description !== input.description ||
			!("category" in product) ||
			product.category !== input.category ||
			!("price" in product) ||
			product.price !== Number(input.price) ||
			!("stock" in product) ||
			product.stock !== Number(input.stock)
		) {
			throw new Error("Unexpected product update response");
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
