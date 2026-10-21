import express, { type Express, type Request, type Response } from "express";
import nunjucks from "nunjucks";
import { getProducts } from "./data/products";
import { buildCatalogue } from "./services/product-service";

const MAX_QUERY_LENGTH = 100;

function queryString(value: unknown): string {
	return typeof value === "string"
		? value.trim().slice(0, MAX_QUERY_LENGTH)
		: "";
}

export function createApp(loadProducts: () => unknown = getProducts): Express {
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

	app.get("/shop", (req: Request, res: Response) => {
		const filters = {
			q: queryString(req.query.q),
			category: queryString(req.query.category),
		};
		const catalogue = buildCatalogue(loadProducts(), filters);
		res.render("shop", { title: "Shop | Cue Corner", filters, ...catalogue });
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
