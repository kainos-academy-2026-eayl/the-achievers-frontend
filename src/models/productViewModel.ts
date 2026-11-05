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
	imageUrl: string | null;
}

export function productImagePath(productId: string, imageId: string): string {
	return `/media/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}`;
}
