import type { ReviewClient } from "../clients/reviewClient";

export const MAX_REVIEW_COMMENT_LENGTH = 1000;

export interface ReviewViewModel {
	id: number;
	productId: string;
	orderId: string;
	rating: number;
	comment: string;
}

export interface ProductReviewViewModel {
	productId: string;
	rating: number;
	comment: string;
	firstName: string;
	date?: string;
}

export type ReviewFormResult =
	| { success: true; data: { rating: number; comment: string } }
	| {
			success: false;
			error: string;
			values: { rating: number; comment: string };
	  };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidRating(value: unknown): value is number {
	return (
		Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 5
	);
}

function mapReview(raw: unknown): ReviewViewModel {
	if (!isRecord(raw)) throw new Error("Invalid review");
	const { id, productId, orderId, rating, comment } = raw;
	if (
		!Number.isSafeInteger(id) ||
		typeof productId !== "string" ||
		!productId ||
		typeof orderId !== "string" ||
		!orderId ||
		!isValidRating(rating) ||
		(comment !== null && typeof comment !== "string")
	) {
		throw new Error("Invalid review");
	}
	return {
		id: id as number,
		productId,
		orderId,
		rating,
		comment: comment ?? "",
	};
}

export function parseReviewForm(body: unknown): ReviewFormResult {
	const form = isRecord(body) ? body : {};
	const rawRating = typeof form.rating === "string" ? form.rating : "";
	const rating = /^[0-5]$/.test(rawRating) ? Number(rawRating) : 0;
	const comment = typeof form.comment === "string" ? form.comment.trim() : "";
	const values = { rating, comment };
	if (!isValidRating(rating)) {
		return {
			success: false,
			error: "Choose a star rating between 1 and 5.",
			values,
		};
	}
	if (comment.length > MAX_REVIEW_COMMENT_LENGTH) {
		return {
			success: false,
			error: `Your review must be ${MAX_REVIEW_COMMENT_LENGTH} characters or fewer.`,
			values,
		};
	}
	return { success: true, data: values };
}

export class ReviewService {
	constructor(
		private readonly client: Pick<ReviewClient, "listMine" | "save"> &
			Partial<Pick<ReviewClient, "listForProduct">>,
	) {}

	async listMine(accessToken: string): Promise<ReviewViewModel[]> {
		const data = await this.client.listMine(accessToken);
		if (!Array.isArray(data)) {
			throw new Error("Unexpected reviews response format");
		}
		return data.map(mapReview);
	}

	async listForProduct(
		productId: string,
		accessToken?: string,
	): Promise<ProductReviewViewModel[]> {
		if (!this.client.listForProduct) {
			throw new Error("Product reviews are unavailable");
		}
		const data = await this.client.listForProduct(productId, accessToken);
		if (!Array.isArray(data)) {
			throw new Error("Unexpected reviews response format");
		}
		return data.flatMap((raw): ProductReviewViewModel[] => {
			if (!isRecord(raw) || raw.productId !== productId) return [];
			const { rating, comment } = raw;
			if (
				!isValidRating(rating) ||
				(comment !== null && typeof comment !== "string")
			) {
				return [];
			}
			const user = isRecord(raw.user) ? raw.user : {};
			const reviewer = isRecord(raw.reviewer) ? raw.reviewer : {};
			const name =
				[
					raw.firstName,
					raw.name,
					raw.userName,
					raw.reviewerName,
					user.name,
					reviewer.name,
				]
					.find(
						(value): value is string =>
							typeof value === "string" && value.trim() !== "",
					)
					?.trim()
					.split(/\s+/)[0] ?? "Customer";
			const rawDate =
				typeof raw.createdAt === "string" ? raw.createdAt : raw.date;
			const date =
				typeof rawDate === "string" && !Number.isNaN(Date.parse(rawDate))
					? new Date(rawDate).toISOString()
					: undefined;
			return [
				{
					productId,
					rating,
					comment: comment ?? "",
					firstName: name,
					...(date ? { date } : {}),
				},
			];
		});
	}

	async save(
		accessToken: string,
		productId: string,
		orderId: string,
		rating: number,
		comment: string,
	): Promise<void> {
		await this.client.save(accessToken, productId, {
			orderId,
			rating,
			comment,
		});
	}
}
