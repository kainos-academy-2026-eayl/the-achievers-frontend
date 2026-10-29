import { type Request, type Response, Router } from "express";
import {
	type AddressInput,
	type FieldErrors,
	type Profile,
	ProfileApiError,
	type ProfileClient,
	type ProfileUpdate,
} from "../clients/profileClient";

export type ProfileOperations = Pick<ProfileClient, "get" | "update">;

type FormValues = Record<string, string>;

const title = "My Profile | Cue Corner";
const PERSONAL_FIELDS = ["name", "email", "phone"] as const;
const ADDRESS_FIELDS = [
	"label",
	"addressLine1",
	"addressLine2",
	"city",
	"postcode",
] as const;
// Form prefix for each address slot, and the matching backend error prefix.
const ADDRESS_SLOTS = [
	{ form: "home", api: "homeAddress" },
	{ form: "other0", api: "otherAddresses.0" },
	{ form: "other1", api: "otherAddresses.1" },
] as const;

function profileToForm(profile: Profile): FormValues {
	const values: FormValues = {
		name: profile.name,
		email: profile.email,
		phone: profile.phone ?? "",
	};
	const addresses = [profile.homeAddress, ...profile.otherAddresses];
	ADDRESS_SLOTS.forEach((slot, index) => {
		for (const field of ADDRESS_FIELDS) {
			values[`${slot.form}-${field}`] = addresses[index]?.[field] ?? "";
		}
	});
	return values;
}

function bodyToForm(body: Record<string, unknown>): FormValues {
	const read = (key: string) =>
		typeof body[key] === "string" ? (body[key] as string) : "";
	const values: FormValues = {};
	for (const field of PERSONAL_FIELDS) values[field] = read(field);
	for (const slot of ADDRESS_SLOTS) {
		for (const field of ADDRESS_FIELDS) {
			const key = `${slot.form}-${field}`;
			values[key] = read(key);
		}
	}
	return values;
}

function formToAddress(values: FormValues, slot: string): AddressInput {
	return {
		...(slot === "home" ? {} : { label: values[`${slot}-label`] ?? "" }),
		addressLine1: values[`${slot}-addressLine1`] ?? "",
		addressLine2: values[`${slot}-addressLine2`] ?? "",
		city: values[`${slot}-city`] ?? "",
		postcode: values[`${slot}-postcode`] ?? "",
	};
}

function toFormErrors(fieldErrors: FieldErrors): FieldErrors {
	const errors: FieldErrors = {};
	for (const [key, message] of Object.entries(fieldErrors)) {
		const slot = ADDRESS_SLOTS.find(({ api }) => key.startsWith(`${api}.`));
		errors[slot ? `${slot.form}-${key.slice(slot.api.length + 1)}` : key] =
			message;
	}
	return errors;
}

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
				values: profileToForm(profile),
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
		const values = bodyToForm(body);
		const update: ProfileUpdate = {
			name: values.name ?? "",
			email: values.email ?? "",
			phone: values.phone ?? "",
			homeAddress: formToAddress(values, "home"),
			otherAddresses: [
				formToAddress(values, "other0"),
				formToAddress(values, "other1"),
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
				values,
				fieldErrors: toFormErrors(fieldErrors),
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
