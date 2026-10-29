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

describe("GET /categories", () => {
    it("lists each category once, linking to its filtered shop page", async () => {
        const response = await request(
            appWithProducts([
                validProduct,
                { ...validProduct, id: "p2", name: "Carbon Break Cue" },
                { ...validProduct, id: "p3", name: "Hard Shell Cue Case", category: "Cue Cases" },
            ]),
        ).get("/categories");

        expect(response.status).toBe(200);
        expect(response.text).toContain('href="/shop?category=Pool%20Cues"');
        expect(response.text).toContain('href="/shop?category=Cue%20Cases"');
        expect(response.text.split('href="/shop?category=Pool%20Cues"').length - 1).toBe(1);
    });

    it("shows a message when no categories are available", async () => {
        const response = await request(appWithProducts([])).get("/categories");

        expect(response.status).toBe(200);
        expect(response.text).toContain("No categories available");
    });

    it("shows an error when the backend fails", async () => {
        const app = createApp(
            new ProductService({
                getAll: async () => {
                    throw new Error("backend down");
                },
            }),
        );

        const response = await request(app).get("/categories");

        expect(response.status).toBe(502);
        expect(response.text).toContain("show categories right now");
    });
});

describe("home page category cards", () => {
    it("link to the shop filtered by each real category", async () => {
        const response = await request(appWithProducts([validProduct])).get("/");

        for (const category of ["Calluminator Range", "Protective Gear", "Pool Cues", "Cue Cases"]) {
            expect(response.text).toContain(
                `href="/shop?category=${encodeURIComponent(category)}"`,
            );
        }
        expect(response.text).not.toContain('href="/categories/');
    });
});
