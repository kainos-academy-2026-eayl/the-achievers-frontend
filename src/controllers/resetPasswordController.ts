import { type Request, type Response, Router } from "express";
import {
	ResetPasswordApiError,
	type ResetPasswordClient,
} from "../clients/resetPasswordClient";
import {
	readResetPasswordForm,
	validatePasswordReset,
	validateSafeWordCheck,
} from "../helpers/resetPasswordFormHelper";

export type ResetPasswordOperations = Pick<
	ResetPasswordClient,
	"verifySafeWord" | "resetPassword"
>;

const title = "Reset Password | Cue Corner";
// One message for an unknown email and a wrong safe word, so the response does not reveal which it was.
const INCORRECT_DETAILS = "The email or safe word is incorrect.";
const TOO_MANY_ATTEMPTS =
	"Too many attempts. Please wait a minute and try again.";

type Failure = { status: number; message: string };

function describeFailure(error: unknown, fallbackMessage: string): Failure {
	if (error instanceof ResetPasswordApiError) {
		if (error.status === 401) {
			return { status: 401, message: INCORRECT_DETAILS };
		}
		if (error.status === 429) {
			return { status: 429, message: TOO_MANY_ATTEMPTS };
		}
		if (error.status === 400 && error.detail) {
			return { status: 400, message: error.detail };
		}
		console.error(`Reset password backend returned status ${error.status}.`);
	} else {
		console.error("Unable to reach the reset password backend.");
	}
	return { status: 502, message: fallbackMessage };
}

export function createResetPasswordRouter(
	resetPasswords: ResetPasswordOperations,
): Router {
	const router = Router();

	router.use((_req: Request, res: Response, next) => {
		res.set("Cache-Control", "no-store");
		next();
	});

	// Step one: check the email and safe word before showing the new password fields.
	router.post("/verify", async (req: Request, res: Response) => {
		const form = readResetPasswordForm(req.body ?? {});
		const renderError = (status: number, message: string) =>
			res.status(status).render("reset-pass", {
				title,
				email: form.email,
				resetError: true,
				resetMessage: message,
			});
		const [firstError] = validateSafeWordCheck(form);
		if (firstError) {
			renderError(400, firstError);
			return;
		}

		try {
			const isVerified = await resetPasswords.verifySafeWord(
				form.email,
				form.safeWord,
			);
			if (!isVerified) {
				renderError(401, INCORRECT_DETAILS);
				return;
			}
			res.render("reset-pass", {
				title,
				email: form.email,
				showNewPasswordFields: true,
				resetMessage:
					"Your details are correct. Enter your safe word again and choose a new password.",
			});
		} catch (error) {
			const failure = describeFailure(
				error,
				"We couldn't check your details right now. Please try again.",
			);
			renderError(failure.status, failure.message);
		}
	});

	router.post("/", async (req: Request, res: Response) => {
		const form = readResetPasswordForm(req.body ?? {});
		// The safe word and passwords are never sent back to the page.
		const renderForm = (
			status: number,
			message: string,
			errors: string[] = [],
		) =>
			res.status(status).render("reset-pass", {
				title,
				email: form.email,
				showNewPasswordFields: true,
				resetError: true,
				resetMessage: message,
				resetErrors: errors,
			});

		const errors = validatePasswordReset(form);
		if (errors.length > 0) {
			renderForm(400, "Please fix the following:", errors);
			return;
		}

		try {
			await resetPasswords.resetPassword(
				form.email,
				form.safeWord,
				form.newPassword,
			);
		} catch (error) {
			const failure = describeFailure(
				error,
				"We couldn't reset your password right now. Please try again.",
			);
			renderForm(failure.status, failure.message);
			return;
		}

		res.redirect(303, "/login?reset=1");
	});

	return router;
}
