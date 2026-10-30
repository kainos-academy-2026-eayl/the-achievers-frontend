const differentAddressToggle = document.querySelector("#use-different-address");
const differentAddressFields = document.querySelector("#different-address-fields");
const savedAddressFields = document.querySelector("#saved-address-options");

if (differentAddressToggle && differentAddressFields) {
    const requiredAddressInputs = differentAddressFields.querySelectorAll(
        "[data-address-required]",
    );

    function syncAddressFields() {
        differentAddressFields.disabled = !differentAddressToggle.checked;
        if (savedAddressFields) {
            savedAddressFields.disabled = differentAddressToggle.checked;
        }
        for (const input of requiredAddressInputs) {
            input.required = differentAddressToggle.checked;
        }
    }

    differentAddressToggle.addEventListener("change", syncAddressFields);
    syncAddressFields();
}
