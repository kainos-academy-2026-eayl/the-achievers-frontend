(() => {
	const modal = document.getElementById('add-to-cart-modal');
	const confirmButton = modal?.querySelector('[data-confirm]');
	const cancelButton = modal?.querySelector('[data-cancel]');
	let pendingForm = null;
	let notification = null;

	if (!modal || !confirmButton || !cancelButton) return;

	function showNotification(message, isError = false) {
		if (notification) {
			notification.remove();
		}

		notification = document.createElement('div');
		notification.className = isError ? 'cart-notification error' : 'cart-notification success';
		notification.setAttribute('role', 'status');
		notification.setAttribute('aria-live', 'polite');
		notification.textContent = message;

		document.body.appendChild(notification);

		setTimeout(() => {
			notification?.remove();
			notification = null;
		}, 4000);
	}

	document.addEventListener('submit', (e) => {
		const form = e.target;
		if (form.action.endsWith('/cart/items/add')) {
			e.preventDefault();
			pendingForm = form;

			const productName = form.closest('[aria-labelledby]')?.querySelector('.product-name')?.textContent || 'Product';
			modal.querySelector('[data-product-name]').textContent = productName;

			modal.showModal();
		}
	});

	confirmButton.addEventListener('click', async () => {
		if (!pendingForm) return;

		const formData = new FormData(pendingForm);
		
		// Convert FormData to URL-encoded string for application/x-www-form-urlencoded
		const urlParams = new URLSearchParams(formData);
		
		confirmButton.disabled = true;
		confirmButton.textContent = 'Adding...';
		const productName = pendingForm.closest('[aria-labelledby]')?.querySelector('.product-name')?.textContent || 'Product';

		try {
			const response = await fetch(pendingForm.action, {
				method: 'POST',
				body: urlParams,
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				redirect: 'follow',
			});

			console.log('Response status:', response.status);

			// After following redirects, we should get 200 on success
			if (response.ok) {
				showNotification(`${productName} added to your cart!`);
			} else if (response.status === 502) {
				console.error('Backend service unavailable');
				showNotification('Backend service is unavailable. Please check your configuration.', true);
			} else {
				console.error('Failed with status:', response.status);
				showNotification('Failed to add item to cart. Please try again.', true);
			}
		} catch (error) {
			console.error('Failed to add to cart:', error);
			showNotification('Network error. Please check your connection.', true);
		} finally {
			modal.close();
			confirmButton.disabled = false;
			confirmButton.textContent = 'Add to Cart';
			pendingForm = null;
		}
	});

	cancelButton.addEventListener('click', () => {
		modal.close();
		pendingForm = null;
	});

	modal.addEventListener('cancel', () => {
		pendingForm = null;
	});
})();
