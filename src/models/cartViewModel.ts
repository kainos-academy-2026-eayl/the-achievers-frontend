export interface CartItemViewModel {
	productId: string;
	name: string;
	price: string;
	quantity: number;
	subtotal: string;
}

export interface CartViewModel {
	items: CartItemViewModel[];
	count: number;
	total: string;
}
