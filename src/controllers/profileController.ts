import { type Request, type Response, Router } from "express";
import {
	type FieldErrors,
	ProfileApiError,
	type ProfileClient,
	type ProfileUpdate,
} from "../clients/profileClient";
import { ProfileFormHelper } from "../helpers/profileFormHelper";

export type ProfileOperations = Pick<ProfileClient, "get" | "update">;

const title = "My Profile | Cue Corner";
const form = new ProfileFormHelper();

function renderLoggedOut(res: Response): void {
	res.status(401).render("profile", { title, notLoggedIn: true });
}

function getAuth(req: Request, res: Response) {
	return res.locals.currentUser ? req.session.auth : undefined;
}

export function createProfileRouter(profiles: ProfileOperations): Router {
	const router = Router();

	router.use((_req: Request, res: Response, next) => {
		res.set("Cache-Control", "no-store");
		next();
	});

	router.get("/", async (req: Request, res: Response) => {
		const auth = getAuth(req, res);
		if (!auth) {
			renderLoggedOut(res);
			return;
		}
		try {
			const profile = await profiles.get(auth.accessToken);
			res.render("profile", {
				title,
				account: form.accountSummary(profile),
				values: form.profileToForm(profile),
				updated: req.query.updated === "1",
			});
		} catch (error) {
			if (error instanceof ProfileApiError && error.status === 401) {
				renderLoggedOut(res);
				return;
			}
			console.error("Failed to load profile", error);
			res.status(502).render("profile", { title, loadError: true });
		}
	});

	router.post("/", async (req: Request, res: Response) => {
		const auth = getAuth(req, res);
		if (!auth) {
			renderLoggedOut(res);
			return;
		}
		const body: Record<string, unknown> = req.body ?? {};
		const values = form.bodyToForm(body);
		const update: ProfileUpdate = {
			name: values.name ?? "",
			email: values.email ?? "",
			phone: values.phone ?? "",
			homeAddress: form.formToAddress(values, "home"),
			otherAddresses: [
				form.formToAddress(values, "other0"),
				form.formToAddress(values, "other1"),
			],
			currentPassword:
				typeof body.currentPassword === "string" ? body.currentPassword : "",
		};

		const renderErrors = (
			status: number,
			fieldErrors: FieldErrors,
			formError?: string,
		) =>
			res.status(status).render("profile", {
				title,
				account: form.accountSummary(auth.user),
				values,
				fieldErrors: form.toFormErrors(fieldErrors),
				formError:
					formError ??
					"Your changes have not been saved. Please fix the errors below.",
			});

		try {
			const saved = await profiles.update(auth.accessToken, update);
			auth.user = { ...auth.user, name: saved.name, email: saved.email };
			res.redirect(303, "/profile?updated=1");
		} catch (error) {
			if (error instanceof ProfileApiError) {
				if (error.status === 401) {
					renderLoggedOut(res);
					return;
				}
				if (
					(error.status === 400 || error.status === 409) &&
					Object.keys(error.fieldErrors).length > 0
				) {
					renderErrors(error.status, error.fieldErrors);
					return;
				}
			}
			console.error("Failed to update profile", error);
			renderErrors(
				502,
				{},
				"We couldn't save your changes right now. Please try again.",
			);
		}
	});

	return router;
}
