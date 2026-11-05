import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { CartApiError } from "../src/clients/cartClient";
import { OrderApiError } from "../src/clients/orderClient";
import { ReviewApiError } from "../src/clients/reviewClient";
import type { ProductViewModel } from "../src/models/productViewModel";
import type { OrderViewModel } from "../src/services/orderService";

const accessToken = `header.${Buffer.from(
	JSON.stringify({
		sub: "1",
		iss: "the-achievers-backend",
		aud: "the-achievers-api",
		role: "user",
		exp: Math.floor(Date.now() / 1000) + 3600,
	}),
).toString("base64url")}.test-signature`;

const orderId = "0b6f6c7e-2b1a-4c1e-9a6e-1f2d3c4b5a69";

function makeOrder(overrides: Partial<OrderViewModel> = {}): OrderViewModel {
	return {
		id: orderId,
		reference: "ORD-ABC234",
		status: "delivered",
		items: [
			{
				productId: "cue-1",
				name: "Maple Cue",
				price: "£10.00",
				quantity: 2,
				subtotal: "£20.00",
			},
			{
				productId: "chalk-1",
				name: "Blue Chalk",
				price: "£2.00",
				quantity: 1,
				subtotal: "£2.00",
			},
		],
		subtotal: "£22.00",
		shipping: "£4.99",
		total: "£26.99",
		shippingAddress: {
			addressLine1: "1 Cue Street",
			addressLine2: "",
			city: "Belfast",
			postcode: "BT1 1AA",
		},
		createdAt: "2026-10-29T12:00:00.000Z",
		...overrides,
	};
}

function product(id: string, inStock: boolean): ProductViewModel {
	return {
		id,
		name: id,
		description: "desc",
		category: "Cues",
		price: "£10.00",
		inStock,
		rating: null,
		ratingPercent: 0,
		reviewCount: 0,
	};
}

function setup() {
	const cart = {
		get: vi.fn(async () => ({
			items: [],
			count: 0,
			total: "£0.00",
			shipping: "£0.00",
			grandTotal: "£0.00",
		})),
		add: vi.fn(async () => {}),
		update: vi.fn(async () => {}),
		remove: vi.fn(async () => {}),
	};
	const profiles = {
		get: vi.fn(),
		update: vi.fn(),
	};
	const orders = {
		checkout: vi.fn(),
		get: vi.fn(async () => makeOrder()),
		list: vi.fn(async () => [makeOrder()]),
	};
	const products = {
		getAll: vi.fn(async () => [
			product("cue-1", true),
			product("chalk-1", true),
		]),
	};
	const reviews = {
		listMine: vi.fn(
			async () =>
				[] as {
					id: number;
					productId: string;
					orderId: string;
					rating: number;
					comment: string;
				}[],
		),
		save: vi.fn(async () => {}),
	};
	const app = createApp(
		products,
		cart,
		profiles,
		orders,
		undefined,
		undefined,
		undefined,
		reviews,
	);
	return { agent: request.agent(app), cart, orders, products, reviews };
}

async function logIn(agent: ReturnType<typeof request.agent>) {
	vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
		new Response(
			JSON.stringify({
				accessToken,
				tokenType: "Bearer",
				expiresIn: 3600,
				user: {
					email: "customer@example.com",
					name: "Customer",
					createdAt: "2026-01-01T00:00:00.000Z",
				},
			}),
			{ status: 200, headers: { "Content-Type": "application/json" } },
		),
	);
	await agent
		.post("/login")
		.type("form")
		.send({ email: "customer@example.com", password: "LongEnoughPassword123" })
		.expect(303);
}

async function postForm(
	agent: ReturnType<typeof request.agent>,
	path: string,
	body: Record<string, string> = {},
) {
	const page = await agent.get("/orders");
	const csrfToken = /name="csrfToken" value="([0-9a-f]{64})"/.exec(
		page.text,
	)?.[1];
	expect(csrfToken).toBeDefined();
	return agent
		.post(path)
		.type("form")
		.send({ ...body, csrfToken });
}

afterEach(() => vi.restoreAllMocks());

describe("Order history", () => {
	it.each([
		["get", "/orders"],
		["post", `/orders/${orderId}/buy-again`],
		["post", `/orders/${orderId}/reviews/cue-1`],
	] as const)(
		"requires a logged-in customer for %s %s",
		async (method, path) => {
			const { agent, orders, reviews } = setup();
			const response = await agent[method](path);

			expect(response.status).toBe(303);
			expect(response.headers.location).toBe("/login");
			expect(orders.list).not.toHaveBeenCalled();
			expect(orders.get).not.toHaveBeenCalled();
			expect(reviews.save).not.toHaveBeenCalled();
		},
	);

	it("lists the customer's orders with details and status badge", async () => {
		const { agent, orders } = setup();
		await logIn(agent);

		const response = await agent.get("/orders");

		expect(response.status).toBe(200);
		expect(orders.list).toHaveBeenCalledWith(accessToken);
		expect(response.text).toContain("ORD-ABC234");
		expect(response.text).toContain("29 October 2026");
		expect(response.text).toContain("£26.99");
		expect(response.text).toContain("Maple Cue");
		expect(response.text).toContain("Quantity: 2");
		expect(response.text).toContain('src="/css/images/cc-icon.png"');
		expect(response.text).toContain(
			'class="status-badge status-delivered">Delivered',
		);
		expect(response.text).toContain("Buy Again");
		expect(response.headers["cache-control"]).toBe("no-store");
	});

	it.each([
		["placed", "Placed"],
		["processing", "Processing"],
		["delivered", "Delivered"],
		["cancelled", "Cancelled"],
	])("shows the %s status badge", async (status, label) => {
		const { agent, orders } = setup();
		orders.list.mockResolvedValueOnce([makeOrder({ status })]);
		await logIn(agent);

		const response = await agent.get("/orders");

		expect(response.text).toContain(
			`class="status-badge status-${status}">${label}`,
		);
	});

	it("shows an empty state when there are no orders", async () => {
		const { agent, orders, reviews } = setup();
		orders.list.mockResolvedValueOnce([]);
		await logIn(agent);

		const response = await agent.get("/orders");

		expect(response.status).toBe(200);
		expect(response.text).toContain("You haven't placed any orders yet");
		expect(reviews.listMine).not.toHaveBeenCalled();
	});

	it("shows a load error when orders cannot be fetched", async () => {
		const { agent, orders } = setup();
		orders.list.mockRejectedValueOnce(new Error("down"));
		await logIn(agent);

		const response = await agent.get("/orders");

		expect(response.status).toBe(502);
		expect(response.text).toContain("We can't load your orders right now");
	});
});

describe("Buy again", () => {
	it("adds every product to the cart and redirects to the basket", async () => {
		const { agent, cart, orders } = setup();
		await logIn(agent);

		const response = await postForm(agent, `/orders/${orderId}/buy-again`);

		expect(response.status).toBe(303);
		expect(orders.get).toHaveBeenCalledWith(accessToken, orderId);
		expect(cart.add).toHaveBeenCalledWith(expect.any(String), "cue-1", 2);
		expect(cart.add).toHaveBeenCalledWith(expect.any(String), "chalk-1", 1);
		expect(response.headers.location).toBe("/cart?notice=reordered");
	});

	it("adds only available products and explains the rest are unavailable", async () => {
		const { agent, cart, products } = setup();
		products.getAll.mockResolvedValueOnce([
			product("cue-1", true),
			product("chalk-1", false),
		]);
		await logIn(agent);

		const response = await postForm(agent, `/orders/${orderId}/buy-again`);

		expect(response.status).toBe(303);
		expect(cart.add).toHaveBeenCalledOnce();
		expect(cart.add).toHaveBeenCalledWith(expect.any(String), "cue-1", 2);
		expect(response.headers.location).toBe("/cart?notice=partial");

		const basket = await agent.get(response.headers.location);
		expect(basket.text).toContain(
			"Some products from this order are no longer available.",
		);
	});

	it("treats products rejected by the cart as unavailable", async () => {
		const { agent, cart } = setup();
		cart.add.mockRejectedValueOnce(new CartApiError(409));
		await logIn(agent);

		const response = await postForm(agent, `/orders/${orderId}/buy-again`);

		expect(response.status).toBe(303);
		expect(response.headers.location).toBe("/cart?notice=partial");
	});

	it("stays on order history when nothing can be added", async () => {
		const { agent, cart, products, orders } = setup();
		products.getAll.mockResolvedValueOnce([product("cue-1", false)]);
		orders.get.mockResolvedValueOnce(
			makeOrder({
				items: [
					...makeOrder().items,
					{
						productId: null,
						name: "Deleted",
						price: "£1.00",
						quantity: 1,
						subtotal: "£1.00",
					},
				],
			}),
		);
		await logIn(agent);

		const response = await postForm(agent, `/orders/${orderId}/buy-again`);

		expect(response.status).toBe(303);
		expect(cart.add).not.toHaveBeenCalled();
		expect(response.headers.location).toBe("/orders?notice=unavailable");

		const history = await agent.get(response.headers.location);
		expect(history.text).toContain(
			"All products from this order are currently unavailable.",
		);
	});

	it("does not reorder another customer's order", async () => {
		const { agent, cart, orders } = setup();
		orders.get.mockRejectedValueOnce(new OrderApiError(404, "Order not found"));
		await logIn(agent);

		const response = await postForm(agent, `/orders/${orderId}/buy-again`);

		expect(response.status).toBe(404);
		expect(response.text).toContain(
			"We couldn&#39;t find that order on your account.",
		);
		expect(cart.add).not.toHaveBeenCalled();
	});
});

describe("Reviews", () => {
	it("shows a review form only for delivered orders", async () => {
		const { agent, orders } = setup();
		orders.list.mockResolvedValueOnce([
			makeOrder(),
			makeOrder({
				id: "other-order",
				reference: "ORD-PLACED",
				status: "placed",
			}),
		]);
		await logIn(agent);

		const response = await agent.get("/orders");

		expect(response.text).toContain(
			`action="/orders/${orderId}/reviews/cue-1"`,
		);
		expect(response.text).not.toContain('action="/orders/other-order/reviews/');
		expect(response.text).toContain("Leave a Review");
	});

	it("pre-populates an existing review", async () => {
		const { agent, reviews } = setup();
		reviews.listMine.mockResolvedValueOnce([
			{ id: 1, productId: "cue-1", orderId, rating: 4, comment: "Great cue" },
		]);
		await logIn(agent);

		const response = await agent.get("/orders");

		expect(response.text).toContain("Edit your review");
		expect(response.text).toContain("Great cue");
		expect(response.text).toMatch(/value="4" checked/);
	});

	it("still shows review forms when existing reviews cannot be loaded", async () => {
		const { agent, reviews } = setup();
		reviews.listMine.mockRejectedValueOnce(
			new ReviewApiError(404, "Not found"),
		);
		await logIn(agent);

		const response = await agent.get("/orders");

		expect(response.status).toBe(200);
		expect(response.text).toContain("We couldn't load your existing reviews");
		expect(response.text).toContain(
			`action="/orders/${orderId}/reviews/cue-1"`,
		);
	});

	it("shows a save error when the review service is unavailable", async () => {
		const { agent, reviews } = setup();
		reviews.save.mockRejectedValueOnce(new ReviewApiError(404, "Not found"));
		await logIn(agent);

		const response = await postForm(agent, `/orders/${orderId}/reviews/cue-1`, {
			rating: "4",
			comment: "Keep me",
		});

		expect(response.status).toBe(502);
		expect(response.text).toContain(
			"We couldn&#39;t save your review. Please try again.",
		);
		expect(response.text).toContain("Keep me");
	});

	it("saves a review for a purchased product on a delivered order", async () => {
		const { agent, reviews } = setup();
		await logIn(agent);

		const response = await postForm(agent, `/orders/${orderId}/reviews/cue-1`, {
			rating: "5",
			comment: "  Brilliant  ",
		});

		expect(response.status).toBe(303);
		expect(reviews.save).toHaveBeenCalledWith(
			accessToken,
			"cue-1",
			orderId,
			5,
			"Brilliant",
		);
		expect(response.headers.location).toBe(
			`/orders?notice=review-saved#order-${orderId}`,
		);
	});

	it.each([["0"], ["6"], [""], ["abc"]])(
		"rejects an invalid rating %j",
		async (rating) => {
			const { agent, reviews } = setup();
			await logIn(agent);

			const response = await postForm(
				agent,
				`/orders/${orderId}/reviews/cue-1`,
				{
					rating,
					comment: "Nice",
				},
			);

			expect(response.status).toBe(400);
			expect(response.text).toContain("Choose a star rating between 1 and 5.");
			expect(reviews.save).not.toHaveBeenCalled();
		},
	);

	it("rejects a review comment that is too long", async () => {
		const { agent, reviews } = setup();
		await logIn(agent);

		const response = await postForm(agent, `/orders/${orderId}/reviews/cue-1`, {
			rating: "3",
			comment: "a".repeat(1001),
		});

		expect(response.status).toBe(400);
		expect(reviews.save).not.toHaveBeenCalled();
	});

	it.each([
		[
			"an order that is not delivered",
			makeOrder({ status: "processing" }),
			"cue-1",
		],
		["a cancelled order", makeOrder({ status: "cancelled" }), "cue-1"],
		["a product not in the order", makeOrder(), "not-purchased"],
	])("refuses to review %s", async (_label, order, productId) => {
		const { agent, orders, reviews } = setup();
		orders.get.mockResolvedValueOnce(order);
		await logIn(agent);

		const response = await postForm(
			agent,
			`/orders/${orderId}/reviews/${productId}`,
			{
				rating: "4",
			},
		);

		expect(response.status).toBe(403);
		expect(response.text).toContain(
			"You can only review products from your delivered orders.",
		);
		expect(reviews.save).not.toHaveBeenCalled();
	});

	it("refuses to review another customer's order", async () => {
		const { agent, orders, reviews } = setup();
		orders.get.mockRejectedValueOnce(new OrderApiError(404, "Order not found"));
		await logIn(agent);

		const response = await postForm(agent, `/orders/${orderId}/reviews/cue-1`, {
			rating: "4",
		});

		expect(response.status).toBe(404);
		expect(reviews.save).not.toHaveBeenCalled();
	});

	it("shows the backend's ownership rejection", async () => {
		const { agent, reviews } = setup();
		reviews.save.mockRejectedValueOnce(new ReviewApiError(403, "Forbidden"));
		await logIn(agent);

		const response = await postForm(agent, `/orders/${orderId}/reviews/cue-1`, {
			rating: "4",
			comment: "Mine",
		});

		expect(response.status).toBe(403);
		expect(response.text).toContain(
			"You can only review products from your delivered orders.",
		);
		expect(response.text).toContain("Mine");
	});
});

describe("CSRF protection", () => {
	it.each([
		["missing", {}],
		["wrong", { csrfToken: "a".repeat(64) }],
	])("rejects buy again with a %s token", async (_label, body) => {
		const { agent, cart, orders } = setup();
		await logIn(agent);
		await agent.get("/orders");

		const response = await agent
			.post(`/orders/${orderId}/buy-again`)
			.type("form")
			.send(body);

		expect(response.status).toBe(403);
		expect(response.text).toContain(
			"Your session has changed. Please try again.",
		);
		expect(orders.get).not.toHaveBeenCalled();
		expect(cart.add).not.toHaveBeenCalled();
	});

	it("rejects a review without a valid token", async () => {
		const { agent, reviews } = setup();
		await logIn(agent);
		await agent.get("/orders");

		const response = await agent
			.post(`/orders/${orderId}/reviews/cue-1`)
			.type("form")
			.send({ rating: "5", csrfToken: "a".repeat(64) });

		expect(response.status).toBe(403);
		expect(reviews.save).not.toHaveBeenCalled();
	});
});

describe("Order history entry points", () => {
	it("shows View All Orders on the order confirmation page", async () => {
		const { agent } = setup();
		await logIn(agent);

		const response = await agent.get(`/orders/${orderId}`);

		expect(response.status).toBe(200);
		expect(response.text).toContain('href="/orders">View All Orders');
	});
});
