import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';

describe('POST /registration', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('forwards registration details and confirms receipt', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(null, { status: 201 }),
        );
        const app = createApp();
        const email = `registration-test-${randomUUID()}@example.com`;

        const response = await request(app)
            .post('/registration')
            .type('form')
            .send({
                name: 'Cue User',
                email,
                password: 'secure-password',
                confirmPassword: 'secure-password',
            })
            .timeout({ response: 10_000, deadline: 12_000 });

        expect(response.status).toBe(202);
        expect(response.text).toContain('Your registration details were received.');
        expect(response.text).not.toContain('secure-password');
        expect(fetchSpy).toHaveBeenCalledWith('http://localhost:3001/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Cue User', email, password: 'secure-password' }),
        });
    }, 15_000);

    it('rejects incomplete registration details', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        const app = createApp();

        const response = await request(app)
            .post('/registration')
            .type('form')
            .send({
                name: 'Cue User',
                email: 'not-an-email',
                password: '',
                confirmPassword: '',
            });

        expect(response.status).toBe(400);
        expect(response.text).toContain(
            'Please provide a name, valid email address, password, and password confirmation.',
        );
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rejects passwords that do not match', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        const app = createApp();

        const response = await request(app)
            .post('/registration')
            .type('form')
            .send({
                name: 'Cue User',
                email: 'cue-user@example.com',
                password: 'secure-password',
                confirmPassword: 'different-password',
            });

        expect(response.status).toBe(400);
        expect(response.text).toContain('Your passwords do not match.');
        expect(response.text).not.toContain('secure-password');
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
