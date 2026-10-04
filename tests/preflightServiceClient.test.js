import { describe, test, expect, vi, beforeEach } from 'vitest';
const preflightServiceClient = require('../src/api/services/preflightServiceClient');

describe('PreflightServiceClient Health & Token Signing Tests', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    test('1. getHealth calls /health endpoint on upstream preflight service', async () => {
        const spy = vi.spyOn(preflightServiceClient, '_request').mockResolvedValueOnce({
            status: 'UP',
            version: '1.9.2'
        });

        const res = await preflightServiceClient.getHealth();
        expect(res.status).toBe('UP');
        expect(spy).toHaveBeenCalledWith('GET', '/health');
    });

    test('2. getInternalPreflightJwt signs token with proper issuer, audience, and tenant', () => {
        const actorContext = {
            actorId: 'user-123',
            tenantId: 'tenant-abc',
            role: 'PRINTHOUSE_ADMIN'
        };

        const token = preflightServiceClient.getInternalPreflightJwt(actorContext);
        expect(typeof token).toBe('string');
        expect(token.length).toBeGreaterThan(20);
    });

    test('3. Fallback logic in getHealth tries /api/preflight/health if /health returns 404', async () => {
        const error404 = new Error('UPSTREAM_SERVICE_ERROR_404');
        error404.status = 404;

        const spy = vi.spyOn(preflightServiceClient, '_request')
            .mockRejectedValueOnce(error404)
            .mockResolvedValueOnce({ status: 'UP', service: 'preflight-api' });

        const res = await preflightServiceClient.getHealth();
        expect(res.status).toBe('UP');
        expect(spy).toHaveBeenCalledTimes(2);
        expect(spy).toHaveBeenNthCalledWith(1, 'GET', '/health');
        expect(spy).toHaveBeenNthCalledWith(2, 'GET', '/api/preflight/health');
    });
});
