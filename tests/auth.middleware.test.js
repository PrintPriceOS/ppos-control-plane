const assert = require('assert');
const jwt = require('jsonwebtoken');
process.env.JWT_SECRET = 'test_secret';
process.env.JWT_AUDIENCE = 'ppos:control';
process.env.JWT_ISSUER = 'https://auth.printprice.pro';
const auth = require('../src/api/middleware/auth');

async function runTests() {
    console.log('Running auth middleware tests...');
    
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

    process.env.PPOS_CONTROL_TOKEN = 'secret_internal_token';
    process.env.JWT_SECRET = 'test_secret';
    process.env.JWT_AUDIENCE = 'ppos:control';
    process.env.JWT_ISSUER = 'https://auth.printprice.pro';

    // Test 1: Accepts PPOS_CONTROL_TOKEN
    {
        const { req, res, next, getNextCalled } = createMocks();
        req.headers.authorization = 'Bearer secret_internal_token';
        auth.requireAdmin(req, res, next);
        
        assert.strictEqual(getNextCalled(), true, 'Expected next() to be called for valid internal token');
        assert.strictEqual(req.auth.type, 'system');
        assert.strictEqual(req.user.id, 'preflight-worker');
        console.log('✓ Accepts PPOS_CONTROL_TOKEN');
    }

    // Test 2: Rejects invalid PPOS_CONTROL_TOKEN (and fails JWT)
    {
        const { req, res, next, getNextCalled, getStatusCode, getFailResponse } = createMocks();
        req.headers.authorization = 'Bearer ppos_live_wrong';
        auth.requireAdmin(req, res, next);
        
        assert.strictEqual(getNextCalled(), false);
        assert.strictEqual(getStatusCode(), 401);
        assert.strictEqual(getFailResponse().error.code, 'UNAUTHORIZED');
        console.log('✓ Rejects invalid PPOS_CONTROL_TOKEN');
    }

    // Test 3: Still accepts valid JWT
    {
        const token = jwt.sign({ sub: 'user-123', email: 'test@printprice.pro', role: 'OPERATOR' }, 'test_secret', {
            audience: 'ppos:control',
            issuer: 'https://auth.printprice.pro'
        });
        const { req, res, next, getNextCalled } = createMocks();
        req.headers.authorization = `Bearer ${token}`;
        
        auth.requireAdmin(req, res, next);
        
        assert.strictEqual(getNextCalled(), true);
        assert.strictEqual(req.user.id, 'user-123');
        assert.strictEqual(req.user.authMode, 'JWT');
        console.log('✓ Accepts valid JWT');
    }
    
    console.log('All tests passed!');
}

runTests().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
