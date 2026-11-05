import express, { type Express, type Request, type Response } from "express";
import nunjucks from "nunjucks";
import { registerAuth } from "./auth";
import { CartClient } from "./clients/cartClient";
import { OrderClient } from "./clients/orderClient";
import { ProductClient } from "./clients/productClient";
import { ProfileClient } from "./clients/profileClient";
import { ResetPasswordClient } from "./clients/resetPasswordClient";
import { ReviewClient } from "./clients/reviewClient";
import { createAdminRouter } from "./controllers/adminController";
import { createAboutRouter } from "./controllers/aboutController";
import {
	type CartOperations,
	createCartRouter,
	readCartId,
} from "./controllers/cartController";
import { createCheckoutRouter } from "./controllers/checkoutController";
import { createContactRouter } from "./controllers/contactController";
import { createOrderHistoryRouter } from "./controllers/orderHistoryController";
import {
	createProfileRouter,
	type ProfileOperations,
} from "./controllers/profileController";
import { createTermsRouter } from "./controllers/termsController";
import {
	createResetPasswordRouter,
	type ResetPasswordOperations,
} from "./controllers/resetPasswordController";
import { requireAuth } from "./middleware/authMiddleware";
import { CartService } from "./services/cartService";
import { CheckoutService } from "./services/checkoutService";
import { OrderService } from "./services/orderService";
import { MAX_QUERY_LENGTH, searchProducts } from "./services/productSearch";
import {
	filterByCategory,
	getCategories,
	ProductService,
} from "./services/productService";
import { ReviewService } from "./services/reviewService";

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
	orderService: Pick<
		OrderService,
		"checkout" | "get" | "list"
	> = new OrderService(
		new OrderClient(
			process.env.API_BASE_URL ??
				process.env.BACKEND_URL ??
				"http://localhost:3000",
		),
	),
	adminProducts: Pick<
		ProductClient,
		"delete" | "create" | "getForEdit" | "update"
	> = new ProductClient(
		process.env.API_BASE_URL ??
			process.env.BACKEND_URL ??
			"http://localhost:3000",
	),
	checkoutService: CheckoutService = new CheckoutService(),
	resetPasswordService: ResetPasswordOperations = new ResetPasswordClient(
		process.env.API_BASE_URL ??
			process.env.BACKEND_URL ??
			"http://localhost:3000",
	),
	reviewService: Pick<ReviewService, "listMine" | "save"> = new ReviewService(
		new ReviewClient(
			process.env.API_BASE_URL ??
				process.env.BACKEND_URL ??
				"http://localhost:3000",
		),
	),
): Express {
	const app = express();

	app.use(express.static("public"));
	app.use(express.urlencoded({ extended: false, limit: "10kb" }));

	const env = nunjucks.configure("views", {
		autoescape: true,
		express: app,
		// tsx watch only restarts on .ts changes, so templates must not be cached in dev.
		noCache: process.env.NODE_ENV !== "production",
	});

	env.addFilter("findBy", (arr: unknown[], key: string, value: unknown) => {
		if (!Array.isArray(arr)) return null;
		return (
			arr.find(
				(item) =>
					item &&
					typeof item === "object" &&
					(item as Record<string, unknown>)[key] === value,
			) || null
		);
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
				"/orders",
				"/about",
				"/contact",
				"/terms",
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
	app.use(["/checkout", "/orders"], requireAuth);
	app.use(
		createOrderHistoryRouter(
			orderService,
			reviewService,
			cartService,
			productService,
		),
	);
	app.use(
		createCheckoutRouter(
			cartService,
			profileService,
			orderService,
			productService,
			checkoutService,
		),
	);

	app.use("/about", createAboutRouter());
	app.use("/contact", createContactRouter());
	app.use("/terms", createTermsRouter());
	app.use("/admin", createAdminRouter(productService, adminProducts));
	app.use("/reset-pass", createResetPasswordRouter(resetPasswordService));

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

	// POST so the other form fields never end up in the URL; GET stays for direct links.
	const showResetHint = async (req: Request, res: Response) => {
		res.set("Cache-Control", "no-store");
		const raw = req.method === "POST" ? req.body?.email : req.query.email;
		const email = typeof raw === "string" ? raw.trim() : "";
		const renderHint = (
			status: number,
			hintMessage: string,
			hintError = true,
		) =>
			res.status(status).render("reset-pass", {
				title: "Reset Password | Cue Corner",
				email,
				hintMessage,
				hintError,
			});
		if (!email) {
			return renderHint(
				400,
				"Enter your email address above to see your hint.",
			);
		}
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			return renderHint(400, "Enter a valid email address.");
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
				console.error(
					`Hint backend returned status ${backendResponse.status}.`,
				);
				return renderHint(502, "Unable to load your hint. Please try again.");
			}
			if (!Object.hasOwn(SAFE_WORD_QUESTIONS, hint)) {
				return renderHint(
					404,
					"There is no account linked to that email. Use an email that is linked to an existing account.",
				);
			}
			return renderHint(200, SAFE_WORD_QUESTIONS[hint] as string, false);
		} catch (error) {
			console.error("Unable to reach the hint backend:", error);
			return renderHint(502, "Unable to load your hint. Please try again.");
		}
	};
	app.get("/reset-pass/hint", showResetHint);
	app.post("/reset-pass/hint", showResetHint);

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
