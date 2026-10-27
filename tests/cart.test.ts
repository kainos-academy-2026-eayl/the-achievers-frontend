import { randomUUID } from "node:crypto";
import request, { type SuperAgentTest } from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { CartApiError, CartClient } from "../src/clients/cartClient";
import { CartService } from "../src/services/cartService";
import { ProductService } from "../src/services/productService";
import type { ShippingDestination } from "../src/models/shippingDestination";

const cue = {
	id: "cue-1",
	name: "Maple Cue",
	price: 89.99,
	description: "A balanced cue.",
	category: "Cues",
};
const chalk = { ...cue, id: "chalk-1", name: "Chalk", price: 0.1 };
const destination: ShippingDestination = {
	country: "GB",
	postcode: "SW1A 1AA",
};
const cartPath = `/cart?country=GB&postcode=${encodeURIComponent(destination.postcode)}`;

function cartAction(fields: Record<string, string>) {
	return { ...fields, ...destination };
}

async function provideAddress(customer: SuperAgentTest): Promise<void> {
	const response = await customer
		.post("/cart/delivery-address")
		.type("form")
		.send({
			fullName: "Ada Lovelace",
			addressLine1: "1 Example Street",
			city: "London",
			postcode: destination.postcode,
		});
	expect(response.status).toBe(303);
	expect(response.headers.location).toBe(
		"/cart?country=GB&postcode=SW1A+1AA&notice=address-saved",
	);
}

function setup() {
	const carts = new Map<string, Map<string, number>>();
	function items(id: string) {
		let cart = carts.get(id);
		if (!cart) {
			cart = new Map();
			carts.set(id, cart);
		}
		return cart;
	}
	const client = {
		get: vi.fn(async (id: string, _destination: ShippingDestination) => {
			const cartItems = [...items(id)];
			const subtotalPence = cartItems.reduce(
				(subtotal, [productId, quantity]) =>
					subtotal +
					Math.round((productId === cue.id ? cue.price : chalk.price) * 100) *
						quantity,
				0,
			);
			return {
				items: cartItems.map(([productId, quantity]) => ({
					product: productId === cue.id ? cue : chalk,
					quantity,
				})),
				estimatedShippingCost:
					cartItems.length === 0 || subtotalPence >= 5_000 ? 0 : 4.4,
			};
		}),
		add: vi.fn(
			async (
				id: string,
				productId: string,
				quantity: number,
				_destination: ShippingDestination,
			) => {
				const cart = items(id);
				cart.set(productId, (cart.get(productId) ?? 0) + quantity);
			},
		),
		update: vi.fn(
			async (
				id: string,
				productId: string,
				quantity: number,
				_destination: ShippingDestination,
			) => {
				items(id).set(productId, quantity);
			},
		),
		remove: vi.fn(
			async (
				id: string,
				productId: string,
				_destination: ShippingDestination,
			) => {
				items(id).delete(productId);
			},
		),
	};
	const app = createApp(
		new ProductService({ getAll: async () => [cue, chalk] }),
		new CartService(client),
	);
	return { app, client, customer: request.agent(app) };
}

afterEach(() => vi.restoreAllMocks());

describe("Shopping cart journeys", () => {
	it("does not allow cart mutations from the catalogue before address entry", async () => {
		const { customer, client } = setup();
		for (const path of ["/", "/shop"]) {
			const response = await customer.get(path);
			expect(response.status).toBe(200);
			expect(response.text).toContain(
				"Enter your UK delivery address before adding to cart",
			);
			expect(response.text).not.toContain('action="/cart/items/add"');
		}
		expect(client.get).not.toHaveBeenCalled();
		expect(client.add).not.toHaveBeenCalled();
	});

	it("requires a UK address before displaying or changing the cart", async () => {
		const { customer } = setup();
		const response = await customer.get("/cart");
		expect(response.status).toBe(200);
		expect(response.text).toContain("Enter your UK delivery address");
		expect(response.text).toContain('name="addressLine1"');
		expect(response.text).not.toContain("Your cart is empty");
		expect(response.headers["set-cookie"][0]).toMatch(
			/cue_cart=.+;.*HttpOnly; SameSite=Lax/,
		);
		expect(response.headers["cache-control"]).toBe("no-store");
	});

	it("rejects incomplete addresses without requesting the backend", async () => {
		const { customer, client } = setup();
		const response = await customer
			.post("/cart/delivery-address")
			.type("form")
			.send({ fullName: "Ada Lovelace", addressLine1: "1 Example Street" });
		expect(response.status).toBe(400);
		expect(response.text).toContain("Enter your name");
		expect(client.get).not.toHaveBeenCalled();
		expect(client.add).not.toHaveBeenCalled();
	});

	it("requires the destination on cart mutations", async () => {
		const { customer, client } = setup();
		const response = await customer
			.post("/cart/items/add")
			.type("form")
			.send({ productId: cue.id, quantity: "1" });
		expect(response.status).toBe(400);
		expect(response.text).toContain(
			"Enter your UK delivery address before changing your cart",
		);
		expect(client.add).not.toHaveBeenCalled();
	});

	it("loads an empty cart after a valid UK address is entered", async () => {
		const { customer, client } = setup();
		await provideAddress(customer);
		const response = await customer.get(cartPath);
		expect(response.status).toBe(200);
		expect(response.text).toContain("Your cart is empty");
		expect(client.get).toHaveBeenLastCalledWith(
			expect.any(String),
			destination,
		);
	});

	it("adds products, shows details, updates quantities and recalculates totals", async () => {
		const { customer, client } = setup();
		await provideAddress(customer);
		await customer
			.post("/cart/items/add")
			.type("form")
			.send(
				cartAction({
					productId: cue.id,
					quantity: "2",
				}),
			)
			.expect(303)
			.expect("Location", "/cart?country=GB&postcode=SW1A+1AA&notice=added");
		await customer
			.post("/cart/items/add")
			.type("form")
			.send(
				cartAction({
					productId: chalk.id,
					quantity: "3",
				}),
			)
			.expect(303);
		const cart = await customer.get(cartPath);
		expect(cart.text).toContain("Maple Cue");
		expect(cart.text).toContain("Chalk");
		expect(cart.text).toContain("£89.99 each");
		expect(cart.text).toContain("£179.98");
		expect(cart.text).toContain("£0.30");
		expect(cart.text).toContain("£180.28");
		expect(cart.text).toContain("Estimated shipping");
		expect(cart.text).toContain("£0.00");
		expect(cart.text).toContain("Estimated total");
		expect(cart.text).toContain("£180.28");
		expect(cart.text).toContain("Cart, 5 items");
		expect(cart.text).toContain('value="2"');

		await customer
			.post("/cart/items/update")
			.type("form")
			.send(
				cartAction({
					productId: cue.id,
					quantity: "1",
				}),
			)
			.expect(303);
		const updated = await customer.get(`${cartPath}&notice=updated`);
		expect(updated.text).toContain("Quantity updated.");
		expect(updated.text).toContain("£90.29");
		expect(updated.text).toContain("Cart, 4 items");
		expect(client.update).toHaveBeenCalledWith(
			expect.any(String),
			cue.id,
			1,
			destination,
		);
	});

	it("removes products including the last item", async () => {
		const { customer } = setup();
		await provideAddress(customer);
		for (const productId of [cue.id, chalk.id]) {
			await customer
				.post("/cart/items/add")
				.type("form")
				.send(cartAction({ productId, quantity: "1" }));
		}
		await customer
			.post("/cart/items/remove")
			.type("form")
			.send(cartAction({ productId: cue.id }))
			.expect(303);
		const remaining = await customer.get(cartPath);
		expect(remaining.text).not.toContain("Maple Cue");
		expect(remaining.text).toContain("£0.10");
		expect(remaining.text).toContain("£4.40");
		expect(remaining.text).toContain("£4.50");
		await customer
			.post("/cart/items/remove")
			.type("form")
			.send(cartAction({ productId: chalk.id }))
			.expect(303);
		const empty = await customer.get(cartPath);
		expect(empty.text).toContain("Your cart is empty");
		expect(empty.text).toContain("Cart, 0 items");
		expect(empty.text).not.toContain("Estimated shipping");
	});

	it("keeps carts separate between customers and reuses the cookie", async () => {
		const { app, customer, client } = setup();
		await provideAddress(customer);
		await customer
			.post("/cart/items/add")
			.type("form")
			.send(cartAction({ productId: cue.id, quantity: "1" }));
		const otherCustomer = request.agent(app);
		await provideAddress(otherCustomer);
		const first = await customer.get(cartPath);
		const second = await otherCustomer.get(cartPath);
		expect(first.text).toContain("Maple Cue");
		expect(second.text).toContain("Your cart is empty");
		expect(client.get.mock.calls[0]?.[0]).toBe(client.add.mock.calls[0]?.[0]);
		expect(client.get.mock.calls[1]?.[0]).not.toBe(
			client.add.mock.calls[0]?.[0],
		);
	});

	it("connects Home and Shop forms and shows the current header badge on both", async () => {
		const { customer } = setup();
		await provideAddress(customer);
		await customer
			.post("/cart/items/add")
			.type("form")
			.send(cartAction({ productId: cue.id, quantity: "2" }));
		for (const path of ["/", "/shop"]) {
			const page = await customer.get(`${path}?country=GB&postcode=SW1A%201AA`);
			expect(page.status).toBe(200);
			expect(page.text).toContain('action="/cart/items/add"');
			expect(page.text).toContain(`name="productId" value="${cue.id}"`);
			expect(page.text).toContain("Cart, 2 items");
			expect(page.text).toContain("£89.99");
		}
	});

	it.each([
		"0",
		"-1",
		"1.5",
		"abc",
		"",
		"1e2",
		"2147483648",
		"9007199254740992",
	])(
		"rejects invalid quantity %s without changing the backend",
		async (quantity) => {
			const { customer, client } = setup();
			await provideAddress(customer);
			const result = await customer
				.post("/cart/items/update")
				.type("form")
				.send(
					cartAction({
						productId: cue.id,
						quantity,
					}),
				);
			expect(result.status).toBe(400);
			expect(result.text).toContain("whole-number quantity");
			expect(client.update).not.toHaveBeenCalled();
		},
	);

	it("allows the backend's maximum quantity and advertises it in the form", async () => {
		const { customer, client } = setup();
		await provideAddress(customer);
		await customer
			.post("/cart/items/add")
			.type("form")
			.send(cartAction({ productId: cue.id, quantity: "2147483647" }))
			.expect(303);
		expect(client.add).toHaveBeenCalledWith(
			expect.any(String),
			cue.id,
			2147483647,
			destination,
		);
		const response = await customer.get(cartPath);
		expect(response.status).toBe(200);
		expect(response.text).toContain('max="2147483647"');
	});

	it("rejects missing product IDs", async () => {
		const { customer, client } = setup();
		await provideAddress(customer);
		await customer
			.post("/cart/items/add")
			.type("form")
			.send(cartAction({ quantity: "1" }))
			.expect(400);
		expect(client.add).not.toHaveBeenCalled();
	});

	it("shows backend errors instead of an empty cart or success", async () => {
		const { customer, client } = setup();
		await provideAddress(customer);
		vi.spyOn(console, "error").mockImplementation(() => {});
		client.get.mockRejectedValue(new Error("offline"));
		const response = await customer.get(cartPath);
		expect(response.status).toBe(502);
		expect(response.text).toContain("We can't load your cart");
		expect(response.text).not.toContain("Your cart is empty");
		expect(response.text).toContain("item count unavailable");
	});

	it.each([400, 404, 409, 500])(
		"shows a failed mutation with status %s",
		async (status) => {
			const { customer, client } = setup();
			await provideAddress(customer);
			vi.spyOn(console, "error").mockImplementation(() => {});
			client.add.mockRejectedValue(new CartApiError(status));
			const response = await customer
				.post("/cart/items/add")
				.type("form")
				.send(
					cartAction({
						productId: cue.id,
						quantity: "1",
					}),
				);
			expect(response.status).toBe(status === 500 ? 502 : status);
			expect(response.text).not.toContain("Product added to your cart.");
			expect(response.text).toContain(
				status === 500
					? "Check the current cart"
					: "product may be unavailable",
			);
		},
	);

	it("does not hide a cart count failure behind a zero badge", async () => {
		const { customer, client } = setup();
		await provideAddress(customer);
		await customer.get(cartPath);
		vi.spyOn(console, "error").mockImplementation(() => {});
		client.get.mockRejectedValue(new Error("offline"));
		const response = await customer.get("/?country=GB&postcode=SW1A%201AA");
		expect(response.status).toBe(200);
		expect(response.text).toContain("item count unavailable");
		expect(response.text).not.toContain("Cart, 0 items");
	});

	it("escapes backend product content", async () => {
		const app = createApp(
			undefined,
			new CartService({
				get: async () => ({
					estimatedShippingCost: 4.4,
					items: [
						{
							product: { ...cue, name: "<script>alert(1)</script>" },
							quantity: 1,
						},
					],
				}),
				add: async () => {},
				update: async () => {},
				remove: async () => {},
			}),
		);
		const customer = request.agent(app);
		await provideAddress(customer);
		const response = await customer.get(cartPath);
		expect(response.text).not.toContain("<script>");
		expect(response.text).toContain("&lt;script&gt;");
	});

	it("replaces malformed cart cookies", async () => {
		const { app, client } = setup();
		const customer = request.agent(app);
		await provideAddress(customer);
		const response = await customer
			.get(cartPath)
			.set("Cookie", "cue_cart=invalid")
			.expect(200);
		expect(response.headers["set-cookie"].join(";")).toContain("cue_cart=");
		expect(client.get).toHaveBeenCalledWith(
			expect.stringMatching(/^[0-9a-f-]{36}$/),
			destination,
		);
	});
});

describe("Cart response validation", () => {
	it.each([
		null,
		{},
		{ items: [null] },
		{ items: [{ product: cue, quantity: 0 }] },
		{ items: [{ product: cue, quantity: 1.5 }] },
		{ items: [{ product: { ...cue, price: -1 }, quantity: 1 }] },
		{ items: [{ product: { ...cue, price: "89.99" }, quantity: 1 }] },
		{ items: [{ product: { ...cue, price: 0.001 }, quantity: 1 }] },
		{ items: [{ product: { ...cue, name: "" }, quantity: 1 }] },
		{ items: [{ product: cue, quantity: Number.MAX_SAFE_INTEGER }] },
		{
			items: [
				{ product: cue, quantity: 1 },
				{ product: cue, quantity: 1 },
			],
		},
	])("rejects malformed or unsafe cart data %#", async (data) => {
		const service = new CartService({
			get: async () => data,
			add: async () => {},
			update: async () => {},
			remove: async () => {},
		});
		await expect(service.get(randomUUID(), destination)).rejects.toThrow();
	});

	it.each([undefined, null, "4.99", -0.01, 1.005, Number.MAX_SAFE_INTEGER])(
		"rejects invalid shipping estimates %#",
		async (estimatedShippingCost) => {
			const service = new CartService({
				get: async () => ({ items: [], estimatedShippingCost }),
				add: async () => {},
				update: async () => {},
				remove: async () => {},
			});
			await expect(service.get(randomUUID(), destination)).rejects.toThrow();
		},
	);

	it("requires the backend shipping estimate even when the cart is empty", async () => {
		const service = new CartService({
			get: async () => ({ items: [] }),
			add: async () => {},
			update: async () => {},
			remove: async () => {},
		});
		await expect(service.get(randomUUID(), destination)).rejects.toThrow(
			"Invalid cart shipping estimate",
		);
	});
});

describe("Cart backend HTTP contract", () => {
	it("uses the agreed methods, paths, identity header, bodies and a five-second deadline", async () => {
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ items: [], estimatedShippingCost: 0 })),
			)
			.mockResolvedValue(new Response(null, { status: 204 }));
		const client = new CartClient("http://localhost:3000");
		const cartId = randomUUID();
		expect(await client.get(cartId, destination)).toEqual({
			items: [],
			estimatedShippingCost: 0,
		});
		await client.add(cartId, "cue/1", 2, destination);
		await client.update(cartId, "cue/1", 3, destination);
		await client.remove(cartId, "cue/1", destination);
		const expected = [
			["GET", "/api/cart?country=GB&postcode=SW1A+1AA", undefined],
			[
				"POST",
				"/api/cart/items?country=GB&postcode=SW1A+1AA",
				JSON.stringify({ productId: "cue/1", quantity: 2 }),
			],
			[
				"PATCH",
				"/api/cart/items/cue%2F1?country=GB&postcode=SW1A+1AA",
				JSON.stringify({ quantity: 3 }),
			],
			[
				"DELETE",
				"/api/cart/items/cue%2F1?country=GB&postcode=SW1A+1AA",
				undefined,
			],
		];
		for (const [index, [method, path, body]] of expected.entries()) {
			const [url, init] = fetchSpy.mock.calls[index]!;
			expect(String(url)).toBe(`http://localhost:3000${path}`);
			expect(init).toMatchObject({
				method,
				headers: { "X-Cart-Id": cartId, "Content-Type": "application/json" },
			});
			expect(init?.body).toBe(body);
			expect(init?.signal).toBeInstanceOf(AbortSignal);
		}
	});

	it("configures a five-second timeout", async () => {
		const timeout = vi.spyOn(AbortSignal, "timeout");
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response('{"items":[]}'),
		);
		await new CartClient("http://localhost:3000").get(
			randomUUID(),
			destination,
		);
		expect(timeout).toHaveBeenCalledWith(5000);
	});

	it("propagates HTTP failures and transport timeouts", async () => {
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response(null, { status: 409 }));
		const client = new CartClient("http://localhost:3000");
		await expect(
			client.add(randomUUID(), cue.id, 1, destination),
		).rejects.toMatchObject({ status: 409 });
		fetchSpy.mockRejectedValue(new DOMException("Timed out", "TimeoutError"));
		await expect(client.get(randomUUID(), destination)).rejects.toThrow(
			"Timed out",
		);
	});
});
