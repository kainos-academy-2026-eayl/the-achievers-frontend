import type { ProductViewModel } from "../models/productViewModel";

export const MAX_QUERY_LENGTH = 100;

function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .split(" ")
        .filter(Boolean);
}

// Optimal string alignment distance, so swapped letters ("mapel") count as one typo.
function editDistance(a: string, b: string): number {
    const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
        Array.from({ length: b.length + 1 }, (_, j) =>
            i === 0 ? j : j === 0 ? i : 0,
        ),
    );
    const at = (i: number, j: number) => d[i]?.[j] ?? 0;

    for (let i = 1; i <= a.length; i++) {
        const row = d[i] ?? [];
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            let value = Math.min(
                at(i - 1, j) + 1,
                at(i, j - 1) + 1,
                at(i - 1, j - 1) + cost,
            );
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                value = Math.min(value, at(i - 2, j - 2) + 1);
            }
            row[j] = value;
        }
    }

    return at(a.length, b.length);
}

function allowedTypos(termLength: number): number {
    if (termLength <= 3) return 0;
    if (termLength <= 6) return 1;
    return 2;
}

function termScore(term: string, words: string[]): number {
    const typos = allowedTypos(term.length);
    let best = 0;

    for (const word of words) {
        if (word === term) return 3;
        if (word.startsWith(term)) {
            best = Math.max(best, 2.5);
        } else if (term.length >= 3 && word.includes(term)) {
            best = Math.max(best, 2);
        } else if (typos > 0) {
            // Comparing against the word's prefix lets partially typed words with typos match.
            const distance = Math.min(
                editDistance(term, word),
                editDistance(term, word.slice(0, term.length)),
            );
            if (distance <= typos) {
                best = Math.max(best, 1.5 - distance * 0.25);
            }
        }
    }

    return best;
}

export function searchProducts(
    products: ProductViewModel[],
    query: string,
): ProductViewModel[] {
    const terms = tokenize(query);
    if (terms.length === 0) return products;

    return products
        .map((product) => {
            const nameWords = tokenize(product.name);
            const categoryWords = tokenize(product.category);
            const descriptionWords = tokenize(product.description);

            let score = 0;
            for (const term of terms) {
                const best = Math.max(
                    termScore(term, nameWords) * 2,
                    termScore(term, categoryWords) * 1.5,
                    termScore(term, descriptionWords),
                );
                // Every term must match somewhere, otherwise the product is excluded.
                if (best === 0) return { product, score: 0 };
                score += best;
            }

            return { product, score };
        })
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .map(({ product }) => product);
}
