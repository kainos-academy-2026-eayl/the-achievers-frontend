import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { OrderApiError } from "../src/clients/orderClient";
import type { Profile } from "../src/clients/profileClient";
import { ProductService } from "../src/services/productService";
import type { OrderViewModel } from "../src/services/orderService";

const profile: Profile = {
    name: "Customer",
    email: "customer@example.com",
    phone: null,
    creditBalance: 100000,
    createdAt: "2026-01-01T00:00:00.000Z",
    homeAddress: {
        label: null,
        addressLine1: "1 Cue Street",
        addressLine2: null,
        city: "Belfast",
        postcode: "BT1 1AA",
    },
    otherAddresses: [
        {
            label: "Work",
            addressLine1: "2 Office Park",
            addressLine2: null,
            city: "Belfast",
            postcode: "BT2 8LA",
        },
        {
            label: "Mum's house",
            addressLine1: "3 Green Road",
            addressLine2: "Flat 1",
            city: "Lisburn",
            postcode: "BT27 4AA",
        },
    ],
};

const order: OrderViewModel = {
    id: "order-123",
    reference: "ORD-ABC234",
    status: "placed",
    items: [
        {
            productId: "cue-1",
            name: "Maple Cue",
            price: "£10.00",
            quantity: 1,
            subtotal: "£10.00",
        },
    ],
    subtotal: "£10.00",
    shipping: "£4.99",
    total: "£14.99",
    shippingAddress: {
        addressLine1: "1 Cue Street",
        addressLine2: "",
        city: "Belfast",
        postcode: "BT1 1AA",
    },
    createdAt: "2026-10-29T12:00:00.000Z",
};

const accessToken = `header.${Buffer.from(
    JSON.stringify({
        sub: "1",
        iss: "the-achievers-backend",
        aud: "the-achievers-api",
        role: "user",
        exp: Math.floor(Date.now() / 1000) + 3600,
    }),
).toString("base64url")}.test-signature`;

function setup() {
    const cart = {
        get: vi.fn(async () => ({
            items: [
                {
                    productId: "cue-1",
                    name: "Maple Cue",
                    price: "£10.00",
                    quantity: 1,
                    subtotal: "£10.00",
                },
            ],
            count: 1,
            total: "£10.00",
            shipping: "£4.99",
            grandTotal: "£14.99",
        })),
        add: vi.fn(async () => { }),
        update: vi.fn(async () => { }),
        remove: vi.fn(async () => { }),
    };
    const profiles = {
        get: vi.fn(async () => profile),
        update: vi.fn(),
    };
    const orders = {
        checkout: vi.fn(async () => order),
        get: vi.fn(async () => order),
    };
    const products = new ProductService({ getAll: async () => [] });
    vi.spyOn(products, "getAll");
    const app = createApp(products, cart, profiles, orders);
    return { agent: request.agent(app), cart, orders, profiles, products };
}

async function logIn(agent: ReturnType<typeof request.agent>) {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
            JSON.stringify({
                accessToken,
                tokenType: "Bearer",
                expiresIn: 3600,
                user: {
                    email: profile.email,
                    name: profile.name,
                    createdAt: profile.createdAt,
                },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    await agent
        .post("/login")
        .type("form")
        .send({ email: profile.email, password: "LongEnoughPassword123" })
        .expect(303);
    await agent.get("/cart").expect(200);
}

const validPayment = {
    addressChoice: "home",
    cardNumber: "4242 4242 4242 4242",
    cardExpiry: "12/34",
    cardCvc: "123",
};

afterEach(() => vi.restoreAllMocks());

describe("Checkout and order placement", () => {
    it.each([
        ["get", "/checkout"],
        ["post", "/checkout"],
        ["get", "/orders/order-123"],
    ] as const)("requires a logged-in customer for %s %s", async (method, path) => {
        const { agent, orders } = setup();
        const response = await agent[method](path);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
        expect(orders.checkout).not.toHaveBeenCalled();
        expect(orders.get).not.toHaveBeenCalled();
    });

    it("prefills the saved address and explains the demo card", async () => {
        const { agent } = setup();
        await logIn(agent);

        const response = await agent.get("/checkout");

        expect(response.status).toBe(200);
        expect(response.text).toContain("1 Cue Street");
        expect(response.text).toContain("Work");
        expect(response.text).toContain("Mum&#39;s house");
        expect(response.text).toContain("Enter a different address");
        expect(response.text).toMatch(/id="address-home"[^>]*checked/);
        expect(response.text).toContain('id="saved-address-options" class="saved-address-options"');
        expect(response.text).toContain('id="different-address-fields" class="checkout-address-fields" disabled');
        expect(response.text).toContain("£100,000.00");
        expect(response.text).toContain("4242 4242 4242 4242");
        expect(response.text).toContain("12/34");
        expect(response.text).toContain("123");
        expect(response.headers["cache-control"]).toBe("no-store");
    });

    it("places an order to a selected saved alternate address", async () => {
        const { agent, orders } = setup();
        await logIn(agent);

        await agent
            .post("/checkout")
            .type("form")
            .send({ ...validPayment, addressChoice: "other-1" })
            .expect(303);

        expect(orders.checkout).toHaveBeenCalledWith(
            accessToken,
            expect.stringMatching(/^[0-9a-f-]{36}$/i),
            {
                addressLine1: "3 Green Road",
                addressLine2: "Flat 1",
                city: "Lisburn",
                postcode: "BT27 4AA",
            },
        );
    });

    it("places an order with the authenticated account and saved address", async () => {
        const { agent, orders, products, profiles } = setup();
        await logIn(agent);

        const placed = await agent
            .post("/checkout")
            .type("form")
            .send(validPayment)
            .expect(303);

        expect(placed.headers.location).toBe("/orders/order-123");
        expect(orders.checkout).toHaveBeenCalledWith(
            accessToken,
            expect.stringMatching(/^[0-9a-f-]{36}$/i),
            {
                addressLine1: "1 Cue Street",
                addressLine2: "",
                city: "Belfast",
                postcode: "BT1 1AA",
            },
        );
        profiles.get.mockResolvedValueOnce({ ...profile, creditBalance: 99985.01 });

        const confirmation = await agent.get(placed.headers.location);
        expect(confirmation.status).toBe(200);
        expect(confirmation.text).toContain("Thank you for your order");
        expect(confirmation.text).toContain("ORD-ABC234");
        expect(confirmation.text).toContain("Maple Cue");
        expect(confirmation.text).toContain("£99,985.01");
        expect(products.getAll).toHaveBeenCalledOnce();
    });

    it("uses a one-time address when selected", async () => {
        const { agent, orders } = setup();
        await logIn(agent);

        await agent
            .post("/checkout")
            .type("form")
            .send({
                ...validPayment,
                useDifferentAddress: "yes",
                differentAddressLine1: "8 Different Road",
                differentAddressLine2: "Flat 2",
                differentCity: "Lisburn",
                differentPostcode: "BT27 4AA",
            })
            .expect(303);

        expect(orders.checkout).toHaveBeenCalledWith(
            accessToken,
            expect.stringMatching(/^[0-9a-f-]{36}$/i),
            {
                addressLine1: "8 Different Road",
                addressLine2: "Flat 2",
                city: "Lisburn",
                postcode: "BT27 4AA",
            },
        );
    });

    it("disables saved choices when entering a different address", async () => {
        const { agent } = setup();
        await logIn(agent);

        const response = await agent
            .post("/checkout")
            .type("form")
            .send({
                ...validPayment,
                useDifferentAddress: "yes",
                differentAddressLine1: "",
                differentCity: "",
                differentPostcode: "",
            });

        expect(response.status).toBe(400);
        expect(response.text).toContain('id="saved-address-options" class="saved-address-options" disabled');
        expect(response.text).not.toContain('id="different-address-fields" class="checkout-address-fields" disabled');
    });

    it("shows a stock error and does not create an order", async () => {
        const { agent, orders } = setup();
        orders.checkout.mockRejectedValueOnce(
            new OrderApiError(409, "Not enough stock for Maple Cue"),
        );
        await logIn(agent);

        const response = await agent
            .post("/checkout")
            .type("form")
            .send(validPayment);

        expect(response.status).toBe(409);
        expect(response.text).toContain("Not enough stock for Maple Cue");
        expect(orders.get).not.toHaveBeenCalled();
    });

    it("refreshes the displayed account balance after insufficient credit", async () => {
        const { agent, orders, profiles } = setup();
        orders.checkout.mockRejectedValueOnce(
            new OrderApiError(409, "Insufficient account balance"),
        );
        profiles.get
            .mockResolvedValueOnce(profile)
            .mockResolvedValueOnce({ ...profile, creditBalance: 5 });
        await logIn(agent);

        const response = await agent
            .post("/checkout")
            .type("form")
            .send(validPayment);

        expect(response.status).toBe(409);
        expect(response.text).toContain("Insufficient account balance");
        expect(response.text).toContain("£5.00");
        expect(orders.checkout).toHaveBeenCalledOnce();
    });

    it("does not submit an order with invalid demo card details", async () => {
        const { agent, orders } = setup();
        await logIn(agent);

        const response = await agent
            .post("/checkout")
            .type("form")
            .send({ ...validPayment, cardCvc: "999" });

        expect(response.status).toBe(400);
        expect(response.text).toContain("Enter the demo card details shown above.");
        expect(orders.checkout).not.toHaveBeenCalled();
    });
});
