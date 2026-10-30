/**
 * Quantity control with increment/decrement buttons and validation.
 * Enforces 1-99 quantity limit per cart item.
 * Accounts for existing cart quantity when adding items.
 */

const MAX_CART_QUANTITY = 99;

function initializeQuantityControls() {
	// Find all quantity forms and inputs
	const quantityForms = document.querySelectorAll(".quantity-form");

	quantityForms.forEach((form) => {
		const input = form.querySelector('input[name="quantity"]');
		if (!input) return;

		// Create increment/decrement controls
		const controlsDiv = document.createElement("div");
		controlsDiv.className = "quantity-controls";
		controlsDiv.setAttribute("role", "group");
		controlsDiv.setAttribute("aria-label", "Adjust quantity");

		const decrementBtn = document.createElement("button");
		decrementBtn.type = "button";
		decrementBtn.className = "btn-quantity-decrement";
		decrementBtn.setAttribute("aria-label", "Decrease quantity");
		decrementBtn.textContent = "−";

		const incrementBtn = document.createElement("button");
		incrementBtn.type = "button";
		incrementBtn.className = "btn-quantity-increment";
		incrementBtn.setAttribute("aria-label", "Increase quantity");
		incrementBtn.textContent = "+";

		controlsDiv.appendChild(decrementBtn);
		controlsDiv.appendChild(incrementBtn);

		// Insert controls after the input
		input.parentNode.insertBefore(controlsDiv, input.nextSibling);

		// Update button states
		function updateButtonStates() {
			const value = parseInt(input.value, 10);
			decrementBtn.disabled = value <= 1;
			incrementBtn.disabled = value >= MAX_CART_QUANTITY;
		}

		// Decrement handler
		decrementBtn.addEventListener("click", (e) => {
			e.preventDefault();
			const current = parseInt(input.value, 10);
			if (current > 1) {
				input.value = current - 1;
				updateButtonStates();
			}
		});

		// Increment handler
		incrementBtn.addEventListener("click", (e) => {
			e.preventDefault();
			const current = parseInt(input.value, 10);
			if (current < MAX_CART_QUANTITY) {
				input.value = current + 1;
				updateButtonStates();
			}
		});

		// Validate on input change
		input.addEventListener("change", () => {
			let value = input.value.trim();

			// Empty or non-numeric
			if (!value || isNaN(value)) {
				showValidationError(input, "Quantity must be a whole number.");
				input.value = 1;
				updateButtonStates();
				return;
			}

			const numValue = parseInt(value, 10);

			// Decimal check
			if (!Number.isInteger(parseFloat(input.value))) {
				showValidationError(input, "Quantity must be a whole number, not a decimal.");
				input.value = 1;
				updateButtonStates();
				return;
			}

			// Range check
			if (numValue < 1) {
				showValidationError(input, "Quantity must be at least 1.");
				input.value = 1;
				updateButtonStates();
				return;
			}

			if (numValue > MAX_CART_QUANTITY) {
				showValidationError(
					input,
					`Quantity cannot exceed ${MAX_CART_QUANTITY} per item.`
				);
				input.value = MAX_CART_QUANTITY;
				updateButtonStates();
				return;
			}

			clearValidationError(input);
			updateButtonStates();
		});

		// Handle blur for cleanup
		input.addEventListener("blur", () => {
			if (!input.value.trim()) {
				input.value = 1;
				updateButtonStates();
			}
		});

		// Initial state
		updateButtonStates();
	});
}

function showValidationError(input, message) {
	clearValidationError(input);

	const errorId = `error-${input.id}`;
	const errorDiv = document.createElement("div");
	errorDiv.id = errorId;
	errorDiv.className = "validation-error";
	errorDiv.role = "alert";
	errorDiv.textContent = message;

	input.classList.add("input-invalid");
	input.setAttribute("aria-describedby", errorId);
	input.parentNode.insertBefore(errorDiv, input.nextSibling);
}

function clearValidationError(input) {
	input.classList.remove("input-invalid");
	const errorId = `error-${input.id}`;
	const errorDiv = document.getElementById(errorId);
	if (errorDiv) {
		errorDiv.remove();
	}
	input.removeAttribute("aria-describedby");
}

// Initialize on page load
if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", initializeQuantityControls);
} else {
	initializeQuantityControls();
}
