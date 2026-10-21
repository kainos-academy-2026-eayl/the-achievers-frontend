// Shape of product data as it arrives from the data source; any field may be missing or null.
export interface RawProduct {
    id: string;
    name: string | null;
    description: string | null;
    category: string | null;
    price: number | null;
    rating?: number | null;
    reviewCount?: number | null;
}

export type ImageVariant = "cue" | "case" | "ball" | "safety" | "acc";

export interface ProductPrice {
    formatted: string;
    currencySymbol: string;
    whole: string;
    fraction: string;
}

// Validated product that is safe to render.
export interface Product {
    id: string;
    name: string;
    description: string;
    category: string;
    price: ProductPrice | null;
    ratingPercent: number | null;
    rating: number | null;
    reviewCount: number;
    imageVariant: ImageVariant;
}

export interface CategorySummary {
    name: string;
    count: number;
}

export interface CatalogueFilters {
    q: string;
    category: string;
}

export interface Catalogue {
    products: Product[];
    categories: CategorySummary[];
    totalAvailable: number;
}
