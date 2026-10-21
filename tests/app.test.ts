import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';

describe('POST /registration', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('registers through the real backend and confirms receipt', async () => {
        const app = createApp();
        const email = `registration-test-${randomUUID()}@example.com`;

        const response = await request(app)
            .post('/registration')
            .type('form')
            .send({ name: 'Cue User', email, password: 'secure-password' })
            .timeout({ response: 10_000, deadline: 12_000 });

        expect(response.status).toBe(202);
        expect(response.text).toContain('Your registration details were received.');
        expect(response.text).not.toContain('secure-password');
    }, 15_000);

    it('rejects incomplete registration details', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        const app = createApp();

        const response = await request(app)
            .post('/registration')
            .type('form')
            .send({ name: 'Cue User', email: 'not-an-email', password: '' });

        expect(response.status).toBe(400);
        expect(response.text).toContain('Please provide a name, valid email address, and password.');
        expect(fetchSpy).not.toHaveBeenCalled();
    });

});

describe('GET /health', () => {
    it('returns a healthy response', async () => {
        const app = createApp();

        const response = await request(app).get('/health');

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('ok');
    });
});
