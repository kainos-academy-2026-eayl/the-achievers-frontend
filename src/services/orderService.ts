import type { OrderClient, ShippingAddressInput } from "../clients/orderClient";

const currency = new Intl.NumberFormat("en-GB", {
	style: "currency",
	currency: "GBP",
});

export interface OrderViewModel {
	id: string;
	reference: string;
	status: string;
	items: {
		productId: string | null;
		name: string;
		price: string;
		quantity: number;
		subtotal: string;
	}[];
	subtotal: string;
	shipping: string;
	total: string;
	shippingAddress: ShippingAddressInput;
	createdAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMoney(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function mapOrder(raw: unknown): OrderViewModel {
	if (
		!isRecord(raw) ||
		!Array.isArray(raw.items) ||
		!isRecord(raw.shippingAddress)
	) {
		throw new Error("Unexpected order response format");
	}
	const { id, reference, status, subtotal, shipping, total, createdAt } = raw;
	const address = raw.shippingAddress;
	if (
		typeof id !== "string" ||
		!id ||
		typeof reference !== "string" ||
		!reference ||
		typeof status !== "string" ||
		!isMoney(subtotal) ||
		!isMoney(shipping) ||
		!isMoney(total) ||
		typeof createdAt !== "string" ||
		Number.isNaN(Date.parse(createdAt)) ||
		typeof address.addressLine1 !== "string" ||
		(address.addressLine2 !== null &&
			typeof address.addressLine2 !== "string") ||
		typeof address.city !== "string" ||
		typeof address.postcode !== "string"
	) {
		throw new Error("Invalid order response");
	}

	const items = raw.items.map((rawItem) => {
		if (!isRecord(rawItem)) throw new Error("Invalid order item");
		const { productId, name, price, quantity } = rawItem;
		if (
			(productId !== null && typeof productId !== "string") ||
			typeof name !== "string" ||
			!name.trim() ||
			!isMoney(price) ||
			!Number.isSafeInteger(quantity) ||
			(quantity as number) < 1
		) {
			throw new Error("Invalid order item");
		}
		return {
			productId,
			name: name.trim(),
			price: currency.format(price),
			quantity: quantity as number,
			subtotal: currency.format(price * (quantity as number)),
		};
	});

	return {
		id,
		reference,
		status,
		items,
		subtotal: currency.format(subtotal),
		shipping: currency.format(shipping),
		total: currency.format(total),
		shippingAddress: {
			addressLine1: address.addressLine1,
			addressLine2: address.addressLine2 ?? "",
			city: address.city,
			postcode: address.postcode,
		},
		createdAt,
	};
}

export class OrderService {
	constructor(private readonly client: Pick<OrderClient, "checkout" | "get">) {}

	async checkout(
		accessToken: string,
		cartId: string,
		shippingAddress: ShippingAddressInput,
	): Promise<OrderViewModel> {
		return mapOrder(
			await this.client.checkout(accessToken, cartId, shippingAddress),
		);
	}

	async get(accessToken: string, id: string): Promise<OrderViewModel> {
		return mapOrder(await this.client.get(accessToken, id));
	}
}
