import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { CartApiError } from "../clients/cartClient";
import type { CartService } from "../services/cartService";

export type CartOperations = Pick<
	CartService,
	"get" | "add" | "update" | "remove"
>;

const MAX_CART_QUANTITY = 99;

interface QuantityButtonState {
	canDecrement: boolean;
	canIncrement: boolean;
}

function getQuantityButtonState(quantity: number): QuantityButtonState {
	return {
		canDecrement: quantity > 1,
		canIncrement: quantity < MAX_CART_QUANTITY,
	};
}

export function readCartId(req: Request): string | undefined {
	const value = req.headers.cookie
		?.split(";")
		.map((cookie) => cookie.trim())
		.find((cookie) => cookie.startsWith("cue_cart="))
		?.slice("cue_cart=".length);
	return value &&
		/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
			value,
		)
		? value
		: undefined;
}

function ensureCartId(req: Request, res: Response): string {
	const existing = readCartId(req);
	if (existing) return existing;
	const id = randomUUID();
	res.cookie("cue_cart", id, {
		httpOnly: true,
		sameSite: "lax",
		secure: process.env.NODE_ENV === "production",
		maxAge: 30 * 24 * 60 * 60 * 1000,
		path: "/",
	});
	return id;
}

export function createCartRouter(service: CartOperations): Router {
	const router = Router();

	async function renderCart(
		res: Response,
		cartId: string,
		status = 200,
		cartError?: string,
		cartMessage?: string,
	): Promise<void> {
		res.set("Cache-Control", "no-store");
		try {
			const cart = await service.get(cartId);
			const itemStates = cart.items.map((item) => ({
				productId: item.productId,
				...getQuantityButtonState(item.quantity),
			}));
			res.status(status).render("cart", {
				title: "Shopping Cart | Cue Corner",
				cart,
				itemStates,
				cartCount: cart.count,
				cartError,
				cartMessage,
				maxCartQuantity: MAX_CART_QUANTITY,
			});
		} catch (error) {
			console.error("Failed to load cart", error);
			res.status(502).render("cart", {
				title: "Shopping Cart | Cue Corner",
				cartCount: "?",
				cartError,
				loadError: true,
			});
		}
	}

	router.get("/", async (req, res) => {
		const messages: Record<string, string> = {
			added: "Product added to your cart.",
			updated: "Quantity updated.",
			removed: "Product removed from your cart.",
			incremented: "Quantity increased.",
			decremented: "Quantity decreased.",
		};
		const message =
			typeof req.query.notice === "string"
				? messages[req.query.notice]
				: undefined;
		const cartId = ensureCartId(req, res);
		await renderCart(res, cartId, 200, undefined, message);
	});

	for (const action of ["add", "update", "remove"] as const) {
		router.post(`/items/${action}`, async (req, res) => {
			const cartId = ensureCartId(req, res);
			const body = req.body as Record<string, unknown> | undefined;
			const { productId, quantity: rawQuantity } = body ?? {};
			const quantity =
				typeof rawQuantity === "string" && /^[1-9]\d*$/.test(rawQuantity)
					? Number(rawQuantity)
					: NaN;
			if (
				typeof productId !== "string" ||
				!productId.trim() ||
				(action !== "remove" &&
					(!Number.isSafeInteger(quantity) ||
						quantity < 1 ||
						quantity > MAX_CART_QUANTITY))
			) {
				await renderCart(
					res,
					cartId,
					400,
					`Choose a product and enter a whole-number quantity between 1 and ${MAX_CART_QUANTITY}.`,
				);
				return;
			}

			try {
				if (action === "remove") {
					await service.remove(cartId, productId);
				} else {
					await service[action](cartId, productId, quantity);
				}
				const notices = { add: "added", update: "updated", remove: "removed" };
				const query = new URLSearchParams({ notice: notices[action] });
				res.redirect(303, `/cart?${query.toString()}`);
			} catch (error) {
				console.error(`Failed to ${action} cart item`, error);
				const rejected =
					error instanceof CartApiError &&
					[400, 404, 409].includes(error.status);
				await renderCart(
					res,
					cartId,
					rejected ? error.status : 502,
					rejected
						? "This change could not be made. The product may be unavailable or the quantity may exceed the cart limit. Review your cart and try again."
						: "We couldn't confirm your cart change. Check the current cart before trying again.",
				);
			}
		});
	}

	router.post("/items/adjust/:productId/increment", async (req, res) => {
		const cartId = ensureCartId(req, res);
		const { productId } = req.params;

		if (typeof productId !== "string" || !productId.trim()) {
			await renderCart(
				res,
				cartId,
				400,
				"Invalid product ID.",
			);
			return;
		}

		try {
			const cart = await service.get(cartId);
			const item = cart.items.find((i) => i.productId === productId);

			if (!item) {
				await renderCart(
					res,
					cartId,
					404,
					"Product not found in cart.",
				);
				return;
			}

			const newQuantity = item.quantity + 1;

			if (newQuantity > MAX_CART_QUANTITY) {
				await renderCart(
					res,
					cartId,
					400,
					`Cannot exceed ${MAX_CART_QUANTITY} units per item.`,
				);
				return;
			}

			await service.update(cartId, productId, newQuantity);
			const query = new URLSearchParams({ notice: "incremented" });
			res.redirect(303, `/cart?${query.toString()}`);
		} catch (error) {
			console.error("Failed to increment cart item", error);
			const rejected =
				error instanceof CartApiError &&
				[400, 404, 409].includes(error.status);
			await renderCart(
				res,
				cartId,
				rejected ? error.status : 502,
				rejected
					? "This change could not be made. The product may be unavailable or the quantity may exceed the cart limit. Review your cart and try again."
					: "We couldn't confirm your cart change. Check the current cart before trying again.",
			);
		}
	});

	router.post("/items/adjust/:productId/decrement", async (req, res) => {
		const cartId = ensureCartId(req, res);
		const { productId } = req.params;

		if (typeof productId !== "string" || !productId.trim()) {
			await renderCart(
				res,
				cartId,
				400,
				"Invalid product ID.",
			);
			return;
		}

		try {
			const cart = await service.get(cartId);
			const item = cart.items.find((i) => i.productId === productId);

			if (!item) {
				await renderCart(
					res,
					cartId,
					404,
					"Product not found in cart.",
				);
				return;
			}

			const newQuantity = item.quantity - 1;

			if (newQuantity < 1) {
				await renderCart(
					res,
					cartId,
					400,
					"Quantity must be at least 1. Use Remove to delete the item.",
				);
				return;
			}

			await service.update(cartId, productId, newQuantity);
			const query = new URLSearchParams({ notice: "decremented" });
			res.redirect(303, `/cart?${query.toString()}`);
		} catch (error) {
			console.error("Failed to decrement cart item", error);
			const rejected =
				error instanceof CartApiError &&
				[400, 404, 409].includes(error.status);
			await renderCart(
				res,
				cartId,
				rejected ? error.status : 502,
				rejected
					? "This change could not be made. The product may be unavailable or the quantity may exceed the cart limit. Review your cart and try again."
					: "We couldn't confirm your cart change. Check the current cart before trying again.",
			);
		}
	});

	return router;
}
