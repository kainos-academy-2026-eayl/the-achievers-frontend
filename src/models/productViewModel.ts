export interface ProductViewModel {
	id: string;
	name: string;
	description: string;
	category: string;
	price: string;
	inStock: boolean | null;
	rating: number | null;
	ratingPercent: number;
	reviewCount: number;
}
