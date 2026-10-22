import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { ProductService } from "../src/services/productService";

function appWithProducts(data: unknown) {
    return createApp(new ProductService({ getAll: async () => data }));
}

const validProduct = {
    id: "p1",
    name: "Pro Series Maple Cue",
    description: "A balanced maple cue.",
    category: "Pool Cues",
    price: 89.99,
    rating: 4.5,
    reviewCount: 12,
};

describe("GET /shop", () => {
    it("displays all available products", async () => {
        const response = await request(
            appWithProducts([
                validProduct,
                { ...validProduct, id: "p2", name: "Hard Shell Cue Case" },
            ]),
        ).get("/shop");

        expect(response.status).toBe(200);
        expect(response.text).toContain("Pro Series Maple Cue");
        expect(response.text).toContain("Hard Shell Cue Case");
        expect(response.text).toContain("2 results");
    });

    it("displays name, description, category and price", async () => {
        const response = await request(appWithProducts([validProduct])).get(
            "/shop",
        );

        expect(response.text).toContain("Pro Series Maple Cue");
        expect(response.text).toContain("A balanced maple cue.");
        expect(response.text).toContain("Pool Cues");
        expect(response.text).toContain("£89.99");
    });

    it("formats prices as GBP currency", async () => {
        const response = await request(
            appWithProducts([{ ...validProduct, price: 1234.5 }]),
        ).get("/shop");

        expect(response.text).toContain("£1,234.50");
    });

    it.each([
        ["name", { name: null }],
        ["description", { description: null }],
        ["category", { category: null }],
        ["price", { price: null }],
        ["negative price", { price: -5 }],
        ["non-numeric price", { price: "abc" }],
        ["blank name", { name: "   " }],
    ])("hides a product with missing or invalid %s", async (_label, override) => {
        const response = await request(
            appWithProducts([
                validProduct,
                { ...validProduct, id: "bad", name: "Broken Product", ...override },
            ]),
        ).get("/shop");

        expect(response.status).toBe(200);
        expect(response.text).toContain("Pro Series Maple Cue");
        expect(response.text).not.toContain("Broken Product");
        expect(response.text).not.toContain("NaN");
        expect(response.text).toContain("1 result");
    });

    it("ignores entries that are not objects", async () => {
        const response = await request(
            appWithProducts([null, "corrupt", 42, validProduct]),
        ).get("/shop");

        expect(response.status).toBe(200);
        expect(response.text).toContain("1 result");
    });

    it("shows a message when no products are available", async () => {
        const response = await request(appWithProducts([])).get("/shop");

        expect(response.status).toBe(200);
        expect(response.text).toContain("No products available");
    });

    it("shows an error message when the backend fails", async () => {
        const app = createApp({
            getAll: async () => {
                throw new Error("backend down");
            },
        });

        const response = await request(app).get("/shop");

        expect(response.status).toBe(502);
        expect(response.text).toContain("show products right now");
    });
});
