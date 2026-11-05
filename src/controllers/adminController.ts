import { randomBytes } from "node:crypto";
import {
	type NextFunction,
	type Request,
	type Response,
	Router,
} from "express";
import multer from "multer";
import {
	type ImageUpload,
	ProductApiError,
	type ProductClient,
} from "../clients/productClient";
import { requireAdmin } from "../middleware/authMiddleware";
import { parseSingleImage } from "../middleware/imageUpload";
import { productImagePath } from "../models/productViewModel";
import { getCategories, type ProductService } from "../services/productService";
import {
	type ProductFieldErrors,
	type ProductEditFieldErrors,
	validateProductEditInput,
	validateProductInput,
} from "../services/productValidation";

const title = "Admin dashboard | Cue Corner";

const imageNotices: Record<string, string> = {
	uploaded: "Image uploaded.",
	replaced: "Image replaced.",
	removed: "Image removed.",
};

const imageErrors: Record<string, string> = {
	missing: "Choose an image file to upload.",
	unsupported: "Choose a JPEG, PNG or WebP image.",
	"too-large": "Images must be 20 MB or smaller.",
	"not-found": "This image no longer exists. Reload the page and try again.",
	"invalid-form": "Invalid form session. Reload the page and try again.",
	failed: "We could not save the image. Check the product and try again.",
};

function messageFor(
	messages: Record<string, string>,
	code: unknown,
): string | undefined {
	return typeof code === "string" && Object.hasOwn(messages, code)
		? messages[code]
		: undefined;
}

function imageErrorCode(error: unknown): string {
	if (error instanceof multer.MulterError) {
		return error.code === "LIMIT_FILE_SIZE" ? "too-large" : "missing";
	}
	return "failed";
}

function deletePath(id: string): string {
	return `/admin/products/${encodeURIComponent(id)}/delete`;
}

type ProductParams = { id: string };
type ImageParams = ProductParams & { imageId: string };

function imagesPath(id: string): string {
	return `/admin/products/${encodeURIComponent(id)}/images`;
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
		| "delete"
		| "create"
		| "getForEdit"
		| "update"
		| "uploadImage"
		| "replaceImage"
		| "deleteImage"
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
			const { values, images } = await productClient.getForEdit(req.params.id);
			res.render("admin-edit", {
				title: "Edit product | Cue Corner",
				values,
				images: images.map((image) => ({
					id: image.id,
					url: productImagePath(req.params.id, image.id),
					replacePath: `${imagesPath(req.params.id)}/${encodeURIComponent(image.id)}/replace`,
					deletePath: `${imagesPath(req.params.id)}/${encodeURIComponent(image.id)}/delete`,
				})),
				imageUploadPath: imagesPath(req.params.id),
				imageNotice: messageFor(imageNotices, req.query.image),
				imageError: messageFor(imageErrors, req.query.imageError),
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

	function toImageUpload(file: NonNullable<Request["file"]>): ImageUpload {
		return {
			buffer: file.buffer,
			mimeType: file.mimetype,
			filename: file.originalname,
		};
	}

	function redirectWithImageCode(
		req: Request<ProductParams>,
		res: Response,
		code: string,
	): void {
		const key = Object.hasOwn(imageNotices, code) ? "image" : "imageError";
		res.redirect(303, `${editPath(req.params.id)}?${key}=${code}`);
	}

	function parseImageForm(
		req: Request<ProductParams>,
		res: Response,
		next: NextFunction,
	) {
		parseSingleImage(req, res, (error: unknown) => {
			if (error) {
				redirectWithImageCode(req, res, imageErrorCode(error));
				return;
			}
			next();
		});
	}

	async function runImageChange<P extends ProductParams>(
		req: Request<P>,
		res: Response,
		change: (accessToken: string) => Promise<string>,
	): Promise<void> {
		const auth = req.session.auth;
		if (!auth) {
			res.redirect(303, "/login");
			return;
		}
		if (!hasValidCsrfToken(req)) {
			console.warn("Rejected product image change with an invalid CSRF token");
			redirectWithImageCode(req, res, "invalid-form");
			return;
		}
		try {
			redirectWithImageCode(req, res, await change(auth.accessToken));
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
					redirectWithImageCode(req, res, "not-found");
					return;
				}
				if (error.status === 400) {
					redirectWithImageCode(req, res, "unsupported");
					return;
				}
				if (error.status === 413) {
					redirectWithImageCode(req, res, "too-large");
					return;
				}
			}
			console.error("Failed to change product image", error);
			redirectWithImageCode(req, res, "failed");
		}
	}

	router.post(
		"/products/:id/images",
		parseImageForm,
		(req: Request<ProductParams>, res) =>
			runImageChange(req, res, async (accessToken) => {
				const file = req.file;
				if (!file) {
					return "missing";
				}
				await productClient.uploadImage(
					req.params.id,
					toImageUpload(file),
					accessToken,
				);
				return "uploaded";
			}),
	);

	router.post(
		"/products/:id/images/:imageId/replace",
		parseImageForm,
		(req: Request<ImageParams>, res) =>
			runImageChange(req, res, async (accessToken) => {
				const file = req.file;
				if (!file) {
					return "missing";
				}
				await productClient.replaceImage(
					req.params.id,
					req.params.imageId,
					toImageUpload(file),
					accessToken,
				);
				return "replaced";
			}),
	);

	router.post("/products/:id/images/:imageId/delete", (req, res) =>
		runImageChange(req, res, async (accessToken) => {
			await productClient.deleteImage(
				req.params.id,
				req.params.imageId,
				accessToken,
			);
			return "removed";
		}),
	);

	return router;
}
