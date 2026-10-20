import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';

describe('GET /health', () => {
    it('returns a healthy response', async () => {
        const app = createApp();

        const response = await request(app).get('/health');

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('ok');
    });
});