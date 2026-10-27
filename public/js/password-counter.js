const passwordInput = document.getElementById("registration-password");
const passwordCount = document.getElementById("password-count");

if (passwordInput && passwordCount) {
    const min = Number(passwordInput.getAttribute("minlength"));
    const max = Number(passwordInput.getAttribute("maxlength"));

    const update = () => {
        const length = passwordInput.value.length;
        const valid = length >= min && length <= max;
        passwordCount.textContent = valid
            ? `${length} characters`
            : `${length} / ${min} characters`;
        passwordCount.classList.toggle("is-valid", valid);
    };

    passwordCount.hidden = false;
    passwordInput.addEventListener("input", update);
    update();
}
