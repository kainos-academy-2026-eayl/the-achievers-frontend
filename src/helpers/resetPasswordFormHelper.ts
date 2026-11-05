const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;
const MAX_SAFE_WORD_LENGTH = 128;

export type ResetPasswordForm = {
	email: string;
	safeWord: string;
	newPassword: string;
	confirmPassword: string;
};

export function readResetPasswordForm(
	body: Record<string, unknown>,
): ResetPasswordForm {
	const read = (key: string) => {
		const value = body[key];
		return typeof value === "string" ? value : "";
	};
	return {
		email: read("email").trim(),
		safeWord: read("safeWord"),
		newPassword: read("newPassword"),
		confirmPassword: read("confirmPassword"),
	};
}

export function validateSafeWordCheck(
	form: Pick<ResetPasswordForm, "email" | "safeWord">,
): string[] {
	const errors: string[] = [];
	if (!form.email) {
		errors.push("Enter your email address.");
	} else if (!EMAIL_PATTERN.test(form.email)) {
		errors.push("Enter a valid email address, for example name@example.com.");
	}
	if (!form.safeWord.trim()) {
		errors.push("Enter your safe word.");
	} else if (form.safeWord.length > MAX_SAFE_WORD_LENGTH) {
		errors.push(
			`Your safe word must be no more than ${MAX_SAFE_WORD_LENGTH} characters long.`,
		);
	}
	return errors;
}

export function validatePasswordReset(form: ResetPasswordForm): string[] {
	const errors = validateSafeWordCheck(form);
	if (!form.newPassword) {
		errors.push("Enter a new password.");
	} else if (form.newPassword.length < MIN_PASSWORD_LENGTH) {
		errors.push(
			`Your new password must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
		);
	} else if (form.newPassword.length > MAX_PASSWORD_LENGTH) {
		errors.push(
			`Your new password must be no more than ${MAX_PASSWORD_LENGTH} characters long.`,
		);
	}
	if (!form.confirmPassword) {
		errors.push("Confirm your new password.");
	} else if (form.newPassword !== form.confirmPassword) {
		errors.push("Your passwords do not match.");
	}
	return errors;
}
