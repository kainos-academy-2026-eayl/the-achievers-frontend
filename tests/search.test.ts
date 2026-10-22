import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { searchProducts } from "../src/services/productSearch";
import {
    ProductService,
    toProductViewModel,
} from "../src/services/productService";

const rawProducts = [
    {
        id: "p1",
        name: "Pro Series Maple Cue",
        description: "A balanced maple cue.",
        category: "Pool Cues",
        price: 89.99,
    },
    {
        id: "p2",
        name: "Carbon Break Cue",
        description: "Stiff carbon shaft for powerful breaks.",
        category: "Pool Cues",
        price: 149,
    },
    {
        id: "p3",
        name: "Hard Shell Cue Case",
        description: "Protects two cues.",
        category: "Cases",
        price: 45,
    },
    {
        id: "p4",
        name: "Aramith Snooker Ball Set",
        description: "Tournament quality balls.",
        category: "Balls",
        price: 199,
    },
];

const products = rawProducts.map((raw) => {
    const product = toProductViewModel(raw);
    if (!product) throw new Error("invalid fixture");
    return product;
});

function names(query: string) {
    return searchProducts(products, query).map((product) => product.name);
}

function appWithProducts(data: unknown) {
    return createApp(new ProductService({ getAll: async () => data }));
}

describe("searchProducts", () => {
    it("returns all products for an empty query", () => {
        expect(names("   ")).toHaveLength(products.length);
    });

    it("matches partially typed words", () => {
        expect(names("snook")).toEqual(["Aramith Snooker Ball Set"]);
        expect(names("carb")).toEqual(["Carbon Break Cue"]);
    });

    it("tolerates spelling mistakes", () => {
        expect(names("snoker")).toEqual(["Aramith Snooker Ball Set"]);
        expect(names("mapel")).toEqual(["Pro Series Maple Cue"]);
        expect(names("carbn breka")).toEqual(["Carbon Break Cue"]);
    });

    it("is case and punctuation insensitive", () => {
        expect(names("HARD-SHELL")).toEqual(["Hard Shell Cue Case"]);
    });

    it("requires every word to match", () => {
        expect(names("maple case")).toEqual([]);
    });

    it("does not fuzzy match very short words", () => {
        expect(names("xue")).toEqual([]);
    });

    it("returns nothing for unrelated text", () => {
        expect(names("trampoline")).toEqual([]);
    });
});

describe("GET /shop?q=", () => {
    it("shows matching products for a misspelled search", async () => {
        const response = await request(appWithProducts(rawProducts)).get(
            "/shop?q=snoker",
        );

        expect(response.status).toBe(200);
        expect(response.text).toContain("Aramith Snooker Ball Set");
        expect(response.text).not.toContain("Hard Shell Cue Case");
        expect(response.text).toContain('Results for "snoker"');
        expect(response.text).toContain('value="snoker"');
    });

    it("combines search with the category filter", async () => {
        const response = await request(appWithProducts(rawProducts)).get(
            "/shop?q=cue&category=Cases",
        );

        expect(response.text).toContain("Hard Shell Cue Case");
        expect(response.text).not.toContain("Carbon Break Cue");
        expect(response.text).toContain("1 result");
    });

    it("keeps the search when switching category", async () => {
        const response = await request(appWithProducts(rawProducts)).get(
            "/shop?q=cue",
        );

        expect(response.text).toContain('href="/shop?category=Cases&amp;q=cue"');
    });

    it("shows a message when nothing matches", async () => {
        const response = await request(appWithProducts(rawProducts)).get(
            "/shop?q=trampoline",
        );

        expect(response.status).toBe(200);
        expect(response.text).toContain("No products match");
    });

    it("rejects a malformed search parameter", async () => {
        const response = await request(appWithProducts(rawProducts)).get(
            "/shop?q=a&q=b",
        );

        expect(response.status).toBe(400);
        expect(response.text).toContain("Invalid search");
    });

    it("escapes the search term", async () => {
        const response = await request(appWithProducts(rawProducts)).get(
            "/shop?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E",
        );

        expect(response.text).not.toContain("<script>alert(1)");
    });
});
