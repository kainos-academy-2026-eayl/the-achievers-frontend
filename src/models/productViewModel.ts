export interface ProductViewModel {
    id: string;
    name: string;
    description: string;
    category: string;
    price: string;
    rating: number | null;
    ratingPercent: number;
    reviewCount: number;
}
