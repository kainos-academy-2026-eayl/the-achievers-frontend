import type { CartClient } from "../clients/cartClient";
import type { CartItemViewModel, CartViewModel } from "../models/cartViewModel";
import type { ShippingDestination } from "../models/shippingDestination";

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

	async get(
		cartId: string,
		destination: ShippingDestination,
	): Promise<CartViewModel> {
		const data = await this.client.get(cartId, destination);
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

		const { estimatedShippingCost } = data;
		if (
			typeof estimatedShippingCost !== "number" ||
			!Number.isFinite(estimatedShippingCost) ||
			estimatedShippingCost < 0
		) {
			throw new Error("Invalid cart shipping estimate");
		}
		const shippingPence = Math.round(estimatedShippingCost * 100);
		if (
			Math.abs(estimatedShippingCost * 100 - shippingPence) > 0.000001 ||
			!Number.isSafeInteger(shippingPence)
		) {
			throw new Error(
				"Cart shipping estimate exceeds supported precision or range",
			);
		}

		const estimatedTotalPence = totalPence + shippingPence;
		if (!Number.isSafeInteger(estimatedTotalPence)) {
			throw new Error("Cart total exceeds supported precision or range");
		}

		return {
			items,
			count,
			total: currency.format(totalPence / 100),
			shippingEstimate: currency.format(shippingPence / 100),
			estimatedTotal: currency.format(estimatedTotalPence / 100),
		};
	}

	add(
		cartId: string,
		productId: string,
		quantity: number,
		destination: ShippingDestination,
	): Promise<void> {
		return this.client.add(cartId, productId, quantity, destination);
	}

	update(
		cartId: string,
		productId: string,
		quantity: number,
		destination: ShippingDestination,
	): Promise<void> {
		return this.client.update(cartId, productId, quantity, destination);
	}

	remove(
		cartId: string,
		productId: string,
		destination: ShippingDestination,
	): Promise<void> {
		return this.client.remove(cartId, productId, destination);
	}
}
