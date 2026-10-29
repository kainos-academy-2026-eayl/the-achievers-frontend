import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { CartApiError, CartClient } from "../src/clients/cartClient";
import { CartService } from "../src/services/cartService";
import { ProductService } from "../src/services/productService";

const cue = {
    id: "cue-1",
    name: "Maple Cue",
    price: 89.99,
    description: "A balanced cue.",
    category: "Cues",
};
const chalk = { ...cue, id: "chalk-1", name: "Chalk", price: 0.1 };

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
        get: vi.fn(async (id: string) => {
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
                // Stands in for the backend's shipping rule: £4.99, free over £50.
                estimatedShippingCost:
                    cartItems.length === 0 || subtotalPence > 5_000 ? 0 : 4.99,
            };
        }),
        add: vi.fn(async (id: string, productId: string, quantity: number) => {
            const cart = items(id);
            cart.set(productId, (cart.get(productId) ?? 0) + quantity);
        }),
        update: vi.fn(async (id: string, productId: string, quantity: number) => {
            items(id).set(productId, quantity);
        }),
        remove: vi.fn(async (id: string, productId: string) => {
            items(id).delete(productId);
        }),
    };
    const app = createApp(
        new ProductService({ getAll: async () => [cue, chalk] }),
        new CartService(client),
    );
    return { app, client, customer: request.agent(app) };
}

function serviceWith(data: unknown) {
    return new CartService({
        get: async () => data,
        add: async () => { },
        update: async () => { },
        remove: async () => { },
    });
}

afterEach(() => vi.restoreAllMocks());

describe("Shopping cart journeys", () => {
    it("shows add to cart forms on Home and Shop", async () => {
        const { customer } = setup();
        for (const path of ["/", "/shop"]) {
            const response = await customer.get(path);
            expect(response.status).toBe(200);
            expect(response.text).toContain('action="/cart/items/add"');
        }
    });

    it("loads an empty cart and sets a cart cookie", async () => {
        const { customer } = setup();
        const response = await customer.get("/cart");
        expect(response.status).toBe(200);
        expect(response.text).toContain("Your cart is empty");
        expect(response.text).not.toContain("Standard shipping");
        expect(response.headers["set-cookie"][0]).toMatch(
            /cue_cart=.+;.*HttpOnly; SameSite=Lax/,
        );
        expect(response.headers["cache-control"]).toBe("no-store");
    });

    it("adds products, updates quantities and recalculates totals with free shipping", async () => {
        const { customer, client } = setup();
        await customer
            .post("/cart/items/add")
            .type("form")
            .send({ productId: cue.id, quantity: "2" })
            .expect(303)
            .expect("Location", "/cart?notice=added");
        await customer
            .post("/cart/items/add")
            .type("form")
            .send({ productId: chalk.id, quantity: "3" })
            .expect(303);
        const cart = await customer.get("/cart");
        expect(cart.text).toContain("Maple Cue");
        expect(cart.text).toContain("Chalk");
        expect(cart.text).toContain("£89.99 each");
        expect(cart.text).toContain("£179.98");
        expect(cart.text).toContain("£0.30");
        expect(cart.text).toContain("<span>Shipping</span><strong>Free</strong>");
        expect(cart.text).toContain("<span>Total</span><strong>£180.28</strong>");
        expect(cart.text).toContain("Cart, 5 items");
        expect(cart.text).toContain('value="2"');

        await customer
            .post("/cart/items/update")
            .type("form")
            .send({ productId: cue.id, quantity: "1" })
            .expect(303);
        const updated = await customer.get("/cart?notice=updated");
        expect(updated.text).toContain("Quantity updated.");
        expect(updated.text).toContain("£90.29");
        expect(updated.text).toContain("Cart, 4 items");
        expect(client.update).toHaveBeenCalledWith(expect.any(String), cue.id, 1);
    });

    it("charges £4.99 standard shipping below the free shipping threshold", async () => {
        const { customer } = setup();
        await customer
            .post("/cart/items/add")
            .type("form")
            .send({ productId: chalk.id, quantity: "1" });
        const cart = await customer.get("/cart");
        expect(cart.text).toContain("<span>Shipping</span><strong>£4.99</strong>");
        expect(cart.text).toContain("<span>Total</span><strong>£5.09</strong>");
    });

    it("removes products including the last item", async () => {
        const { customer } = setup();
        for (const productId of [cue.id, chalk.id]) {
            await customer
                .post("/cart/items/add")
                .type("form")
                .send({ productId, quantity: "1" });
        }
        await customer
            .post("/cart/items/remove")
            .type("form")
            .send({ productId: cue.id })
            .expect(303);
        const remaining = await customer.get("/cart");
        expect(remaining.text).not.toContain("Maple Cue");
        expect(remaining.text).toContain("£4.99");
        expect(remaining.text).toContain("£5.09");
        await customer
            .post("/cart/items/remove")
            .type("form")
            .send({ productId: chalk.id })
            .expect(303);
        const empty = await customer.get("/cart");
        expect(empty.text).toContain("Your cart is empty");
        expect(empty.text).toContain("Cart, 0 items");
    });

    it("keeps carts separate between customers and reuses the cookie", async () => {
        const { app, customer, client } = setup();
        await customer
            .post("/cart/items/add")
            .type("form")
            .send({ productId: cue.id, quantity: "1" });
        const otherCustomer = request.agent(app);
        const first = await customer.get("/cart");
        const second = await otherCustomer.get("/cart");
        expect(first.text).toContain("Maple Cue");
        expect(second.text).toContain("Your cart is empty");
        expect(client.get.mock.calls[0]?.[0]).toBe(client.add.mock.calls[0]?.[0]);
        expect(client.get.mock.calls[1]?.[0]).not.toBe(
            client.add.mock.calls[0]?.[0],
        );
    });

    it("shows the current header badge on Home and Shop", async () => {
        const { customer } = setup();
        await customer
            .post("/cart/items/add")
            .type("form")
            .send({ productId: cue.id, quantity: "2" });
        for (const path of ["/", "/shop"]) {
            const page = await customer.get(path);
            expect(page.status).toBe(200);
            expect(page.text).toContain("Cart, 2 items");
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
            const result = await customer
                .post("/cart/items/update")
                .type("form")
                .send({ productId: cue.id, quantity });
            expect(result.status).toBe(400);
            expect(result.text).toContain("whole-number quantity");
            expect(client.update).not.toHaveBeenCalled();
        },
    );

    it("allows the backend's maximum quantity and advertises it in the form", async () => {
        const { customer, client } = setup();
        await customer
            .post("/cart/items/add")
            .type("form")
            .send({ productId: cue.id, quantity: "2147483647" })
            .expect(303);
        expect(client.add).toHaveBeenCalledWith(
            expect.any(String),
            cue.id,
            2147483647,
        );
        const response = await customer.get("/cart");
        expect(response.status).toBe(200);
        expect(response.text).toContain('max="2147483647"');
    });

    it("rejects missing product IDs", async () => {
        const { customer, client } = setup();
        await customer
            .post("/cart/items/add")
            .type("form")
            .send({ quantity: "1" })
            .expect(400);
        expect(client.add).not.toHaveBeenCalled();
    });

    it("shows backend errors instead of an empty cart or success", async () => {
        const { customer, client } = setup();
        vi.spyOn(console, "error").mockImplementation(() => { });
        client.get.mockRejectedValue(new Error("offline"));
        const response = await customer.get("/cart");
        expect(response.status).toBe(502);
        expect(response.text).toContain("We can't load your cart");
        expect(response.text).not.toContain("Your cart is empty");
        expect(response.text).toContain("item count unavailable");
    });

    it.each([400, 404, 409, 500])(
        "shows a failed mutation with status %s",
        async (status) => {
            const { customer, client } = setup();
            vi.spyOn(console, "error").mockImplementation(() => { });
            client.add.mockRejectedValue(new CartApiError(status));
            const response = await customer
                .post("/cart/items/add")
                .type("form")
                .send({ productId: cue.id, quantity: "1" });
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
        await customer.get("/cart");
        vi.spyOn(console, "error").mockImplementation(() => { });
        client.get.mockRejectedValue(new Error("offline"));
        const response = await customer.get("/");
        expect(response.status).toBe(200);
        expect(response.text).toContain("item count unavailable");
        expect(response.text).not.toContain("Cart, 0 items");
    });

    it("escapes backend product content", async () => {
        const app = createApp(
            undefined,
            serviceWith({
                estimatedShippingCost: 4.99,
                items: [
                    {
                        product: { ...cue, name: "<script>alert(1)</script>" },
                        quantity: 1,
                    },
                ],
            }),
        );
        const response = await request.agent(app).get("/cart");
        expect(response.text).not.toContain("<script>");
        expect(response.text).toContain("&lt;script&gt;");
    });

    it("replaces malformed cart cookies", async () => {
        const { customer, client } = setup();
        const response = await customer
            .get("/cart")
            .set("Cookie", "cue_cart=invalid")
            .expect(200);
        expect(response.headers["set-cookie"].join(";")).toContain("cue_cart=");
        expect(client.get).toHaveBeenCalledWith(
            expect.stringMatching(/^[0-9a-f-]{36}$/),
        );
    });
});

describe("Shipping from the backend", () => {
    function cartWith(estimatedShippingCost: unknown) {
        return {
            items: [{ product: { ...cue, price: 10 }, quantity: 1 }],
            estimatedShippingCost,
        };
    }

    it.each([
        [4.99, "£4.99", "£14.99"],
        [0, "Free", "£10.00"],
        [7.5, "£7.50", "£17.50"],
    ])(
        "displays the backend shipping cost %s as %s with a total of %s",
        async (shippingCost, shipping, grandTotal) => {
            const cart = await serviceWith(cartWith(shippingCost)).get(randomUUID());
            expect(cart.shipping).toBe(shipping);
            expect(cart.grandTotal).toBe(grandTotal);
        },
    );

    it.each([undefined, null, "4.99", -0.01, 1.005, Number.MAX_SAFE_INTEGER])(
        "rejects invalid backend shipping cost %#",
        async (shippingCost) => {
            await expect(
                serviceWith(cartWith(shippingCost)).get(randomUUID()),
            ).rejects.toThrow();
        },
    );
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
        await expect(
            serviceWith(data && { estimatedShippingCost: 4.99, ...data }).get(
                randomUUID(),
            ),
        ).rejects.toThrow();
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
        expect(await client.get(cartId)).toEqual({
            items: [],
            estimatedShippingCost: 0,
        });
        await client.add(cartId, "cue/1", 2);
        await client.update(cartId, "cue/1", 3);
        await client.remove(cartId, "cue/1");
        const expected = [
            ["GET", "/api/cart", undefined],
            [
                "POST",
                "/api/cart/items",
                JSON.stringify({ productId: "cue/1", quantity: 2 }),
            ],
            ["PATCH", "/api/cart/items/cue%2F1", JSON.stringify({ quantity: 3 })],
            ["DELETE", "/api/cart/items/cue%2F1", undefined],
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
        await new CartClient("http://localhost:3000").get(randomUUID());
        expect(timeout).toHaveBeenCalledWith(5000);
    });

    it("propagates HTTP failures and transport timeouts", async () => {
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(new Response(null, { status: 409 }));
        const client = new CartClient("http://localhost:3000");
        await expect(client.add(randomUUID(), cue.id, 1)).rejects.toMatchObject({
            status: 409,
        });
        fetchSpy.mockRejectedValue(new DOMException("Timed out", "TimeoutError"));
        await expect(client.get(randomUUID())).rejects.toThrow("Timed out");
    });
});
