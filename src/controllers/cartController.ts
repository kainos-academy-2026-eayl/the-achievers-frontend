import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { CartApiError } from "../clients/cartClient";
import type { ShippingDestination } from "../models/shippingDestination";
import type { CartService } from "../services/cartService";

export type CartOperations = Pick<
	CartService,
	"get" | "add" | "update" | "remove"
>;

const MAX_CART_QUANTITY = 2_147_483_647;

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

	function renderAddressForm(
		res: Response,
		status = 200,
		cartError?: string,
	): void {
		res.set("Cache-Control", "no-store");
		res.status(status).render("cart", {
			title: "Shopping Cart | Cue Corner",
			cartCount: "?",
			addressRequired: true,
			cartError,
			maxCartQuantity: MAX_CART_QUANTITY,
		});
	}

	async function renderCart(
		res: Response,
		cartId: string,
		destination: ShippingDestination,
		status = 200,
		cartError?: string,
		cartMessage?: string,
	): Promise<void> {
		res.set("Cache-Control", "no-store");
		try {
			const cart = await service.get(cartId, destination);
			res.status(status).render("cart", {
				title: "Shopping Cart | Cue Corner",
				cart,
				cartCount: cart.count,
				shippingDestination: destination,
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
			"address-saved": "Delivery postcode confirmed.",
			added: "Product added to your cart.",
			updated: "Quantity updated.",
			removed: "Product removed from your cart.",
		};
		const message =
			typeof req.query.notice === "string"
				? messages[req.query.notice]
				: undefined;
		const cartId = ensureCartId(req, res);
		const destination = req.session.shippingDestination;
		if (!destination) {
			renderAddressForm(res);
			return;
		}
		await renderCart(res, cartId, destination, 200, undefined, message);
	});

	router.post("/delivery-address", (req, res) => {
		const body = req.body as Record<string, unknown> | undefined;
		const fullName = body?.fullName;
		const addressLine1 = body?.addressLine1;
		const city = body?.city;
		const postcode = body?.postcode;
		const isValidAddress = (
			value: unknown,
			maxLength: number,
		): value is string =>
			typeof value === "string" &&
			value.trim().length > 0 &&
			value.trim().length <= maxLength;

		if (
			!isValidAddress(fullName, 200) ||
			!isValidAddress(addressLine1, 200) ||
			!isValidAddress(city, 100) ||
			!isValidAddress(postcode, 10)
		) {
			renderAddressForm(
				res,
				400,
				"Enter your name, street address, town or city, and UK postcode.",
			);
			return;
		}

		req.session.shippingDestination = {
			country: "GB" as const,
			postcode: postcode.trim().toUpperCase(),
		};
		res.redirect(303, "/cart?notice=address-saved");
	});

	for (const action of ["add", "update", "remove"] as const) {
		router.post(`/items/${action}`, async (req, res) => {
			const cartId = ensureCartId(req, res);
			const body = req.body as Record<string, unknown> | undefined;
			const destination = req.session.shippingDestination;
			if (!destination) {
				renderAddressForm(
					res,
					400,
					"Enter your UK delivery address before changing your cart.",
				);
				return;
			}
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
					destination,
					400,
					`Choose a product and enter a whole-number quantity between 1 and ${MAX_CART_QUANTITY}.`,
				);
				return;
			}

			try {
				if (action === "remove") {
					await service.remove(cartId, productId, destination);
				} else {
					await service[action](cartId, productId, quantity, destination);
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
					destination,
					rejected ? error.status : 502,
					rejected
						? "This change could not be made. The product may be unavailable or the quantity may exceed the cart limit. Review your cart and try again."
						: "We couldn't confirm your cart change. Check the current cart before trying again.",
				);
			}
		});
	}
	return router;
}
