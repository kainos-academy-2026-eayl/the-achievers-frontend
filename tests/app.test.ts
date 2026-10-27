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

    it('forwards registration details and confirms receipt', async () => {
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
                safeWordHint: 'first-pet',
                safeWord: 'private-safe-word',
            });

        expect(fetchSpy).toHaveBeenCalledExactlyOnceWith('http://localhost:3000/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Cue User',
                email: 'cue-user@example.com',
                password: 'secure-password',
                safeWordHint: 'first-pet',
                safeWord: 'private-safe-word',
            }),
        });
        expect(response.status).toBe(202);
        expect(response.text).toContain('Your registration details were received.');
        expect(response.text).not.toContain('secure-password');
        expect(response.text).not.toContain('private-safe-word');
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
                safeWordHint: 'first-pet',
                safeWord: 'private-safe-word',
            })
            .timeout({ response: 10_000, deadline: 12_000 });

        expect(response.status).toBe(202);
        expect(response.text).toContain('Your registration details were received.');
        expect(response.text).not.toContain('secure-password');
        expect(response.text).not.toContain('private-safe-word');
        expect(fetchSpy).toHaveBeenCalledWith(`${backendUrl}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Cue User', email, password: 'secure-password', safeWordHint: 'first-pet', safeWord: 'private-safe-word' }),
        });
        const backendResponse = await fetchSpy.mock.results[0]!.value;
        expect(backendResponse.status, 'The real backend must create the user').toBe(201);
        expect(await backendResponse.json()).toMatchObject({ name: 'Cue User', email });
        expect(response.status).toBe(202);
        expect(response.text).toContain('Your registration details were received.');
        expect(response.text).not.toContain('secure-password');
        expect(response.text).not.toContain('private-safe-word');
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

    it.each(['short-pass', 'x'.repeat(129)])('rejects passwords outside 12-128 characters', async (password) => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        const app = createApp();

        const response = await request(app)
            .post('/registration')
            .type('form')
            .send({
                name: 'Cue User',
                email: 'cue-user@example.com',
                password,
                confirmPassword: password,
                safeWordHint: 'first-pet',
                safeWord: 'private-safe-word',
            });

        expect(response.status).toBe(400);
        expect(response.text).toContain('Your password must be between 12 and 128 characters long.');
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

    it.each([
        { safeWordHint: undefined, safeWord: 'private-safe-word' },
        { safeWordHint: 'unknown-hint', safeWord: 'private-safe-word' },
        { safeWordHint: ['first-pet', 'holiday'], safeWord: 'private-safe-word' },
        { safeWordHint: 'first-pet', safeWord: undefined },
        { safeWordHint: 'first-pet', safeWord: '   ' },
    ])('rejects invalid safe word details: %j', async (safeWordDetails) => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        const response = await request(createApp())
            .post('/registration')
            .type('form')
            .send({
                name: 'Cue User',
                email: 'cue-user@example.com',
                password: 'secure-password',
                confirmPassword: 'secure-password',
                ...safeWordDetails,
            });

        expect(response.status).toBe(400);
        expect(response.text).toContain('Please choose a safe word hint and enter a safe word.');
        expect(response.text).not.toContain('private-safe-word');
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it.each(['rejected', 'unavailable'])('preserves the hint when the backend is %s', async (failure) => {
        vi.stubEnv('API_BASE_URL', 'http://localhost:4567');
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        if (failure === 'rejected') {
            fetchSpy.mockResolvedValue(new Response(null, { status: 500 }));
        } else {
            fetchSpy.mockRejectedValue(new Error('Connection refused'));
        }

        const response = await request(createApp())
            .post('/registration')
            .type('form')
            .send({
                name: 'Cue User',
                email: 'cue-user@example.com',
                password: 'secure-password',
                confirmPassword: 'secure-password',
                safeWordHint: 'first-pet',
                safeWord: 'private-safe-word',
            });

        expect(response.status).toBe(502);
        expect(response.text).toContain('value="first-pet" selected');
        expect(response.text).not.toContain('private-safe-word');
        expect(response.text).not.toContain('secure-password');
        expect(fetchSpy).toHaveBeenCalledWith('http://localhost:4567/api/register', expect.any(Object));
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
