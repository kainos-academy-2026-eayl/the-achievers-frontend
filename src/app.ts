import express, { type Express, type Request, type Response } from "express";
import nunjucks from "nunjucks";
import { ProductClient } from "./clients/productClient";
import { ProductService } from "./services/productService";

export function createApp(
	productService: Pick<ProductService, "getAll"> = new ProductService(
		new ProductClient(process.env.BACKEND_URL ?? "http://localhost:3000"),
	),
): Express {
	const app = express();

	app.use(express.static("public"));

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

	app.get("/registration", (_req: Request, res: Response) => {
		res.render("registration", { title: "Register | Cue Corner" });
	});

	app.get("/health", (_req: Request, res: Response) => {
		res.json({ status: "ok", uptime: process.uptime() });
	});

	return app;
}
