export const PRODUCT_FIELDS = [
	"name",
	"description",
	"category",
	"price",
] as const;
export type ProductField = (typeof PRODUCT_FIELDS)[number];
export type ProductInput = Record<ProductField, string>;
export type ProductFieldErrors = Partial<Record<ProductField, string>>;
export const PRODUCT_EDIT_FIELDS = [...PRODUCT_FIELDS, "stock"] as const;
export type ProductEditInput = ProductInput & { stock: string };
export type ProductEditFieldErrors = Partial<
	Record<(typeof PRODUCT_EDIT_FIELDS)[number], string>
>;

export function validateProductEditInput(body: unknown): {
	values: ProductEditInput;
	fieldErrors: ProductEditFieldErrors;
} {
	const { values, fieldErrors } = validateProductInput(body);
	const stock =
		typeof body === "object" &&
		body !== null &&
		"stock" in body &&
		typeof body.stock === "string"
			? body.stock.trim()
			: "";
	const errors: ProductEditFieldErrors = { ...fieldErrors };
	if (!/^\d+$/.test(stock) || Number(stock) > 2147483647) {
		errors.stock = "Enter a whole stock quantity between 0 and 2,147,483,647";
	}
	return { values: { ...values, stock }, fieldErrors: errors };
}

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
