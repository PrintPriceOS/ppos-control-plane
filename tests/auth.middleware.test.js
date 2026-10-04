import { describe, test, expect } from 'vitest';
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_secret';
process.env.JWT_AUDIENCE = 'ppos:control';
process.env.JWT_ISSUER = 'https://auth.printprice.pro';
const auth = require('../src/api/middleware/auth');

function createMocks() {
    const req = {
        headers: {},
        ip: '127.0.0.1',
        method: 'GET',
        originalUrl: '/test'
    };
    let nextCalled = false;
    let failResponse = null;
    let statusCode = null;

    const res = {
        status: function(code) {
            statusCode = code;
            return this;
        },
        json: function(data) {
            failResponse = data;
            return this;
        }
    };
    const next = () => { nextCalled = true; };

    return { req, res, next, getNextCalled: () => nextCalled, getFailResponse: () => failResponse, getStatusCode: () => statusCode };
}

describe('Auth Middleware Pipeline Suite', () => {
    test('1. Accepts valid PPOS_CONTROL_TOKEN system authentication', () => {
        process.env.PPOS_CONTROL_TOKEN = 'secret_internal_token';
        const { req, res, next, getNextCalled } = createMocks();
        req.headers.authorization = 'Bearer secret_internal_token';

        auth.requireAdmin(req, res, next);

        expect(getNextCalled()).toBe(true);
        expect(req.user.id).toBe('preflight-worker');
        expect(req.auth.type).toBe('system');
    });

    test('2. Rejects invalid PPOS_CONTROL_TOKEN with 401 UNAUTHORIZED', () => {
        process.env.PPOS_CONTROL_TOKEN = 'secret_internal_token';
        const { req, res, next, getNextCalled, getFailResponse, getStatusCode } = createMocks();
        req.headers.authorization = 'Bearer wrong_token';

        auth.requireAdmin(req, res, next);

        expect(getNextCalled()).toBe(false);
        expect(getStatusCode()).toBe(401);
        expect(getFailResponse().error.code).toBe('UNAUTHORIZED');
    });

    test('3. Accepts valid JWT token authentication pipeline', () => {
        process.env.PPOS_CONTROL_TOKEN = 'secret_internal_token';
        const token = jwt.sign({ sub: 'user-123', email: 'test@printprice.pro', role: 'OPERATOR' }, 'test_secret', {
            audience: 'ppos:control',
            issuer: 'https://auth.printprice.pro'
        });
        const { req, res, next, getNextCalled } = createMocks();
        req.headers.authorization = `Bearer ${token}`;

        auth.requireAdmin(req, res, next);

        expect(getNextCalled()).toBe(true);
        expect(req.user.id).toBe('user-123');
        expect(req.user.authMode).toBe('JWT');
    });

    test('4. Enforces PRINTHOUSE_ADMIN and PRINTHOUSE_OPERATOR in requireRole("OPERATOR")', () => {
        const adminReq = { user: { role: 'PRINTHOUSE_ADMIN', authMode: 'JWT' } };
        const operatorReq = { user: { role: 'PRINTHOUSE_OPERATOR', authMode: 'JWT' } };
        const viewerReq = { user: { role: 'VIEWER', authMode: 'JWT' } };

        let adminNext = false;
        let operatorNext = false;
        let viewerNext = false;

        const checkOperator = auth.requireRole('OPERATOR');

        checkOperator(adminReq, {}, () => { adminNext = true; });
        checkOperator(operatorReq, {}, () => { operatorNext = true; });
        checkOperator(viewerReq, { status: () => ({ json: () => {} }) }, () => { viewerNext = true; });

        expect(adminNext).toBe(true);
        expect(operatorNext).toBe(true);
        expect(viewerNext).toBe(false);
    });

    test('5. Fails closed on unknown required roles in requireRole', () => {
        const superAdminReq = { user: { role: 'SUPER_ADMIN', authMode: 'JWT' } };
        let nextCalled = false;
        let statusCode = null;

        const checkUnknown = auth.requireRole('NON_EXISTENT_ROLE_XY');
        checkUnknown(superAdminReq, {
            status: (code) => { statusCode = code; return { json: () => {} }; }
        }, () => { nextCalled = true; });

        expect(nextCalled).toBe(false);
        expect(statusCode).toBe(403);
    });

    test('6. Prevents privilege escalation via unverified email string in resolveActorContext', () => {
        const fakeReq = { user: { email: 'admin@printprice.pro', role: 'VIEWER', authMode: 'JWT' } };
        const context = auth.resolveActorContext(fakeReq);

        expect(context.role).toBe('VIEWER');
        expect(context.isSuperAdmin).toBe(false);
    });
});

