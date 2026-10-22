import express, { type Express, type Request, type Response } from "express";
import nunjucks from "nunjucks";
import { CartClient } from "./clients/cartClient";
import { ProductClient } from "./clients/productClient";
import {
	type CartOperations,
	createCartRouter,
	readCartId,
} from "./controllers/cartController";
import { CartService } from "./services/cartService";
import { ProductService } from "./services/productService";

export function createApp(
	productService: Pick<ProductService, "getAll"> = new ProductService(
		new ProductClient(process.env.BACKEND_URL ?? "http://localhost:3000"),
	),
	cartService: CartOperations = new CartService(
		new CartClient(process.env.BACKEND_URL ?? "http://localhost:3000"),
	),
): Express {
	const app = express();

	app.use(express.static("public"));
	app.use(express.urlencoded({ extended: false, limit: "10kb" }));

	nunjucks.configure("views", {
		autoescape: true,
		express: app,
		// tsx watch only restarts on .ts changes, so templates must not be cached in dev.
		noCache: process.env.NODE_ENV !== "production",
	});
	app.set("view engine", "njk");

	app.use(async (req, res, next) => {
		if (
			req.method !== "GET" ||
			!["/", "/shop", "/login", "/registration", "/reset-pass"].includes(
				req.path,
			)
		) {
			next();
			return;
		}
		res.set("Cache-Control", "no-store");
		const cartId = readCartId(req);
		if (cartId) {
			try {
				res.locals.cartCount = (await cartService.get(cartId)).count;
			} catch (error) {
				console.error("Failed to load cart count", error);
				res.locals.cartCount = "?";
			}
		}
		next();
	});

	app.use("/cart", createCartRouter(cartService));

	app.get("/", async (_req: Request, res: Response) => {
		const title = "Cue Corner | Pool & Snooker Equipment";
		try {
			const products = (await productService.getAll()).slice(0, 4);
			res.render("home-page", { title, products });
		} catch (error) {
			console.error("Failed to load featured products", error);
			res.status(502).render("home-page", {
				title,
				products: [],
				loadError: true,
			});
		}
	});

	app.get("/shop", async (_req: Request, res: Response) => {
		const title = "Shop | Cue Corner";
		try {
			const products = await productService.getAll();
			res.render("shop", { title, products });
		} catch (error) {
			console.error("Failed to load products", error);
			res.status(502).render("shop", { title, products: [], loadError: true });
		}
	});

	app.get("/login", (_req: Request, res: Response) => {
		res.render("login", { title: "Login | Cue Corner" });
	});

	app.get("/reset-pass", (_req: Request, res: Response) => {
		res.render("reset-pass", { title: "Reset Password | Cue Corner" });
	});

	app.get("/registration", (_req: Request, res: Response) => {
		res.render("registration", { title: "Register | Cue Corner" });
	});

	app.post("/registration", async (req: Request, res: Response) => {
		const { name, email, password } = req.body ?? {};
		const trimmedName = typeof name === "string" ? name.trim() : "";
		const trimmedEmail = typeof email === "string" ? email.trim() : "";

		if (
			!trimmedName ||
			!/^[^\s@]+@[^\s@]+$/.test(trimmedEmail) ||
			typeof password !== "string" ||
			!password
		) {
			return res.status(400).render("registration", {
				title: "Register | Cue Corner",
				registrationError: true,
				registrationMessage:
					"Please provide a name, valid email address, and password.",
				name: trimmedName,
				email: trimmedEmail,
			});
		}

		try {
			const backendResponse = await fetch(
				`${process.env.BACKEND_URL ?? "http://localhost:3000"}/api/register`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						name: trimmedName,
						email: trimmedEmail,
						password,
					}),
				},
			);

			if (!backendResponse.ok) {
				console.error(
					`Registration backend returned status ${backendResponse.status}.`,
				);
				return res.status(502).render("registration", {
					title: "Register | Cue Corner",
					registrationError: true,
					registrationMessage:
						"The registration service could not complete your request. Please try again.",
					name: trimmedName,
					email: trimmedEmail,
				});
			}
		} catch (error) {
			console.error("Unable to reach the registration backend:", error);
			return res.status(502).render("registration", {
				title: "Register | Cue Corner",
				registrationError: true,
				registrationMessage:
					"The registration service is unavailable. Please try again.",
				name: trimmedName,
				email: trimmedEmail,
			});
		}

		return res.status(202).render("registration", {
			title: "Register | Cue Corner",
			registrationMessage: "Your registration details were received.",
		});
	});

	app.get("/health", (_req: Request, res: Response) => {
		res.json({ status: "ok", uptime: process.uptime() });
	});

	return app;
}
