import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { CartClient } from "../src/clients/cartClient";
import { ProductClient } from "../src/clients/productClient";
import { CartService } from "../src/services/cartService";
import { ProductService } from "../src/services/productService";

const backendUrl = process.env.CART_INTEGRATION_BACKEND_URL;
const cartPath = "/cart";

describe.skipIf(!backendUrl)("real frontend/backend cart integration", () => {
	it("renders catalogue products, persists a browser cart, updates totals and removes items", async () => {
		if (!backendUrl)
			throw new Error("CART_INTEGRATION_BACKEND_URL is required");
		const app = createApp(
			new ProductService(new ProductClient(backendUrl)),
			new CartService(new CartClient(backendUrl)),
		);
		const customer = request.agent(app);
		const otherCustomer = request.agent(app);
		const cueId = "pro-series-maple-cue";
		const caseId = "hard-shell-cue-case";
		const productIds = [cueId, caseId];

		const empty = await customer.get("/cart");
		expect(empty.status).toBe(200);
		expect(empty.text).toContain("Enter your UK delivery address");
		expect(empty.headers["set-cookie"][0]).toContain("cue_cart=");

		try {
			await customer
				.post("/cart/delivery-address")
				.type("form")
				.send({
					fullName: "Ada Lovelace",
					addressLine1: "1 Example Street",
					city: "London",
					postcode: "SW1A 1AA",
				})
				.expect(303);
			const shop = await customer.get("/shop");
			expect(shop.status).toBe(200);
			expect(shop.text).toContain(`name="productId" value="${cueId}"`);
			expect(shop.text).toContain(`name="productId" value="${caseId}"`);

			for (const productId of productIds) {
				await customer
					.post("/cart/items/add")
					.type("form")
					.send({ productId, quantity: "1" })
					.expect(303);
			}
			await customer
				.post("/cart/items/add")
				.type("form")
				.send({ productId: cueId, quantity: "1" })
				.expect(303);

			const cart = await customer.get(cartPath);
			expect(cart.status).toBe(200);
			expect(cart.text).toContain("Pro Series Maple Cue");
			expect(cart.text).toContain("Hard Shell Cue Case");
			expect(cart.text).toContain("£89.99 each");
			expect(cart.text).toContain("£179.98");
			expect(cart.text).toContain("£229.97");
			expect(cart.text).toContain("Estimated shipping");
			expect(cart.text).toContain("Estimated total");
			expect(cart.text).toContain("Cart, 3 items");

			const isolated = await otherCustomer.get("/cart");
			expect(isolated.status).toBe(200);
			expect(isolated.text).toContain("Enter your UK delivery address");
			await otherCustomer
				.post("/cart/delivery-address")
				.type("form")
				.send({
					fullName: "Grace Hopper",
					addressLine1: "2 Example Street",
					city: "London",
					postcode: "SW1A 1AA",
				})
				.expect(303);
			expect((await otherCustomer.get(cartPath)).text).toContain(
				"Your cart is empty",
			);
			await otherCustomer
				.post("/cart/items/update")
				.type("form")
				.send({ productId: cueId, quantity: "9" })
				.expect(404);
			await otherCustomer
				.post("/cart/items/remove")
				.type("form")
				.send({ productId: cueId })
				.expect(303);

			const unchanged = await customer.get(cartPath);
			expect(unchanged.text).toContain("£229.97");
			expect(unchanged.text).toContain("£0.00");
			await customer
				.post("/cart/items/update")
				.type("form")
				.send({ productId: cueId, quantity: "3" })
				.expect(303);
			const updated = await customer.get(cartPath);
			expect(updated.status).toBe(200);
			expect(updated.text).toContain("£269.97");
			expect(updated.text).toContain("£319.96");
			expect(updated.text).toContain("£0.00");
			expect(updated.text).toContain("Estimated shipping");
			expect(updated.text).toContain("Estimated total");
			expect(updated.text).toContain('value="3"');
			expect(updated.text).toContain("Cart, 4 items");

			for (const path of ["/", "/shop"]) {
				const page = await customer.get(
					path,
				);
				expect(page.status).toBe(200);
				expect(page.text).toContain("Cart, 4 items");
			}

			await customer
				.post("/cart/items/remove")
				.type("form")
				.send({ productId: cueId })
				.expect(303);
			const remaining = await customer.get(cartPath);
			expect(remaining.text).not.toContain("Pro Series Maple Cue");
			expect(remaining.text).toContain("£49.99");
			expect(remaining.text).toContain("£4.40");
			await customer
				.post("/cart/items/remove")
				.type("form")
				.send({ productId: caseId })
				.expect(303);
			const removedLast = await customer.get(cartPath);
			expect(removedLast.status).toBe(200);
			expect(removedLast.text).toContain("Your cart is empty");
			expect(removedLast.text).toContain("Cart, 0 items");
		} finally {
			for (const productId of productIds) {
				await customer
					.post("/cart/items/remove")
					.type("form")
					.send({ productId })
					.expect(303);
			}
		}
	});
});
