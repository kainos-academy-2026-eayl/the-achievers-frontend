import { randomBytes, timingSafeEqual } from "node:crypto";
import { type Request, type Response, Router } from "express";
import { CartApiError } from "../clients/cartClient";
import { OrderApiError } from "../clients/orderClient";
import { ReviewApiError } from "../clients/reviewClient";
import type { CartService } from "../services/cartService";
import type { OrderService, OrderViewModel } from "../services/orderService";
import type { ProductService } from "../services/productService";
import {
    MAX_REVIEW_COMMENT_LENGTH,
    parseReviewForm,
    type ReviewService,
    type ReviewViewModel,
} from "../services/reviewService";
import { ensureCartId, MAX_CART_QUANTITY } from "./cartController";

const title = "Order History | Cue Corner";

const ORDER_STATUSES: Record<string, string> = {
    placed: "Placed",
    processing: "Processing",
    delivered: "Delivered",
    cancelled: "Cancelled",
};

const REVIEW_RESTRICTION =
    "You can only review products from your delivered orders.";

const NOTICES: Record<string, { message: string; error?: boolean; }> = {
    unavailable: {
        message: "All products from this order are currently unavailable.",
        error: true,
    },
    "review-saved": { message: "Your review has been saved." },
};

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "long",
    timeZone: "Europe/London",
});

interface ReviewFormState {
    key: string;
    error: string;
    values: { rating: number; comment: string; };
}

function normaliseStatus(status: string): { key: string; label: string; } {
    const key = status.trim().toLowerCase();
    const label = ORDER_STATUSES[key];
    return label
        ? { key, label }
        : { key: "unknown", label: status || "Unknown" };
}

function toHistoryOrder(
    order: OrderViewModel,
    reviewsByProduct: Map<string, ReviewViewModel>,
) {
    const status = normaliseStatus(order.status);
    const delivered = status.key === "delivered";
    return {
        ...order,
        statusKey: status.key,
        statusLabel: status.label,
        date: dateFormatter.format(new Date(order.createdAt)),
        items: order.items.map((item) => ({
            ...item,
            reviewable: delivered && item.productId !== null,
            review: item.productId ? reviewsByProduct.get(item.productId) : undefined,
        })),
    };
}

export function createOrderHistoryRouter(
    orders: Pick<OrderService, "list" | "get">,
    reviews: Pick<ReviewService, "listMine" | "save">,
    carts: Pick<CartService, "add">,
    products: Pick<ProductService, "getAll">,
): Router {
    const router = Router();

    function hasValidCsrfToken(req: Request): boolean {
        const submitted: unknown = req.body?.csrfToken;
        const expected = req.session.ordersCsrfToken;
        if (typeof submitted !== "string" || !expected) return false;
        const a = Buffer.from(submitted);
        const b = Buffer.from(expected);
        return a.length === b.length && timingSafeEqual(a, b);
    }

    async function rejectInvalidCsrf(req: Request, res: Response): Promise<void> {
        console.warn("Rejected order history form with an invalid CSRF token");
        await renderHistory(req, res, 403, {
            formError: "Your session has changed. Please try again.",
        });
    }

    async function renderHistory(
        req: Request,
        res: Response,
        status = 200,
        extras: { formError?: string; reviewForm?: ReviewFormState; } = {},
    ): Promise<void> {
        res.set("Cache-Control", "no-store");
        const auth = req.session.auth;
        if (!auth) {
            res.redirect(303, "/login");
            return;
        }
        const notice =
            typeof req.query.notice === "string"
                ? NOTICES[req.query.notice]
                : undefined;
        req.session.ordersCsrfToken ??= randomBytes(32).toString("hex");
        try {
            const customerOrders = await orders.list(auth.accessToken);
            const reviewsByProduct = new Map<string, ReviewViewModel>();
            let reviewsUnavailable = false;
            if (
                customerOrders.some(
                    (order) => normaliseStatus(order.status).key === "delivered",
                )
            ) {
                try {
                    for (const review of await reviews.listMine(auth.accessToken)) {
                        reviewsByProduct.set(review.productId, review);
                    }
                } catch (error) {
                    console.error("Failed to load customer reviews", error);
                    reviewsUnavailable = true;
                }
            }
            res.status(status).render("order-history", {
                title,
                orders: customerOrders.map((order) =>
                    toHistoryOrder(order, reviewsByProduct),
                ),
                reviewsUnavailable,
                notice,
                maxCommentLength: MAX_REVIEW_COMMENT_LENGTH,
                csrfToken: req.session.ordersCsrfToken,
                ...extras,
            });
        } catch (error) {
            if (error instanceof OrderApiError && error.status === 401) {
                res.redirect(303, "/login");
                return;
            }
            console.error("Failed to load order history", error);
            res.status(502).render("order-history", { title, loadError: true });
        }
    }

    router.get("/orders", async (req, res) => {
        await renderHistory(req, res);
    });

    router.post("/orders/:id/buy-again", async (req, res) => {
        res.set("Cache-Control", "no-store");
        const auth = req.session.auth;
        if (!auth) {
            res.redirect(303, "/login");
            return;
        }
        if (!hasValidCsrfToken(req)) {
            await rejectInvalidCsrf(req, res);
            return;
        }
        let order: OrderViewModel;
        try {
            // The backend only returns orders owned by the token's user.
            order = await orders.get(auth.accessToken, req.params.id);
        } catch (error) {
            if (error instanceof OrderApiError && error.status === 401) {
                res.redirect(303, "/login");
                return;
            }
            if (error instanceof OrderApiError && error.status === 404) {
                await renderHistory(req, res, 404, {
                    formError: "We couldn't find that order on your account.",
                });
                return;
            }
            console.error("Failed to load order for buy again", error);
            await renderHistory(req, res, 502, {
                formError: "We couldn't add this order to your cart. Please try again.",
            });
            return;
        }

        try {
            const availableIds = new Set(
                (await products.getAll())
                    .filter((product) => product.inStock !== false)
                    .map((product) => product.id),
            );
            const cartId = ensureCartId(req, res);
            let added = 0;
            for (const item of order.items) {
                if (!item.productId || !availableIds.has(item.productId)) continue;
                try {
                    await carts.add(
                        cartId,
                        item.productId,
                        Math.min(item.quantity, MAX_CART_QUANTITY),
                    );
                    added++;
                } catch (error) {
                    if (
                        error instanceof CartApiError &&
                        [400, 404, 409].includes(error.status)
                    ) {
                        continue;
                    }
                    throw error;
                }
            }

            if (added === 0) {
                res.redirect(303, "/orders?notice=unavailable");
                return;
            }
            const notice = added < order.items.length ? "partial" : "reordered";
            res.redirect(303, `/cart?notice=${notice}`);
        } catch (error) {
            console.error("Failed to buy order again", error);
            await renderHistory(req, res, 502, {
                formError:
                    "We couldn't add this order to your cart. Check your cart before trying again.",
            });
        }
    });

    router.post("/orders/:id/reviews/:productId", async (req, res) => {
        res.set("Cache-Control", "no-store");
        const auth = req.session.auth;
        if (!auth) {
            res.redirect(303, "/login");
            return;
        }
        if (!hasValidCsrfToken(req)) {
            await rejectInvalidCsrf(req, res);
            return;
        }
        const { id: orderId, productId } = req.params;
        const key = `${orderId}:${productId}`;
        const parsed = parseReviewForm(req.body);
        if (!parsed.success) {
            await renderHistory(req, res, 400, {
                reviewForm: { key, error: parsed.error, values: parsed.values },
            });
            return;
        }
        const reviewForm = (error: string): ReviewFormState => ({
            key,
            error,
            values: parsed.data,
        });

        try {
            const order = await orders.get(auth.accessToken, orderId);
            if (
                normaliseStatus(order.status).key !== "delivered" ||
                !order.items.some((item) => item.productId === productId)
            ) {
                await renderHistory(req, res, 403, {
                    formError: REVIEW_RESTRICTION,
                });
                return;
            }
            await reviews.save(
                auth.accessToken,
                productId,
                order.id,
                parsed.data.rating,
                parsed.data.comment,
            );
            res.redirect(
                303,
                `/orders?notice=review-saved#order-${encodeURIComponent(order.id)}`,
            );
        } catch (error) {
            if (
                (error instanceof OrderApiError || error instanceof ReviewApiError) &&
                error.status === 401
            ) {
                res.redirect(303, "/login");
                return;
            }
            if (error instanceof OrderApiError && error.status === 404) {
                await renderHistory(req, res, 404, {
                    formError: "We couldn't find that order on your account.",
                });
                return;
            }
            if (
                error instanceof ReviewApiError &&
                [400, 403, 409].includes(error.status)
            ) {
                await renderHistory(req, res, error.status, {
                    reviewForm: reviewForm(
                        error.status === 400
                            ? "Check your rating and review, then try again."
                            : REVIEW_RESTRICTION,
                    ),
                });
                return;
            }
            console.error("Failed to save review", error);
            await renderHistory(req, res, 502, {
                reviewForm: reviewForm(
                    "We couldn't save your review. Please try again.",
                ),
            });
        }
    });

    return router;
}
