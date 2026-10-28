export interface ShippingDestination {
	country: "GB";
	postcode: string;
}

export function parseShippingDestination(
	country: unknown,
	postcode: unknown,
): ShippingDestination | undefined {
	if (
		typeof country !== "string" ||
		country.trim().toUpperCase() !== "GB" ||
		typeof postcode !== "string" ||
		postcode.trim().length === 0 ||
		postcode.trim().length > 10 ||
		!/^[a-z0-9 ]+$/i.test(postcode.trim())
	) {
		return undefined;
	}
	return {
		country: "GB",
		postcode: postcode.trim().toUpperCase(),
	};
}
