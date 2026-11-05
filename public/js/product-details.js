const backdrop = document.querySelector("[data-product-drawer]");
const drawer = backdrop?.querySelector(".product-drawer");
const closeButton = backdrop?.querySelector(".drawer-close");
const reviewStatus = backdrop?.querySelector("[data-review-status]");
const reviewList = backdrop?.querySelector("[data-review-list]");
let lastTrigger;
let activeReviewLoad = 0;
const productReviewCache = new Map();
const productReviewRequests = new Map();

function setText(selector, value) {
    const element = backdrop?.querySelector(selector);
    if (element) element.textContent = value;
}

function showRating(reviews) {
    const count = reviews.length;
    const average = count
        ? reviews.reduce((total, review) => total + review.rating, 0) / count
        : null;
    const roundedRating = average === null ? 0 : Math.round(average);
    setText("[data-drawer-stars]", `${"★".repeat(roundedRating)}${"☆".repeat(5 - roundedRating)}`);
    setText("[data-drawer-rating]", average === null ? "No ratings yet" : `${average.toFixed(1)}/5`);
    setText("[data-drawer-count]", `(${count} review${count === 1 ? "" : "s"})`);
}

function showLoadingRating() {
    setText("[data-drawer-stars]", "☆☆☆☆☆");
    setText("[data-drawer-rating]", "Loading rating...");
    setText("[data-drawer-count]", "");
}

function getProductReviews(productId) {
    if (productReviewCache.has(productId)) {
        return Promise.resolve(productReviewCache.get(productId));
    }
    if (productReviewRequests.has(productId)) {
        return productReviewRequests.get(productId);
    }

    const request = fetch(`/api/products/${encodeURIComponent(productId)}/reviews`)
        .then(async (response) => {
            if (!response.ok) {
                const error = new Error("Review request failed");
                error.status = response.status;
                throw error;
            }
            const data = await response.json();
            if (!Array.isArray(data.reviews)) throw new Error("Invalid reviews response");
            const reviews = data.reviews.filter(
                (review) => review.productId === productId && Number.isInteger(review.rating) && review.rating >= 1 && review.rating <= 5,
            );
            productReviewCache.set(productId, reviews);
            return reviews;
        })
        .finally(() => productReviewRequests.delete(productId));
    productReviewRequests.set(productId, request);
    return request;
}

function renderCatalogueRating(productTile, reviews) {
    const ratingContainer = productTile.querySelector("[data-product-rating]");
    if (!ratingContainer) return;
    ratingContainer.replaceChildren();
    if (!reviews.length) {
        const empty = document.createElement("span");
        empty.className = "review-count";
        empty.textContent = "No reviews yet (0)";
        ratingContainer.append(empty);
        return;
    }

    const average = reviews.reduce((total, review) => total + review.rating, 0) / reviews.length;
    const stars = document.createElement("span");
    stars.className = "stars";
    stars.setAttribute("role", "img");
    stars.setAttribute("aria-label", `Rated ${average.toFixed(1)} out of 5`);
    const fill = document.createElement("span");
    fill.className = "stars-fill";
    fill.style.width = `${(average / 5) * 100}%`;
    stars.append(fill);
    const count = document.createElement("span");
    count.className = "review-count";
    count.textContent = `(${reviews.length})`;
    ratingContainer.append(stars, count);
}

function renderReviews(reviews) {
    if (!reviewList || !reviewStatus) return;
    reviewList.replaceChildren();
    if (!reviews.length) {
        reviewStatus.textContent = "No reviews have been submitted for this product yet.";
        return;
    }
    reviewStatus.textContent = "";
    for (const review of reviews) {
        const item = document.createElement("li");
        item.className = "drawer-review";
        const header = document.createElement("header");
        const stars = document.createElement("span");
        stars.className = "review-stars";
        stars.setAttribute("aria-label", `${review.rating} out of 5 stars`);
        stars.textContent = `${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)} (${review.rating}/5)`;
        const name = document.createElement("strong");
        name.textContent = review.firstName;
        header.append(stars, name);
        if (review.date) {
            const time = document.createElement("time");
            time.dateTime = review.date;
            time.textContent = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(review.date));
            header.append(time);
        }
        const comment = document.createElement("p");
        comment.textContent = review.comment;
        item.append(header, comment);
        reviewList.append(item);
    }
}

async function loadReviews(productId) {
    if (!reviewStatus) return;
    const loadId = ++activeReviewLoad;
    reviewStatus.textContent = "Loading reviews...";
    reviewList?.replaceChildren();
    try {
        const reviews = await getProductReviews(productId);
        if (loadId !== activeReviewLoad || backdrop.hidden) return;
        showRating(reviews);
        renderReviews(reviews);
    } catch (error) {
        if (loadId === activeReviewLoad && !backdrop.hidden) {
            reviewStatus.textContent = error.status === 401
                ? "Sign in to view product reviews."
                : "Reviews are temporarily unavailable.";
        }
    }
}

function loadCatalogueRatings() {
    for (const trigger of document.querySelectorAll(".product-details-trigger")) {
        const productTile = trigger.closest(".product-tile");
        if (!productTile) continue;
        getProductReviews(trigger.dataset.productId)
            .then((reviews) => renderCatalogueRating(productTile, reviews))
            .catch(() => {
                const ratingContainer = productTile.querySelector("[data-product-rating]");
                if (ratingContainer) ratingContainer.textContent = "Reviews unavailable";
            });
    }
}

function openDrawer(trigger) {
    if (!backdrop || !drawer) return;
    lastTrigger = trigger;
    setText("[data-drawer-name]", trigger.dataset.productName);
    setText("[data-drawer-price]", trigger.dataset.productPrice);
    setText("[data-drawer-category]", trigger.dataset.productCategory);
    setText("[data-drawer-description]", trigger.dataset.productDescription);
    showLoadingRating();
    reviewStatus.textContent = "Loading reviews...";
    reviewList?.replaceChildren();
    backdrop.hidden = false;
    document.body.style.overflow = "hidden";
    closeButton?.focus();
    loadReviews(trigger.dataset.productId);
}

function closeDrawer() {
    if (!backdrop || backdrop.hidden) return;
    backdrop.hidden = true;
    document.body.style.overflow = "";
    activeReviewLoad++;
    lastTrigger?.focus();
}

loadCatalogueRatings();

document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const trigger = target.closest(".product-details-trigger");
    if (trigger instanceof HTMLButtonElement) openDrawer(trigger);
    if (target === backdrop || target.closest(".drawer-close")) closeDrawer();
});

document.addEventListener("keydown", (event) => {
    if (!backdrop || backdrop.hidden) return;
    if (event.key === "Escape") {
        event.preventDefault();
        closeDrawer();
        return;
    }
    if (event.key === "Tab" && drawer) {
        const focusable = [...drawer.querySelectorAll("button, a[href], input, select, textarea, [tabindex]:not([tabindex='-1'])")];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }
});