import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { CartClient } from "../src/clients/cartClient";
import { ProductClient } from "../src/clients/productClient";
import { CartService } from "../src/services/cartService";
import { ProductService } from "../src/services/productService";

// Seeded catalogue products and prices from the real backend.
const cue = "pro-series-maple-cue"; // £89.99
const chalk = "chalk-tip-kit"; // £14.99
const tableCover = "table-cover"; // £34.99
const cueBall = "training-cue-ball"; // £12.99
const cueCase = "hard-shell-cue-case"; // £49.99
const unpricedProduct = "laser-training-aid";

const shippingLine = (amount: string) =>
    `<span>Shipping</span><strong>${amount}</strong>`;
const totalLine = (amount: string) =>
    `<span>Total</span><strong>${amount}</strong>`;

type Shopper = ReturnType<typeof request.agent>;

const backendUrl = process.env.CART_INTEGRATION_BACKEND_URL;

describe.skipIf(!backendUrl)("Shopping cart with the real backend", () => {
    const url = backendUrl ?? "http://localhost:3000";
    const app = createApp(
        new ProductService(new ProductClient(url)),
        new CartService(new CartClient(url)),
    );
    const touched = new Map<Shopper, Set<string>>();

    function shopper(testApp = app): Shopper {
        const agent = request.agent(testApp);
        touched.set(agent, new Set());
        return agent;
    }

    function add(agent: Shopper, productId: string, quantity: number | string) {
        touched.get(agent)?.add(productId);
        return agent
            .post("/cart/items/add")
            .type("form")
            .send({ productId, quantity: String(quantity) });
    }

    afterEach(async () => {
        for (const [agent, productIds] of touched) {
            for (const productId of productIds) {
                await agent
                    .post("/cart/items/remove")
                    .type("form")
                    .send({ productId });
            }
        }
        touched.clear();
    });

    it("shows add to cart forms for real products on Home and Shop", async () => {
        const customer = shopper();
        const home = await customer.get("/");
        expect(home.status).toBe(200);
        expect(home.text).toContain('action="/cart/items/add"');

        const shop = await customer.get("/shop");
        expect(shop.status).toBe(200);
        for (const productId of [cue, chalk, cueCase]) {
            expect(shop.text).toContain(`name="productId" value="${productId}"`);
        }
    });

    it("loads an empty cart and sets a cart cookie", async () => {
        const response = await shopper().get("/cart");
        expect(response.status).toBe(200);
        expect(response.text).toContain("Your cart is empty");
        expect(response.text).toContain("Cart, 0 items");
        expect(response.headers["set-cookie"][0]).toMatch(
            /cue_cart=.+;.*HttpOnly; SameSite=Lax/,
        );
        expect(response.headers["cache-control"]).toBe("no-store");
    });

    it("adds products, updates quantities and recalculates totals", async () => {
        const customer = shopper();
        const added = await add(customer, cue, 2);
        expect(added.status).toBe(303);
        expect(added.headers.location).toBe("/cart?notice=added");
        await add(customer, chalk, 3);

        const cart = await customer.get("/cart");
        expect(cart.text).toContain("Pro Series Maple Cue");
        expect(cart.text).toContain("Chalk &amp; Tip Kit");
        expect(cart.text).toContain("£89.99 each");
        expect(cart.text).toContain("£179.98");
        expect(cart.text).toContain("£44.97");
        expect(cart.text).toContain(shippingLine("Free"));
        expect(cart.text).toContain(totalLine("£224.95"));
        expect(cart.text).toContain("Cart, 5 items");
        expect(cart.text).toContain('value="2"');

        await customer
            .post("/cart/items/update")
            .type("form")
            .send({ productId: cue, quantity: "1" })
            .expect(303);
        const updated = await customer.get("/cart?notice=updated");
        expect(updated.text).toContain("Quantity updated.");
        expect(updated.text).toContain(totalLine("£134.96"));
        expect(updated.text).toContain("Cart, 4 items");
    });

    it("charges £4.99 shipping on a cart below £50", async () => {
        const customer = shopper();
        await add(customer, cueCase, 1);
        const cart = await customer.get("/cart");
        expect(cart.text).toContain(shippingLine("£4.99"));
        expect(cart.text).toContain(totalLine("£54.98"));
    });

    it("moves from £4.99 to free shipping as the subtotal crosses £50", async () => {
        const customer = shopper();
        await add(customer, chalk, 1);
        await add(customer, tableCover, 1);
        const below = await customer.get("/cart");
        expect(below.text).toContain("£49.98");
        expect(below.text).toContain(shippingLine("£4.99"));
        expect(below.text).toContain(totalLine("£54.97"));

        await add(customer, cueBall, 1);
        const above = await customer.get("/cart");
        expect(above.text).toContain(shippingLine("Free"));
        expect(above.text).toContain(totalLine("£62.97"));
    });

    it("restores shipping when removing items drops the subtotal below £50", async () => {
        const customer = shopper();
        await add(customer, cue, 1);
        await add(customer, chalk, 1);
        const both = await customer.get("/cart");
        expect(both.text).toContain(shippingLine("Free"));
        expect(both.text).toContain(totalLine("£104.98"));

        await customer
            .post("/cart/items/remove")
            .type("form")
            .send({ productId: cue })
            .expect(303);
        const remaining = await customer.get("/cart");
        expect(remaining.text).not.toContain("Pro Series Maple Cue");
        expect(remaining.text).toContain(shippingLine("£4.99"));
        expect(remaining.text).toContain(totalLine("£19.98"));

        await customer
            .post("/cart/items/remove")
            .type("form")
            .send({ productId: chalk })
            .expect(303);
        const empty = await customer.get("/cart");
        expect(empty.text).toContain("Your cart is empty");
        expect(empty.text).toContain("Cart, 0 items");
    });

    it("keeps carts separate between customers", async () => {
        const first = shopper();
        const second = shopper();
        await add(first, cue, 1);
        expect((await first.get("/cart")).text).toContain("Pro Series Maple Cue");
        expect((await second.get("/cart")).text).toContain("Your cart is empty");
        await second
            .post("/cart/items/update")
            .type("form")
            .send({ productId: cue, quantity: "9" })
            .expect(404);
    });

    it("shows the current cart badge on Home and Shop", async () => {
        const customer = shopper();
        await add(customer, cue, 2);
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
    ])("rejects invalid quantity %s and leaves the cart unchanged", async (quantity) => {
        const customer = shopper();
        await add(customer, cue, 1);
        const result = await customer
            .post("/cart/items/update")
            .type("form")
            .send({ productId: cue, quantity });
        expect(result.status).toBe(400);
        expect(result.text).toContain("whole-number quantity");
        expect((await customer.get("/cart")).text).toContain("Cart, 1 items");
    });

    it("rejects a missing product ID", async () => {
        const response = await shopper()
            .post("/cart/items/add")
            .type("form")
            .send({ quantity: "1" });
        expect(response.status).toBe(400);
    });

    it("accepts the backend's maximum quantity and advertises it in the form", async () => {
        const customer = shopper();
        const response = await add(customer, cue, 2147483647);
        expect(response.status).toBe(303);
        const cart = await customer.get("/cart");
        expect(cart.status).toBe(200);
        expect(cart.text).toContain('max="2147483647"');
        expect(cart.text).toContain(shippingLine("Free"));
    });

    it("shows a rejected change when the backend returns 404 or 409", async () => {
        const customer = shopper();
        const unknown = await add(customer, "no-such-product", 1);
        expect(unknown.status).toBe(404);
        expect(unknown.text).toContain("product may be unavailable");

        const unpriced = await add(customer, unpricedProduct, 1);
        expect(unpriced.status).toBe(409);
        expect(unpriced.text).toContain("product may be unavailable");
        expect(unpriced.text).not.toContain("Product added to your cart.");
    });

    it("replaces malformed cart cookies", async () => {
        const response = await shopper()
            .get("/cart")
            .set("Cookie", "cue_cart=invalid")
            .expect(200);
        expect(response.headers["set-cookie"].join(";")).toContain("cue_cart=");
        expect(response.text).toContain("Your cart is empty");
    });

    it("shows an error, not an empty cart, when the cart backend is unreachable", async () => {
        // Port 1 refuses connections, so this is a real network failure.
        const unreachable = createApp(
            new ProductService(new ProductClient(url)),
            new CartService(new CartClient("http://127.0.0.1:1")),
        );
        const customer = shopper(unreachable);
        const cart = await customer.get("/cart");
        expect(cart.status).toBe(502);
        expect(cart.text).toContain("We can't load your cart");
        expect(cart.text).not.toContain("Your cart is empty");

        const home = await customer.get("/");
        expect(home.status).toBe(200);
        expect(home.text).toContain("item count unavailable");
        expect(home.text).not.toContain("Cart, 0 items");

        const change = await add(customer, cue, 1);
        expect(change.status).toBe(502);
        expect(change.text).toContain("Check the current cart");
        expect(change.text).not.toContain("Product added to your cart.");
    });
});
