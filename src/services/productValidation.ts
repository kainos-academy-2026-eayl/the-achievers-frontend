export const PRODUCT_FIELDS = [
	"name",
	"description",
	"category",
	"price",
] as const;
export type ProductField = (typeof PRODUCT_FIELDS)[number];
export type ProductInput = Record<ProductField, string>;
export type ProductFieldErrors = Partial<Record<ProductField, string>>;

export function validateProductInput(body: unknown): {
	values: ProductInput;
	fieldErrors: ProductFieldErrors;
} {
	const fields =
		typeof body === "object" && body !== null && !Array.isArray(body)
			? (body as Record<string, unknown>)
			: {};
	const read = (field: ProductField) =>
		typeof fields[field] === "string" ? fields[field].trim() : "";
	const values: ProductInput = {
		name: read("name"),
		description: read("description"),
		category: read("category"),
		price: read("price"),
	};
	const fieldErrors: ProductFieldErrors = {};
	for (const [field, label, maxLength] of [
		["name", "Name", 200],
		["description", "Description", 2000],
		["category", "Category", 100],
	] as const) {
		if (!values[field]) {
			fieldErrors[field] = `${label} is required`;
		} else if (values[field].length > maxLength) {
			fieldErrors[field] =
				`${label} must be no more than ${maxLength} characters`;
		}
	}
	if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(values.price)) {
		fieldErrors.price =
			"Enter a price in pounds with at most two decimal places";
	} else {
		const [pounds = "", pence = ""] = values.price.split(".");
		const pricePence = Number(pounds) * 100 + Number(pence.padEnd(2, "0"));
		if (pricePence > 2147483647) {
			fieldErrors.price = "Price must be between £0.00 and £21,474,836.47";
		}
	}
	return { values, fieldErrors };
}
