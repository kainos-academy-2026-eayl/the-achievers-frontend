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

    it("includes the add to cart confirmation modal", async () => {
        const response = await request(appWithProducts([validProduct])).get(
            "/shop",
        );

        expect(response.status).toBe(200);
        expect(response.text).toContain('id="add-to-cart-modal"');
        expect(response.text).toContain("Add to Cart?");
        expect(response.text).toContain('data-product-name');
        expect(response.text).toContain('src="/js/cart-confirmation.js"');
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

describe("GET /shop category filter", () => {
    const products = [
        validProduct,
        { ...validProduct, id: "p2", name: "Carbon Break Cue" },
        {
            ...validProduct,
            id: "p3",
            name: "Hard Shell Cue Case",
            category: "Cases",
        },
    ];

    it("displays all available categories as filter options", async () => {
        const response = await request(appWithProducts(products)).get("/shop");

        expect(response.status).toBe(200);
        expect(response.text).toContain('href="/shop?category=Pool%20Cues"');
        expect(response.text).toContain('href="/shop?category=Cases"');
    });

    it("displays only products in the selected category", async () => {
        const response = await request(appWithProducts(products)).get(
            "/shop?category=Pool%20Cues",
        );

        expect(response.status).toBe(200);
        expect(response.text).toContain("Pro Series Maple Cue");
        expect(response.text).toContain("Carbon Break Cue");
        expect(response.text).not.toContain('class="product-name">Hard Shell Cue Case<');
        expect(response.text).toContain("2 results");
    });

    it("displays a single matching product", async () => {
        const response = await request(appWithProducts(products)).get(
            "/shop?category=Cases",
        );

        expect(response.text).toContain("Hard Shell Cue Case");
        expect(response.text).not.toContain('class="product-name">Pro Series Maple Cue<');
        expect(response.text).toContain("1 result");
    });

    it("shows all products when the filter is cleared", async () => {
        const response = await request(appWithProducts(products)).get(
            "/shop?category=",
        );

        expect(response.text).toContain("3 results");
        expect(response.text).toContain('href="/shop" aria-current="page"');
    });

    it("shows a message when no categories are available", async () => {
        const response = await request(appWithProducts([])).get("/shop");

        expect(response.text).toContain("No categories available");
    });

    it("shows a message when no products match the selected category", async () => {
        const response = await request(appWithProducts(products)).get(
            "/shop?category=Snooker%20Balls",
        );

        expect(response.status).toBe(200);
        expect(response.text).toContain("No products found");
        expect(response.text).not.toContain('class="product-name">Pro Series Maple Cue<');
        expect(response.text).not.toContain('class="product-name">Hard Shell Cue Case<');
    });

    it("only displays categories from valid products", async () => {
        const response = await request(
            appWithProducts([
                validProduct,
                { ...validProduct, id: "bad", category: "   " },
                { ...validProduct, id: "bad2", price: null, category: "Ghost" },
            ]),
        ).get("/shop");

        expect(response.text).toContain("?category=Pool%20Cues");
        expect(response.text).not.toContain("?category=Ghost");
        expect(response.text).not.toContain('?category="');
    });

    it("rejects a malformed category parameter", async () => {
        const response = await request(appWithProducts(products)).get(
            "/shop?category=Cases&category=Pool%20Cues",
        );

        expect(response.status).toBe(400);
        expect(response.text).toContain("Invalid category");
        expect(response.text).not.toContain("Hard Shell Cue Case");
    });

    it("escapes the selected category in the page", async () => {
        const response = await request(appWithProducts(products)).get(
            "/shop?category=%3Cscript%3E",
        );

        expect(response.text).not.toContain("<script>");
    });
});
