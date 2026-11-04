import type { ProductClient } from "../clients/productClient";
import type { ProductViewModel } from "../models/productViewModel";

const priceFormatter = new Intl.NumberFormat("en-GB", {
	style: "currency",
	currency: "GBP",
});

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim() !== "";
}

export function toProductViewModel(raw: unknown): ProductViewModel | null {
	if (typeof raw !== "object" || raw === null) {
		return null;
	}

	const {
		id,
		name,
		description,
		category,
		price,
		stock,
		inStock,
		rating,
		reviewCount,
	} = raw as Record<string, unknown>;

	if (
		!isNonEmptyString(id) ||
		!isNonEmptyString(name) ||
		!isNonEmptyString(description) ||
		!isNonEmptyString(category) ||
		typeof price !== "number" ||
		!Number.isFinite(price) ||
		price < 0
	) {
		return null;
	}

	const validRating =
		typeof rating === "number" && rating >= 0 && rating <= 5 ? rating : null;

	return {
		id,
		name: name.trim(),
		description: description.trim(),
		category: category.trim(),
		price: priceFormatter.format(price),
		inStock:
			typeof stock === "number" && Number.isSafeInteger(stock) && stock >= 0
				? stock > 0
				: typeof inStock === "boolean"
					? inStock
					: null,
		rating: validRating,
		ratingPercent: validRating === null ? 0 : (validRating / 5) * 100,
		reviewCount:
			typeof reviewCount === "number" &&
			Number.isInteger(reviewCount) &&
			reviewCount >= 0
				? reviewCount
				: 0,
	};
}

export function getCategories(products: ProductViewModel[]): string[] {
	return [...new Set(products.map((product) => product.category))].sort(
		(a, b) => a.localeCompare(b),
	);
}

export function filterByCategory(
	products: ProductViewModel[],
	category: string,
): ProductViewModel[] {
	return products.filter((product) => product.category === category);
}

export class ProductService {
	constructor(private readonly productClient: Pick<ProductClient, "getAll">) {}

	async getAll(): Promise<ProductViewModel[]> {
		const data = await this.productClient.getAll();

		if (!Array.isArray(data)) {
			throw new Error("Unexpected products response format");
		}

		return data
			.map(toProductViewModel)
			.filter((product): product is ProductViewModel => product !== null);
	}
}
