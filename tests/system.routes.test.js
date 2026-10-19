// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import http from 'http';
import axios from 'axios';

process.env.JWT_SECRET = 'test_secret_for_system_routes_32_bytes';
process.env.JWT_AUDIENCE = 'ppos:control';
process.env.JWT_ISSUER = 'https://auth.printprice.pro';

const redisConnection = require('../src/api/adapters/redisConnection');
const systemRoutes = require('../src/api/routes/system');

let server;
let baseUrl;

function makeToken(role = 'SUPER_ADMIN') {
    return jwt.sign(
        {
            sub: 'test-user',
            email: 'tester@printprice.pro',
            role
        },
        process.env.JWT_SECRET,
        {
            audience: 'ppos:control',
            issuer: 'https://auth.printprice.pro'
        }
    );
}

describe('System Routes Security & Health RBAC Suite', () => {
    beforeAll(async () => {
        const app = express();
        app.use(express.json());
        app.use('/api/system', systemRoutes);

        await new Promise((resolve) => {
            server = http.createServer(app);
            server.listen(0, '127.0.0.1', () => {
                const port = server.address().port;
                baseUrl = `http://127.0.0.1:${port}`;
                resolve();
            });
        });
    });

    afterAll(async () => {
        if (server) {
            await new Promise(resolve => server.close(resolve));
        }
    });

    it('1. GET /api/system/health returns 401 when no token is provided', async () => {
        let errRes;
        try {
            await axios.get(`${baseUrl}/api/system/health`);
        } catch (err) {
            errRes = err.response;
        }
        expect(errRes).toBeDefined();
        expect(errRes.status).toBe(401);
        expect(errRes.data.ok).toBe(false);
    });

    it('2. GET /api/system/health returns minimal sanitized contract for PRINTHOUSE_OPERATOR without leaking pid or uptime', async () => {
        const printhouseToken = makeToken('PRINTHOUSE_OPERATOR');
        vi.spyOn(redisConnection, 'ping').mockResolvedValue('PONG');
        redisConnection.status = 'ready';

        const res = await axios.get(`${baseUrl}/api/system/health`, {
            headers: { Authorization: `Bearer ${printhouseToken}` }
        });

        expect(res.status).toBe(200);
        expect(res.data.ok).toBe(true);
        expect(res.data.status).toBe('HEALTHY');
        expect(res.data.services).toEqual({ operational: true });
        // Must NOT leak infrastructure internals to printhouse
        expect(res.data.pid).toBeUndefined();
        expect(res.data.uptime_seconds).toBeUndefined();
        expect(res.data.startTime).toBeUndefined();
        expect(res.data.dependencies).toBeUndefined();
    });

    it('3. GET /api/system/health returns detailed diagnostic payload for SUPER_ADMIN', async () => {
        const adminToken = makeToken('SUPER_ADMIN');
        vi.spyOn(redisConnection, 'ping').mockResolvedValue('PONG');
        redisConnection.status = 'ready';

        const res = await axios.get(`${baseUrl}/api/system/health`, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });

        expect(res.status).toBe(200);
        expect(res.data.ok).toBe(true);
        expect(res.data.status).toBe('HEALTHY');
        expect(typeof res.data.pid).toBe('number');
        expect(typeof res.data.uptime_seconds).toBe('number');
        expect(res.data.dependencies).toBeDefined();
        expect(res.data.dependencies.redis).toEqual({
            status: 'ready',
            latency: 'OK'
        });
    });

    it('4. GET /api/system/health reports DEGRADED when Redis ping fails or times out', async () => {
        const adminToken = makeToken('SUPER_ADMIN');
        vi.spyOn(redisConnection, 'ping').mockRejectedValue(new Error('Connection refused'));
        redisConnection.status = 'reconnecting';

        const res = await axios.get(`${baseUrl}/api/system/health`, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });

        expect(res.status).toBe(200);
        expect(res.data.ok).toBe(false);
        expect(res.data.status).toBe('DEGRADED');
        expect(res.data.dependencies.redis.status).toBe('reconnecting');
        expect(res.data.dependencies.redis.latency).toBe('ERROR');
    });

    it('5. GET /api/system/queues and /workers reject PRINTHOUSE_OPERATOR with 403 Forbidden', async () => {
        const printhouseToken = makeToken('PRINTHOUSE_OPERATOR');

        let queuesErr;
        try {
            await axios.get(`${baseUrl}/api/system/queues`, {
                headers: { Authorization: `Bearer ${printhouseToken}` }
            });
        } catch (err) {
            queuesErr = err.response;
        }
        expect(queuesErr).toBeDefined();
        expect(queuesErr.status).toBe(403);
        expect(queuesErr.data.ok).toBe(false);

        let workersErr;
        try {
            await axios.get(`${baseUrl}/api/system/workers`, {
                headers: { Authorization: `Bearer ${printhouseToken}` }
            });
        } catch (err) {
            workersErr = err.response;
        }
        expect(workersErr).toBeDefined();
        expect(workersErr.status).toBe(403);
        expect(workersErr.data.ok).toBe(false);
    });

    it('6. GET /api/system/queues and /workers reject PRINTHOUSE_ADMIN with 403 Forbidden', async () => {
        const printhouseAdminToken = makeToken('PRINTHOUSE_ADMIN');

        let queuesErr;
        try {
            await axios.get(`${baseUrl}/api/system/queues`, {
                headers: { Authorization: `Bearer ${printhouseAdminToken}` }
            });
        } catch (err) {
            queuesErr = err.response;
        }
        expect(queuesErr).toBeDefined();
        expect(queuesErr.status).toBe(403);

        let workersErr;
        try {
            await axios.get(`${baseUrl}/api/system/workers`, {
                headers: { Authorization: `Bearer ${printhouseAdminToken}` }
            });
        } catch (err) {
            workersErr = err.response;
        }
        expect(workersErr).toBeDefined();
        expect(workersErr.status).toBe(403);
    });
});
