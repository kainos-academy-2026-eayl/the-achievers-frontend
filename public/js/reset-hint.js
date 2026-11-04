çconst details = document.getElementById("reset-hint");
const hintText = document.getElementById("reset-hint-text");
const emailInput = document.getElementById("registration-email");

if (details && hintText && emailInput) {
    details.addEventListener("toggle", async () => {
        if (!details.open) return;

        const email = emailInput.value.trim();
        if (!email) {
            hintText.textContent = "Enter your email to see your hint.";
            return;
        }

        hintText.textContent = "Loading...";
        try {
            const response = await fetch(
                `/reset-pass/hint?email=${encodeURIComponent(email)}`,
            );
            const data = await response.json();
            hintText.textContent = response.ok
                ? data.question
                : data.error || "Unable to load your hint.";
        } catch {
            hintText.textContent = "Unable to load your hint. Please try again.";
        }
    });
}
