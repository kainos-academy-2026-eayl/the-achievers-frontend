import { type Request, type Response, Router } from "express";
import {
	OrderApiError,
	type ShippingAddressInput,
} from "../clients/orderClient";
import { ProfileApiError, type ProfileClient } from "../clients/profileClient";
import { readCartId } from "./cartController";
import type { CartService } from "../services/cartService";
import type { CheckoutService } from "../services/checkoutService";
import type { OrderService } from "../services/orderService";
import type { ProductService } from "../services/productService";

const title = "Checkout | Cue Corner";

type AddressValues = ShippingAddressInput;
type CheckoutBody = Record<string, unknown>;

const currency = new Intl.NumberFormat("en-GB", {
	style: "currency",
	currency: "GBP",
});

function getSessionAuth(req: Request) {
	return req.session.auth;
}

export function createCheckoutRouter(
	carts: Pick<CartService, "get">,
	profiles: Pick<ProfileClient, "get">,
	orders: Pick<OrderService, "checkout" | "get">,
	products: Pick<ProductService, "getAll">,
	checkout: Pick<
		CheckoutService,
		"getSavedAddresses" | "addressFromForm" | "getSavedAddress" | "validateForm"
	>,
): Router {
	const router = Router();

	async function renderCheckout(
		req: Request,
		res: Response,
		status = 200,
		formError?: string,
		fieldErrors: Record<string, string> = {},
		useDifferentAddress = false,
		values: AddressValues = {
			addressLine1: "",
			addressLine2: "",
			city: "",
			postcode: "",
		},
		selectedAddressId = "",
	): Promise<void> {
		const auth = getSessionAuth(req);
		if (!auth) {
			res.redirect(303, "/login");
			return;
		}
		const cartId = readCartId(req);
		if (!cartId) {
			res.redirect(303, "/cart");
			return;
		}
		try {
			const [cart, profile] = await Promise.all([
				carts.get(cartId),
				profiles.get(auth.accessToken),
			]);
			const availableAddresses = checkout.getSavedAddresses(profile);
			res.status(status).render("checkout", {
				title,
				cart,
				cartCount: cart.count,
				savedAddresses: availableAddresses,
				selectedAddressId: selectedAddressId || availableAddresses[0]?.id || "",
				creditBalance: currency.format(profile.creditBalance),
				useDifferentAddress: useDifferentAddress || !availableAddresses.length,
				values,
				formError,
				fieldErrors,
			});
		} catch (error) {
			if (error instanceof ProfileApiError && error.status === 401) {
				res.redirect(303, "/login");
				return;
			}
			console.error("Failed to load checkout", error);
			res.status(502).render("checkout", {
				title,
				loadError: true,
				cartCount: "?",
			});
		}
	}

	router.get("/checkout", async (req, res) => {
		res.set("Cache-Control", "no-store");
		await renderCheckout(req, res);
	});

	router.post("/checkout", async (req, res) => {
		res.set("Cache-Control", "no-store");
		const auth = getSessionAuth(req);
		if (!auth) {
			res.redirect(303, "/login");
			return;
		}
		const cartId = readCartId(req);
		if (!cartId) {
			res.redirect(303, "/cart");
			return;
		}
		const body = (req.body ?? {}) as CheckoutBody;
		const useDifferentAddress = body.useDifferentAddress === "yes";
		const selectedAddressId =
			typeof body.addressChoice === "string" ? body.addressChoice.trim() : "";
		const addressValues = checkout.addressFromForm(body);
		let shippingAddress: AddressValues | undefined;
		const fieldErrors = checkout.validateForm(
			body,
			useDifferentAddress,
			addressValues,
		);

		if (useDifferentAddress) {
			shippingAddress = addressValues;
		} else {
			try {
				const profile = await profiles.get(auth.accessToken);
				shippingAddress = checkout.getSavedAddress(profile, selectedAddressId);
				if (!shippingAddress) {
					fieldErrors.addressChoice =
						"Choose a saved address or enter a different address.";
				}
			} catch (error) {
				if (error instanceof ProfileApiError && error.status === 401) {
					res.redirect(303, "/login");
					return;
				}
				console.error("Failed to load the checkout address", error);
				await renderCheckout(
					req,
					res,
					502,
					"We couldn't load your saved address. Please try again or enter a different address.",
					{},
					useDifferentAddress,
					addressValues,
					selectedAddressId,
				);
				return;
			}
		}

		if (Object.keys(fieldErrors).length > 0 || !shippingAddress) {
			await renderCheckout(
				req,
				res,
				400,
				"Check the highlighted details before placing your order.",
				fieldErrors,
				useDifferentAddress,
				addressValues,
				selectedAddressId,
			);
			return;
		}

		try {
			const order = await orders.checkout(
				auth.accessToken,
				cartId,
				shippingAddress,
			);
			res.redirect(303, `/orders/${encodeURIComponent(order.id)}`);
		} catch (error) {
			if (error instanceof OrderApiError && error.status === 401) {
				res.redirect(303, "/login");
				return;
			}
			if (error instanceof OrderApiError) {
				if (error.status === 400 && error.message === "Cart is empty") {
					await renderCheckout(
						req,
						res,
						400,
						"Your cart is empty. Add items before placing an order.",
						{},
						useDifferentAddress,
						addressValues,
						selectedAddressId,
					);
					return;
				}
				const fieldErrors = Object.fromEntries(
					Object.entries(error.fieldErrors).map(([key, message]) => [
						key.replace("shippingAddress.", ""),
						message,
					]),
				);
				const status = [400, 409].includes(error.status) ? error.status : 502;
				await renderCheckout(
					req,
					res,
					status,
					error.status === 409
						? error.message
						: error.status === 400
							? "Check your shipping address and try again."
							: "We couldn't confirm your order. Please try again.",
					fieldErrors,
					useDifferentAddress,
					addressValues,
					selectedAddressId,
				);
				return;
			}
			console.error("Failed to place order", error);
			await renderCheckout(
				req,
				res,
				502,
				"We couldn't confirm your order. Please try again.",
				{},
				useDifferentAddress,
				addressValues,
				selectedAddressId,
			);
		}
	});

	router.get("/orders/:id", async (req, res) => {
		res.set("Cache-Control", "no-store");
		const auth = getSessionAuth(req);
		if (!auth) {
			res.redirect(303, "/login");
			return;
		}
		try {
			const order = await orders.get(auth.accessToken, req.params.id);
			let creditBalance: string | undefined;
			try {
				creditBalance = currency.format(
					(await profiles.get(auth.accessToken)).creditBalance,
				);
			} catch (error) {
				console.error(
					"Failed to refresh account credit after order placement",
					error,
				);
			}
			let productNames: string[] = [];
			try {
				productNames = (await products.getAll()).map((product) => product.name);
			} catch (error) {
				console.error(
					"Failed to refresh products after order placement",
					error,
				);
			}
			res.render("order-confirmation", {
				title: "Order Confirmation | Cue Corner",
				order,
				creditBalance,
				productNames,
				cartCount: 0,
			});
		} catch (error) {
			if (error instanceof OrderApiError && error.status === 401) {
				res.redirect(303, "/login");
				return;
			}
			if (error instanceof OrderApiError && error.status === 404) {
				res.status(404).render("order-confirmation", {
					title: "Order Confirmation | Cue Corner",
					notFound: true,
					cartCount: 0,
				});
				return;
			}
			console.error("Failed to load order confirmation", error);
			res.status(502).render("order-confirmation", {
				title: "Order Confirmation | Cue Corner",
				loadError: true,
				cartCount: 0,
			});
		}
	});

	return router;
}
