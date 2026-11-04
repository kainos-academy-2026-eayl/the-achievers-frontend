import { Router } from "express";

const title = "Terms & Conditions | Cue Corner";

export function createTermsRouter(): Router {
	const router = Router();

	router.get("/", (_req, res) => {
		res.render("terms-and-conditions", {
			title,
		});
	});

	return router;
}
