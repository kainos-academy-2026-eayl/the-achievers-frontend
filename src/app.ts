import express, { type Express, type Request, type Response } from "express";
import nunjucks from "nunjucks";
import { ProductClient } from "./clients/productClient";
import {
	filterByCategory,
	getCategories,
	ProductService,
} from "./services/productService";

export function createApp(
	productService: Pick<ProductService, "getAll"> = new ProductService(
		new ProductClient(process.env.BACKEND_URL ?? "http://localhost:3001"),
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

	app.get("/", (_req: Request, res: Response) => {
		res.render("home-page", { title: "Cue Corner | Pool & Snooker Equipment" });
	});

	app.get("/shop", async (req: Request, res: Response) => {
		const title = "Shop | Cue Corner";
		const rawCategory = req.query.category;

		if (rawCategory !== undefined && typeof rawCategory !== "string") {
			return res.status(400).render("shop", {
				title,
				products: [],
				categories: [],
				invalidCategory: true,
			});
		}

		const selectedCategory = rawCategory?.trim() || undefined;

		try {
			const allProducts = await productService.getAll();
			const categories = getCategories(allProducts);
			const products = selectedCategory
				? filterByCategory(allProducts, selectedCategory)
				: allProducts;

			return res.render("shop", {
				title,
				products,
				categories,
				selectedCategory,
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
				`${process.env.BACKEND_URL ?? "http://localhost:3001"}/api/register`,
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
