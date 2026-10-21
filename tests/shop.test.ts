import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import {
    buildCatalogue,
    formatPrice,
    MISSING_DESCRIPTION,
    toProduct,
    UNCATEGORISED,
} from '../src/services/product-service';

const noFilters = { q: '', category: '' };

describe('GET /shop', () => {
    it('displays all products with name, description, category and price', async () => {
        const app = createApp(() => [
            { id: 'a', name: 'Calluminator', description: 'The precision automated pool cue.', category: 'Calluminator Range', price: 1499.99 },
            { id: 'b', name: 'Calluminator Scope', description: 'Extension for the Calluminator.', category: 'Calluminator Range', price: 199.99 },
        ]);

        const response = await request(app).get('/shop');

        expect(response.status).toBe(200);
        expect(response.text).toContain('Calluminator Scope');
        expect(response.text).toContain('The precision automated pool cue.');
        expect(response.text).toContain('Calluminator Range');
        expect(response.text).toContain('£1,499.99');
        expect(response.text).toContain('£199.99');
        expect(response.text).toContain('2 results');
    });

    it('shows a message when no products exist', async () => {
        const response = await request(createApp(() => [])).get('/shop');

        expect(response.status).toBe(200);
        expect(response.text).toContain('No products available');
    });

    it('stays functional when every product is invalid', async () => {
        const response = await request(createApp(() => [null, 42, { id: 'x', name: null }])).get('/shop');

        expect(response.status).toBe(200);
        expect(response.text).toContain('No products available');
    });

    it('does not display a price for a product with a null price', async () => {
        const app = createApp(() => [{ id: 'a', name: 'Laser Aid', description: 'd', category: 'c', price: null }]);

        const response = await request(app).get('/shop');

        expect(response.text).toContain('Currently unavailable.');
        expect(response.text).not.toContain('£');
        expect(response.text).not.toMatch(/NaN|null|undefined/);
    });

    it('escapes product data to avoid rendering injected markup', async () => {
        const app = createApp(() => [{ id: 'a', name: '<script>alert(1)</script>', description: 'd', category: 'c', price: 1 }]);

        const response = await request(app).get('/shop');

        expect(response.text).not.toContain('<script>alert(1)</script>');
        expect(response.text).toContain('&lt;script&gt;');
    });

    it('filters by search term and category', async () => {
        const app = createApp(() => [
            { id: 'a', name: 'Safety Helmet', description: 'd', category: 'Protective Gear', price: 39.99 },
            { id: 'b', name: 'Maple Cue', description: 'd', category: 'Pool Cues', price: 89.99 },
        ]);

        const bySearch = await request(app).get('/shop?q=helmet');
        const byCategory = await request(app).get('/shop?category=Pool%20Cues');

        expect(bySearch.text).toContain('1 result');
        expect(bySearch.text).toContain('Safety Helmet');
        expect(byCategory.text).toContain('Maple Cue');
        expect(byCategory.text).toContain('1 result');
    });

    it('shows a no-match message when filters exclude every product', async () => {
        const app = createApp(() => [{ id: 'a', name: 'Maple Cue', description: 'd', category: 'Pool Cues', price: 89.99 }]);

        const response = await request(app).get('/shop?q=zzz');

        expect(response.text).toContain('No matching products');
    });

    it('renders the default catalogue with the Calluminator range and protective gear', async () => {
        const response = await request(createApp()).get('/shop');

        expect(response.status).toBe(200);
        for (const name of ['Calluminator', 'Calluminator Silencer', 'Calluminator Scope', 'Ball-Guard Safety Helmet', 'Full Body Protector']) {
            expect(response.text).toContain(name);
        }
    });
});

describe('formatPrice', () => {
    it('formats valid prices in GBP', () => {
        expect(formatPrice(1499.99)).toEqual({ formatted: '£1,499.99', currencySymbol: '£', whole: '1,499', fraction: '99' });
        expect(formatPrice(5)?.formatted).toBe('£5.00');
    });

    it.each([null, undefined, -1, Number.NaN, Number.POSITIVE_INFINITY, '9.99'])('returns null for invalid price %s', (value) => {
        expect(formatPrice(value)).toBeNull();
    });
});

describe('toProduct', () => {
    it('drops products with a missing or blank name', () => {
        expect(toProduct({ id: 'a', name: null })).toBeNull();
        expect(toProduct({ id: 'a', name: '   ' })).toBeNull();
    });

    it('falls back for missing description and category', () => {
        const product = toProduct({ id: 'a', name: 'Rack', description: null, category: null, price: 10 });

        expect(product?.description).toBe(MISSING_DESCRIPTION);
        expect(product?.category).toBe(UNCATEGORISED);
    });

    it('ignores invalid ratings and review counts', () => {
        const product = toProduct({ id: 'a', name: 'Rack', price: 1, rating: 9, reviewCount: -3 });

        expect(product?.rating).toBeNull();
        expect(product?.reviewCount).toBe(0);
    });
});

describe('buildCatalogue', () => {
    it('handles a non-array data source', () => {
        expect(buildCatalogue('corrupt', noFilters)).toEqual({ products: [], categories: [], totalAvailable: 0 });
    });
});
