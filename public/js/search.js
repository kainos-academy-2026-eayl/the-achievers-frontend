(() => {
    const input = document.getElementById("site-search");
    const list = document.getElementById("search-suggestions");
    const statusEl = document.getElementById("search-status");
    if (!input || !list || !statusEl) return;

    const MIN_LENGTH = 2;
    const DEBOUNCE_MS = 200;
    let debounceTimer;
    let controller;
    let activeIndex = -1;

    const shopUrl = (query) => `/shop?q=${encodeURIComponent(query)}`;
    const options = () => Array.from(list.querySelectorAll('[role="option"]'));

    function close() {
        list.hidden = true;
        list.replaceChildren();
        input.setAttribute("aria-expanded", "false");
        input.removeAttribute("aria-activedescendant");
        activeIndex = -1;
    }

    function setActive(index) {
        const items = options();
        if (items.length === 0) return;
        activeIndex = (index + items.length) % items.length;
        items.forEach((item, i) => {
            item.setAttribute("aria-selected", String(i === activeIndex));
        });
        input.setAttribute("aria-activedescendant", items[activeIndex].id);
        items[activeIndex].scrollIntoView({ block: "nearest" });
    }

    function addOption(index, href, primary, secondary, className) {
        const item = document.createElement("li");
        item.id = `search-option-${index}`;
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", "false");
        if (className) item.className = className;

        const link = document.createElement("a");
        link.href = href;
        link.tabIndex = -1;

        const name = document.createElement("span");
        name.className = "suggestion-name";
        name.textContent = primary;
        link.append(name);

        if (secondary) {
            const meta = document.createElement("span");
            meta.className = "suggestion-meta";
            meta.textContent = secondary;
            link.append(meta);
        }

        item.append(link);
        list.append(item);
    }

    function render(query, results) {
        list.replaceChildren();
        activeIndex = -1;

        if (results.length === 0) {
            const empty = document.createElement("li");
            empty.className = "suggestion-empty";
            empty.textContent = `No products match "${query}"`;
            list.append(empty);
            statusEl.textContent = "No suggestions";
        } else {
            results.forEach((product, i) => {
                addOption(
                    i,
                    shopUrl(product.name),
                    product.name,
                    `${product.category} · ${product.price}`,
                );
            });
            addOption(
                results.length,
                shopUrl(query),
                `See all results for "${query}"`,
                null,
                "suggestion-all",
            );
            statusEl.textContent = `${results.length} suggestion${results.length === 1 ? "" : "s"} available`;
        }

        list.hidden = false;
        input.setAttribute("aria-expanded", "true");
    }

    async function fetchSuggestions(query) {
        controller?.abort();
        controller = new AbortController();

        try {
            const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
                signal: controller.signal,
            });
            if (!response.ok) {
                close();
                return;
            }
            const { results } = await response.json();
            if (input.value.trim() === query) render(query, results);
        } catch (error) {
            if (error.name !== "AbortError") close();
        }
    }

    // Category links carry the search from page load, so keep them in step with the box.
    function syncCategoryLinks(query) {
        for (const link of document.querySelectorAll(".category-link")) {
            const url = new URL(link.href);
            if (query) {
                url.searchParams.set("q", query);
            } else {
                url.searchParams.delete("q");
            }
            link.href = url.pathname + url.search;
        }
    }

    input.addEventListener("input", () => {
        clearTimeout(debounceTimer);
        const query = input.value.trim();
        syncCategoryLinks(query);
        if (query.length < MIN_LENGTH) {
            controller?.abort();
            close();
            return;
        }
        debounceTimer = setTimeout(() => fetchSuggestions(query), DEBOUNCE_MS);
    });

    input.addEventListener("keydown", (event) => {
        if (list.hidden) return;

        if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive(activeIndex + 1);
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive(activeIndex - 1);
        } else if (event.key === "Escape") {
            close();
        } else if (event.key === "Enter" && activeIndex >= 0) {
            event.preventDefault();
            options()[activeIndex].querySelector("a")?.click();
        }
    });

    document.addEventListener("click", (event) => {
        if (!input.form?.contains(event.target)) close();
    });
})();
