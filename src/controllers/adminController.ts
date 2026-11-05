import { randomBytes } from "node:crypto";
import { type Request, Router } from "express";
import { ProductApiError, type ProductClient } from "../clients/productClient";
import { requireAdmin } from "../middleware/authMiddleware";
import { getCategories, type ProductService } from "../services/productService";
import {
	type ProductFieldErrors,
	type ProductEditFieldErrors,
	validateProductEditInput,
	validateProductInput,
} from "../services/productValidation";

const title = "Admin dashboard | Cue Corner";

function deletePath(id: string): string {
	return `/admin/products/${encodeURIComponent(id)}/delete`;
}

function editPath(id: string): string {
	return `/admin/products/${encodeURIComponent(id)}/edit`;
}

function getCsrfToken(req: Request): string {
	req.session.adminCsrfToken ??= randomBytes(32).toString("hex");
	return req.session.adminCsrfToken;
}

function hasValidCsrfToken(req: Request): boolean {
	const token: unknown = req.body?.csrfToken;
	return (
		typeof token === "string" &&
		typeof req.session.adminCsrfToken === "string" &&
		token === req.session.adminCsrfToken
	);
}

export function createAdminRouter(
	products: Pick<ProductService, "getAll">,
	productClient: Pick<
		ProductClient,
		"delete" | "create" | "getForEdit" | "update"
	>,
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
					editPath: editPath(product.id),
				})),
				categories: getCategories(catalogue),
				deleted: req.query.deleted === "1",
				created: req.query.created === "1",
				updated: req.query.updated === "1",
			});
		} catch (error) {
			console.error("Failed to load admin catalogue overview", error);
			res.status(502).render("admin", { title, loadError: true });
		}
	});

	router.get("/products/new", (req, res) => {
		res.render("admin-create", {
			title: "Create product | Cue Corner",
			values: {},
			csrfToken: getCsrfToken(req),
		});
	});

	router.post("/products", async (req, res) => {
		const auth = req.session.auth;
		if (!auth) {
			res.redirect(303, "/login");
			return;
		}
		const { values, fieldErrors } = validateProductInput(req.body);
		const renderErrors = (
			status: number,
			formError: string,
			errors: ProductFieldErrors = {},
		) =>
			res.status(status).render("admin-create", {
				title: "Create product | Cue Corner",
				values,
				fieldErrors: errors,
				formError,
				csrfToken: getCsrfToken(req),
			});
		if (!hasValidCsrfToken(req)) {
			console.warn("Rejected product creation with an invalid CSRF token");
			renderErrors(
				403,
				"Invalid form session. Review your details and submit again.",
			);
			return;
		}
		if (Object.keys(fieldErrors).length > 0) {
			renderErrors(400, "Please fix the errors below.", fieldErrors);
			return;
		}
		try {
			await productClient.create(values, auth.accessToken);
			res.redirect(303, "/admin?created=1");
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
				if (error.status === 400) {
					renderErrors(400, "Please fix the errors below.", error.fieldErrors);
					return;
				}
			}
			console.error("Failed to create product", error);
			renderErrors(
				502,
				"We could not confirm that your product was saved. Check the catalogue before trying again.",
			);
		}
	});

	router.get("/products/:id/edit", async (req, res) => {
		try {
			const values = await productClient.getForEdit(req.params.id);
			res.render("admin-edit", {
				title: "Edit product | Cue Corner",
				values,
				editPath: editPath(req.params.id),
				csrfToken: getCsrfToken(req),
			});
		} catch (error) {
			if (error instanceof ProductApiError && error.status === 404) {
				res.status(404).render("admin-edit", {
					title: "Edit product | Cue Corner",
					loadError: "Product not found. It may have been deleted.",
				});
				return;
			}
			console.error("Failed to load product for editing", error);
			res.status(502).render("admin-edit", {
				title: "Edit product | Cue Corner",
				loadError:
					"Unable to load this product. Return to the catalogue and try again.",
			});
		}
	});

	router.post("/products/:id/edit", async (req, res) => {
		const auth = req.session.auth;
		if (!auth) {
			res.redirect(303, "/login");
			return;
		}
		const { values, fieldErrors } = validateProductEditInput(req.body);
		const renderErrors = (
			status: number,
			formError: string,
			errors: ProductEditFieldErrors = {},
		) =>
			res.status(status).render("admin-edit", {
				title: "Edit product | Cue Corner",
				values,
				editPath: editPath(req.params.id),
				fieldErrors: errors,
				formError,
				csrfToken: getCsrfToken(req),
			});
		if (!hasValidCsrfToken(req)) {
			console.warn("Rejected product update with an invalid CSRF token");
			renderErrors(
				403,
				"Invalid form session. Review your details and submit again.",
			);
			return;
		}
		if (Object.keys(fieldErrors).length > 0) {
			renderErrors(400, "Please fix the errors below.", fieldErrors);
			return;
		}
		try {
			await productClient.update(req.params.id, values, auth.accessToken);
			res.redirect(303, "/admin?updated=1");
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
					res.status(404).render("admin-edit", {
						title: "Edit product | Cue Corner",
						loadError: "Product not found. It may have been deleted.",
					});
					return;
				}
				if (error.status === 400) {
					renderErrors(400, "Please fix the errors below.", error.fieldErrors);
					return;
				}
			}
			console.error("Failed to update product", error);
			renderErrors(
				502,
				"We could not confirm that your product was saved. Check the catalogue before trying again.",
			);
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
			res.render("admin-delete", {
				title,
				product,
				deletePath: deletePath(product.id),
				csrfToken: getCsrfToken(req),
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
		if (!hasValidCsrfToken(req)) {
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
