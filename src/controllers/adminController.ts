import { randomBytes } from "node:crypto";
import { Router } from "express";
import { ProductApiError, type ProductClient } from "../clients/productClient";
import { requireAdmin } from "../middleware/authMiddleware";
import { getCategories, type ProductService } from "../services/productService";

const title = "Admin dashboard | Cue Corner";

function deletePath(id: string): string {
	return `/admin/products/${encodeURIComponent(id)}/delete`;
}

export function createAdminRouter(
	products: Pick<ProductService, "getAll">,
	productClient: Pick<ProductClient, "delete">,
): Router {
	const router = Router();
	router.use((_req, res, next) => {
		res.set("Cache-Control", "no-store");
		next();
	});
	router.use(requireAdmin);

	router.get("/", async (req, res) => {
		try {
			const catalogue = await products.getAll();
			res.render("admin", {
				title,
				products: catalogue.map((product) => ({
					...product,
					deletePath: deletePath(product.id),
				})),
				categories: getCategories(catalogue),
				deleted: req.query.deleted === "1",
			});
		} catch (error) {
			console.error("Failed to load admin catalogue overview", error);
			res.status(502).render("admin", { title, loadError: true });
		}
	});

	router.get("/products/:id/delete", async (req, res) => {
		try {
			const product = (await products.getAll()).find(
				(product) => product.id === req.params.id,
			);
			if (!product) {
				res.status(404).render("admin-delete", {
					title,
					errorMessage: "Product not found. It may already have been deleted.",
				});
				return;
			}
			req.session.adminCsrfToken ??= randomBytes(32).toString("hex");
			res.render("admin-delete", {
				title,
				product,
				deletePath: deletePath(product.id),
				csrfToken: req.session.adminCsrfToken,
			});
		} catch (error) {
			console.error("Failed to load product deletion confirmation", error);
			res.status(502).render("admin-delete", {
				title,
				errorMessage: "Unable to load this product. Please try again.",
			});
		}
	});

	router.post("/products/:id/delete", async (req, res) => {
		const auth = req.session.auth;
		if (!auth) {
			res.redirect(303, "/login");
			return;
		}
		const csrfToken: unknown = req.body?.csrfToken;
		if (
			typeof csrfToken !== "string" ||
			!req.session.adminCsrfToken ||
			csrfToken !== req.session.adminCsrfToken
		) {
			console.warn("Rejected admin deletion with an invalid CSRF token");
			res.status(403).render("admin-delete", {
				title,
				errorMessage:
					"Invalid confirmation. Return to the dashboard and try again.",
			});
			return;
		}
		try {
			await productClient.delete(req.params.id, auth.accessToken);
			res.redirect(303, "/admin?deleted=1");
		} catch (error) {
			if (error instanceof ProductApiError) {
				if (error.status === 401) {
					delete req.session.auth;
					delete req.session.adminCsrfToken;
					res.redirect(303, "/login");
					return;
				}
				if (error.status === 403) {
					res.status(403).render("admin", { title, notAllowed: true });
					return;
				}
				if (error.status === 404) {
					res.status(404).render("admin-delete", {
						title,
						errorMessage:
							"Product not found. It may already have been deleted.",
					});
					return;
				}
			}
			console.error("Failed to delete product", error);
			res.status(502).render("admin-delete", {
				title,
				errorMessage: "Unable to delete this product. Please try again.",
			});
		}
	});

	return router;
}
