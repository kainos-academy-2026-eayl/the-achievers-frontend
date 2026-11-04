import express, { type Express, type Request, type Response } from "express";
import nunjucks from "nunjucks";
import { registerAuth } from "./auth";
import { CartClient } from "./clients/cartClient";
import { ProductClient } from "./clients/productClient";
import {
	type CartOperations,
	createCartRouter,
	readCartId,
} from "./controllers/cartController";
import { CartService } from "./services/cartService";
import { MAX_QUERY_LENGTH, searchProducts } from "./services/productSearch";
import {
	filterByCategory,
	getCategories,
	ProductService,
} from "./services/productService";
const SAFE_WORD_QUESTIONS: Record<string, string> = {
	"mothers-maiden-name": "What is your mother's maiden name?",
	"favourite-movie": "What is your favourite movie?",
	"first-pet": "What was your first pet's name?",
	"childhood-friend": "What did you call your childhood bestfriend?",
	holiday: "What is your dream holiday location?",
};

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
	orderService: Pick<OrderService, "checkout" | "get"> = new OrderService(
		new OrderClient(
			process.env.API_BASE_URL ??
			process.env.BACKEND_URL ??
			"http://localhost:3000",
		),
	),
	adminProducts: Pick<ProductClient, "delete"> = new ProductClient(
		process.env.API_BASE_URL ??
		process.env.BACKEND_URL ??
		"http://localhost:3000",
	),
	checkoutService: CheckoutService = new CheckoutService(),
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

	registerAuth(
		app,
		process.env.API_BASE_URL ??
			process.env.BACKEND_URL ??
			"http://localhost:3000",
	);

	app.use("/cart", createCartRouter(cartService));

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

	app.get("/reset-pass/hint", async (req: Request, res: Response) => {
		res.set("Cache-Control", "no-store");
		const email =
			typeof req.query.email === "string" ? req.query.email.trim() : "";
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			return res.status(400).json({ error: "Enter a valid email address." });
		}

		try {
			const url = new URL(
				"/api/safe-word-hint",
				process.env.API_BASE_URL ??
				process.env.BACKEND_URL ??
				"http://localhost:3000",
			);
			url.searchParams.set("email", email);
			const backendResponse = await fetch(url, {
				signal: AbortSignal.timeout(5000),
			});
			const data: unknown =
				backendResponse.status === 200 ? await backendResponse.json() : null;
			const hint =
				typeof data === "object" &&
					data !== null &&
					"safeWordHint" in data &&
					typeof data.safeWordHint === "string"
					? data.safeWordHint
					: "";

			if (backendResponse.status !== 200 && backendResponse.status !== 404) {
				console.error(`Hint backend returned status ${backendResponse.status}.`);
				return res
					.status(502)
					.json({ error: "Unable to load your hint. Please try again." });
			}
			if (!Object.hasOwn(SAFE_WORD_QUESTIONS, hint)) {
				return res
					.status(404)
					.json({ error: "We couldn't find a hint for that email." });
			}
			return res.json({ question: SAFE_WORD_QUESTIONS[hint] });
		} catch (error) {
			console.error("Unable to reach the hint backend:", error);
			return res
				.status(502)
				.json({ error: "Unable to load your hint. Please try again." });
		}
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
				Object.hasOwn(SAFE_WORD_QUESTIONS, safeWordHint)
				? safeWordHint
				: "";

		if (
			!trimmedName ||
			!/^[^\s@]+@[^\s@]+$/.test(trimmedEmail) ||
			typeof password !== "string" ||
			!password ||
			typeof confirmPassword !== "string" ||
			!confirmPassword
		) {
			return res.status(400).render("registration", {
				title: "Register | Cue Corner",
				registrationError: true,
				registrationMessage:
					"Please provide a name, valid email address, password, and password confirmation.",
				name: trimmedName,
				email: trimmedEmail,
				safeWordHint: selectedHint,
			});
		}

		if (password !== confirmPassword) {
			return res.status(400).render("registration", {
				title: "Register | Cue Corner",
				registrationError: true,
				registrationMessage: "Your passwords do not match.",
				name: trimmedName,
				email: trimmedEmail,
				safeWordHint: selectedHint,
			});
		}

		if (!selectedHint || typeof safeWord !== "string" || !safeWord.trim()) {
			return res.status(400).render("registration", {
				title: "Register | Cue Corner",
				registrationError: true,
				registrationMessage:
					"Please choose a safe word hint and enter a safe word.",
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
