import express, { type Express, type Request, type Response } from "express";
import nunjucks from "nunjucks";
import { registerAuth } from "./auth";
import { CartClient } from "./clients/cartClient";
import { ProductClient } from "./clients/productClient";
import { ProfileClient } from "./clients/profileClient";
import {
	type CartOperations,
	createCartRouter,
	readCartId,
} from "./controllers/cartController";
import {
	createProfileRouter,
	type ProfileOperations,
} from "./controllers/profileController";
import { requireAdmin, requireAuth } from "./middleware/authMiddleware";
import { CartService } from "./services/cartService";
import { MAX_QUERY_LENGTH, searchProducts } from "./services/productSearch";
import {
	filterByCategory,
	getCategories,
	ProductService,
} from "./services/productService";
export function createApp(
	productService: Pick<ProductService, "getAll"> = new ProductService(
		new ProductClient(
			process.env.API_BASE_URL ??
				process.env.BACKEND_URL ??
				"http://localhost:3000",
		),
	),
	cartService: CartOperations = new CartService(
		new CartClient(
			process.env.API_BASE_URL ??
				process.env.BACKEND_URL ??
				"http://localhost:3000",
		),
	),
	profileService: ProfileOperations = new ProfileClient(
		process.env.API_BASE_URL ??
			process.env.BACKEND_URL ??
			"http://localhost:3000",
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

	registerAuth(
		app,
		process.env.API_BASE_URL ??
			process.env.BACKEND_URL ??
			"http://localhost:3000",
	);

	app.use(async (req, res, next) => {
		if (
			req.method !== "GET" ||
			![
				"/",
				"/shop",
				"/login",
				"/registration",
				"/reset-pass",
				"/admin",
				"/profile",
			].includes(req.path)
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
	app.use("/profile", requireAuth, createProfileRouter(profileService));

	app.get("/admin", requireAdmin, async (_req: Request, res: Response) => {
		res.set("Cache-Control", "no-store");
		const title = "Admin dashboard | Cue Corner";
		try {
			const products = await productService.getAll();
			return res.render("admin", {
				title,
				products,
				categories: getCategories(products),
			});
		} catch (error) {
			console.error("Failed to load admin catalogue overview", error);
			return res.status(502).render("admin", { title, loadError: true });
		}
	});

	app.get("/", async (_req: Request, res: Response) => {
		const title = "Cue Corner | Pool & Snooker Equipment";
		try {
			const allProducts = await productService.getAll();
			res.render("home-page", {
				title,
				products: allProducts.slice(0, 4),
				productNames: allProducts.map((product) => product.name),
			});
		} catch (error) {
			console.error("Failed to load featured products", error);
			res.status(502).render("home-page", {
				title,
				products: [],
				loadError: true,
			});
		}
	});

	app.get("/categories", async (_req: Request, res: Response) => {
		const title = "Categories | Cue Corner";
		try {
			const allProducts = await productService.getAll();
			res.render("categories", {
				title,
				categories: getCategories(allProducts),
			});
		} catch (error) {
			console.error("Failed to load categories", error);
			res.status(502).render("categories", { title, loadError: true });
		}
	});

	app.get("/shop", async (req: Request, res: Response) => {
		const title = "Shop | Cue Corner";
		const rawCategory = req.query.category;
		const rawQuery = req.query.q;

		if (rawCategory !== undefined && typeof rawCategory !== "string") {
			return res.status(400).render("shop", {
				title,
				products: [],
				categories: [],
				invalidCategory: true,
			});
		}

		if (rawQuery !== undefined && typeof rawQuery !== "string") {
			return res.status(400).render("shop", {
				title,
				products: [],
				categories: [],
				invalidSearch: true,
			});
		}

		const selectedCategory = rawCategory?.trim() || undefined;
		const searchQuery =
			rawQuery?.trim().slice(0, MAX_QUERY_LENGTH) || undefined;

		try {
			const allProducts = await productService.getAll();
			const categories = getCategories(allProducts);
			const inCategory = selectedCategory
				? filterByCategory(allProducts, selectedCategory)
				: allProducts;
			const products = searchQuery
				? searchProducts(inCategory, searchQuery)
				: inCategory;

			return res.render("shop", {
				title,
				products,
				categories,
				selectedCategory,
				searchQuery,
				productNames: allProducts.map((product) => product.name),
			});
		} catch (error) {
			console.error("Failed to load products", error);
			return res.status(502).render("shop", {
				title,
				products: [],
				categories: [],
				loadError: true,
			});
		}
	});

	app.get("/reset-pass", (_req: Request, res: Response) => {
		res.render("reset-pass", { title: "Reset Password | Cue Corner" });
	});

	app.get("/registration", (_req: Request, res: Response) => {
		res.render("registration", { title: "Register | Cue Corner" });
	});

	app.post("/registration", async (req: Request, res: Response) => {
		const { name, email, password, confirmPassword, safeWordHint, safeWord } =
			req.body ?? {};
		const trimmedName = typeof name === "string" ? name.trim() : "";
		const trimmedEmail = typeof email === "string" ? email.trim() : "";
		const selectedHint =
			typeof safeWordHint === "string" &&
			[
				"mothers-maiden-name",
				"favourite-movie",
				"first-pet",
				"childhood-friend",
				"holiday",
			].includes(safeWordHint)
				? safeWordHint
				: "";

		const errors: string[] = [];
		if (!trimmedName) {
			errors.push("Enter your name.");
		}
		if (!trimmedEmail) {
			errors.push("Enter your email address.");
		} else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
			errors.push("Enter a valid email address, for example name@example.com.");
		}
		if (typeof password !== "string" || !password) {
			errors.push("Enter a password.");
		} else if (password.length < 12) {
			errors.push("Your password must be at least 12 characters long.");
		} else if (password.length > 128) {
			errors.push("Your password must be no more than 128 characters long.");
		}
		if (typeof confirmPassword !== "string" || !confirmPassword) {
			errors.push("Confirm your password.");
		} else if (password !== confirmPassword) {
			errors.push("Your passwords do not match.");
		}
		if (!selectedHint) {
			errors.push("Choose a safe word hint.");
		}
		if (typeof safeWord !== "string" || !safeWord.trim()) {
			errors.push("Enter a safe word.");
		}

		if (errors.length > 0) {
			return res.status(400).render("registration", {
				title: "Register | Cue Corner",
				registrationError: true,
				registrationMessage: "Please fix the following:",
				registrationErrors: errors,
				name: trimmedName,
				email: trimmedEmail,
				safeWordHint: selectedHint,
			});
		}

		try {
			const backendResponse = await fetch(
				`${process.env.API_BASE_URL ?? process.env.BACKEND_URL ?? "http://localhost:3000"}/api/register`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						name: trimmedName,
						email: trimmedEmail,
						password,
						safeWordHint: selectedHint,
						safeWord,
					}),
				},
			);

			if (backendResponse.status === 409) {
				return res.status(409).render("registration", {
					title: "Register | Cue Corner",
					registrationError: true,
					registrationMessage:
						"An account with this email already exists. Try logging in instead.",
					name: trimmedName,
					email: trimmedEmail,
					safeWordHint: selectedHint,
				});
			}

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
					safeWordHint: selectedHint,
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
				safeWordHint: selectedHint,
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
