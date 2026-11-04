// Wrapped in a function because classic scripts share one global scope, and
// reset-hint.js already declares a top-level `emailInput`.
(() => {
    const form = document.getElementById("reset-form");
    const newPasswordFields = document.getElementById("reset-new-password-fields");
    const notice = document.getElementById("reset-notice");
    const submitButton = document.getElementById("reset-submit");
    const emailInput = document.getElementById("registration-email");
    const safeWordInput = document.getElementById("safe-word");
    const newPasswordInput = document.getElementById("reset-new-password");
    const confirmPasswordInput = document.getElementById("reset-confirm-password");

    if (
        !form ||
        !newPasswordFields ||
        !notice ||
        !submitButton ||
        !emailInput ||
        !safeWordInput ||
        !newPasswordInput ||
        !confirmPasswordInput
    ) {
        return;
    }

    const showNotice = (message, isError) => {
        notice.textContent = message;
        notice.setAttribute("role", isError ? "alert" : "status");
    };

    const showNewPasswordFields = () => {
        newPasswordFields.hidden = false;
        newPasswordInput.disabled = false;
        confirmPasswordInput.disabled = false;
        // Read-only rather than disabled, so both values are still submitted with the new password.
        emailInput.readOnly = true;
        safeWordInput.readOnly = true;
        submitButton.textContent = "Reset password";
        showNotice("Your details are correct. Choose a new password.", false);
        newPasswordInput.focus();
    };

    const checkPasswordsMatch = () => {
        confirmPasswordInput.setCustomValidity(
            confirmPasswordInput.value === newPasswordInput.value
                ? ""
                : "Passwords do not match.",
        );
    };
    newPasswordInput.addEventListener("input", checkPasswordsMatch);
    confirmPasswordInput.addEventListener("input", checkPasswordsMatch);

    let isChecking = false;
    form.addEventListener("submit", async (event) => {
        // Once the new password fields are showing, the form posts normally.
        if (!newPasswordFields.hidden) return;

        event.preventDefault();
        if (isChecking) return;
        isChecking = true;
        submitButton.disabled = true;
        showNotice("Checking your details...", false);

        try {
            const response = await fetch("/reset-pass/verify", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    email: emailInput.value,
                    safeWord: safeWordInput.value,
                }),
            });
            const data = await response.json().catch(() => null);
            if (response.ok) {
                showNewPasswordFields();
            } else {
                showNotice(
                    data?.error || "We couldn't check your details. Please try again.",
                    true,
                );
            }
        } catch {
            showNotice("We couldn't check your details. Please try again.", true);
        } finally {
            isChecking = false;
            submitButton.disabled = false;
        }
    });
})();
