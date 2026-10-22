import type { CartClient } from "../clients/cartClient";
import type { CartItemViewModel, CartViewModel } from "../models/cartViewModel";

const currency = new Intl.NumberFormat("en-GB", {
	style: "currency",
	currency: "GBP",
});

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class CartService {
	constructor(
		private readonly client: Pick<
			CartClient,
			"get" | "add" | "update" | "remove"
		>,
	) {}

	async get(cartId: string): Promise<CartViewModel> {
		const data = await this.client.get(cartId);
		if (!isRecord(data) || !Array.isArray(data.items)) {
			throw new Error("Unexpected cart response format");
		}

		let totalPence = 0;
		let count = 0;
		const productIds = new Set<string>();
		const items: CartItemViewModel[] = data.items.map((item: unknown) => {
			if (!isRecord(item) || !isRecord(item.product)) {
				throw new Error("Invalid cart item");
			}
			const { id, name, price } = item.product;
			const { quantity } = item;
			if (
				typeof id !== "string" ||
				!id.trim() ||
				productIds.has(id) ||
				typeof name !== "string" ||
				!name.trim() ||
				typeof price !== "number" ||
				!Number.isFinite(price) ||
				price < 0 ||
				typeof quantity !== "number" ||
				!Number.isSafeInteger(quantity) ||
				quantity < 1
			) {
				throw new Error("Invalid cart product, price or quantity");
			}
			const pricePence = Math.round(price * 100);
			const subtotalPence = pricePence * quantity;
			totalPence += subtotalPence;
			count += quantity;
			if (
				Math.abs(price * 100 - pricePence) > 0.000001 ||
				!Number.isSafeInteger(pricePence) ||
				!Number.isSafeInteger(subtotalPence) ||
				!Number.isSafeInteger(totalPence) ||
				!Number.isSafeInteger(count)
			) {
				throw new Error("Cart pricing exceeds supported precision or range");
			}
			productIds.add(id);
			return {
				productId: id,
				name: name.trim(),
				price: currency.format(pricePence / 100),
				quantity,
				subtotal: currency.format(subtotalPence / 100),
			};
		});

		return { items, count, total: currency.format(totalPence / 100) };
	}

	add(cartId: string, productId: string, quantity: number): Promise<void> {
		return this.client.add(cartId, productId, quantity);
	}

	update(cartId: string, productId: string, quantity: number): Promise<void> {
		return this.client.update(cartId, productId, quantity);
	}

	remove(cartId: string, productId: string): Promise<void> {
		return this.client.remove(cartId, productId);
	}
}
