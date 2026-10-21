import express, { type Express, type Request, type Response } from "express";
import nunjucks from "nunjucks";

export function createApp(): Express {
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

	app.get("/login", (_req: Request, res: Response) => {
		res.render("login", { title: "Login | Cue Corner" });
	});

	app.get("/reset-pass", (_req: Request, res: Response) => {
		res.render("reset-pass", { title: "Reset Password | Cue Corner" });
	});

	app.get("/registration", (_req: Request, res: Response) => {
		res.render("registration", { title: "Register | Cue Corner" });
	});

	app.get("/health", (_req: Request, res: Response) => {
		res.json({ status: "ok", uptime: process.uptime() });
	});

	return app;
}
