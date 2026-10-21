import type {
    Catalogue,
    CatalogueFilters,
    CategorySummary,
    ImageVariant,
    Product,
    ProductPrice,
} from "../models/product";

export const MISSING_DESCRIPTION = "No description available.";
export const UNCATEGORISED = "Uncategorised";

const gbp = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
});

function cleanText(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const cleaned = value.replace(/\p{Cc}/gu, "").trim();
    return cleaned.length > 0 ? cleaned : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

export function formatPrice(value: unknown): ProductPrice | null {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        return null;
    }
    const parts = gbp.formatToParts(value);
    const join = (...types: Intl.NumberFormatPartTypes[]) =>
        parts
            .filter((part) => types.includes(part.type))
            .map((part) => part.value)
            .join("");
    return {
        formatted: gbp.format(value),
        currencySymbol: join("currency"),
        whole: join("integer", "group"),
        fraction: join("fraction"),
    };
}

function toRating(value: unknown): number | null {
    return typeof value === "number" &&
        Number.isFinite(value) &&
        value >= 0 &&
        value <= 5
        ? value
        : null;
}

function toReviewCount(value: unknown): number {
    return typeof value === "number" && Number.isInteger(value) && value >= 0
        ? value
        : 0;
}

function toImageVariant(category: string): ImageVariant {
    const lower = category.toLowerCase();
    if (lower.includes("case")) return "case";
    if (lower.includes("ball")) return "ball";
    if (lower.includes("protect")) return "safety";
    if (lower.includes("cue") || lower.includes("calluminator")) return "cue";
    return "acc";
}

// Returns null for products that cannot be shown at all (not an object, or no id/name).
export function toProduct(raw: unknown): Product | null {
    const record = asRecord(raw);
    if (!record) return null;

    const id = cleanText(record.id);
    const name = cleanText(record.name);
    if (!id || !name) return null;

    const category = cleanText(record.category) ?? UNCATEGORISED;
    const rating = toRating(record.rating);

    return {
        id,
        name,
        description: cleanText(record.description) ?? MISSING_DESCRIPTION,
        category,
        price: formatPrice(record.price),
        rating,
        ratingPercent: rating === null ? null : Math.round((rating / 5) * 100),
        reviewCount: toReviewCount(record.reviewCount),
        imageVariant: toImageVariant(category),
    };
}

function matchesFilters(product: Product, filters: CatalogueFilters): boolean {
    if (filters.category && product.category !== filters.category) return false;
    if (!filters.q) return true;
    const q = filters.q.toLowerCase();
    return [product.name, product.description, product.category].some((text) =>
        text.toLowerCase().includes(q),
    );
}

export function buildCatalogue(
    rawProducts: unknown,
    filters: CatalogueFilters,
): Catalogue {
    const available = (Array.isArray(rawProducts) ? rawProducts : [])
        .map(toProduct)
        .filter((product): product is Product => product !== null);

    const counts = new Map<string, number>();
    for (const product of available) {
        counts.set(product.category, (counts.get(product.category) ?? 0) + 1);
    }
    const categories: CategorySummary[] = [...counts]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => a.name.localeCompare(b.name));

    return {
        products: available.filter((product) => matchesFilters(product, filters)),
        categories,
        totalAvailable: available.length,
    };
}
