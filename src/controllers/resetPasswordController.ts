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

	// Called by the page script to check the email and safe word before it shows the new password fields.
	router.post("/verify", async (req: Request, res: Response) => {
		const form = readResetPasswordForm(req.body ?? {});
		const [firstError] = validateSafeWordCheck(form);
		if (firstError) {
			res.status(400).json({ error: firstError });
			return;
		}

		try {
			const isVerified = await resetPasswords.verifySafeWord(
				form.email,
				form.safeWord,
			);
			if (!isVerified) {
				res.status(401).json({ error: INCORRECT_DETAILS });
				return;
			}
			res.json({ verified: true });
		} catch (error) {
			const failure = describeFailure(
				error,
				"We couldn't check your details right now. Please try again.",
			);
			res.status(failure.status).json({ error: failure.message });
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
