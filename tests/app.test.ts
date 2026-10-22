import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';

const backendUrl = process.env.AUTH_INTEGRATION_BACKEND_URL;

describe('POST /registration', () => {
    beforeEach(() => {
        vi.stubEnv('API_BASE_URL', 'http://localhost:3000');
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
    });

    it('forwards registration details and renders confirmation', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ name: 'Cue User', email: 'cue-user@example.com' }), {
                status: 201,
                headers: { 'Content-Type': 'application/json' },
            }),
        );

        const response = await request(createApp())
            .post('/registration')
            .type('form')
            .send({
                name: 'Cue User',
                email: 'cue-user@example.com',
                password: 'secure-password',
                confirmPassword: 'secure-password',
            });

        expect(fetchSpy).toHaveBeenCalledExactlyOnceWith('http://localhost:3000/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Cue User',
                email: 'cue-user@example.com',
                password: 'secure-password',
            }),
        });
        expect(response.status).toBe(202);
        expect(response.text).toContain('Your registration details were received.');
        expect(response.text).not.toContain('secure-password');
    });

    it.skipIf(!backendUrl)('creates a user through the real backend', async () => {
        vi.stubEnv('API_BASE_URL', backendUrl!);
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
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

        expect(fetchSpy).toHaveBeenCalledWith(`${backendUrl}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Cue User', email, password: 'secure-password' }),
        });
        const backendResponse = await fetchSpy.mock.results[0]!.value;
        expect(backendResponse.status, 'The real backend must create the user').toBe(201);
        expect(await backendResponse.json()).toMatchObject({ name: 'Cue User', email });
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
