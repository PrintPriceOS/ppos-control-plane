const assert = require('assert');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_backend_secret_32_bytes_long_key_1234';
process.env.JWT_AUDIENCE = 'ppos:control';
process.env.JWT_ISSUER = 'https://auth.printprice.pro';

const { resolveActorContext, requireRole, requireAdmin } = require('../src/api/middleware/auth');
const auditRouter = require('../src/api/routes/auditExplorerAdmin');
const anomalyRouter = require('../src/api/routes/anomalyAdmin');
const adminRouter = require('../src/api/routes/admin');
const notificationService = require('../src/api/services/controlPlaneNotificationService');
const db = require('../src/api/services/mysqlClient');

function createMockReqRes({ method = 'GET', url = '/', headers = {}, query = {}, params = {}, body = {}, user = null }) {
    let statusCode = 200;
    let responseBody = null;
    let nextCalled = false;

    const req = {
        method,
        url,
        originalUrl: url,
        path: url.split('?')[0],
        headers: { ...headers },
        query: { ...query },
        params: { ...params },
        body: { ...body },
        ip: '127.0.0.1',
        user
    };

    const res = {
        status(code) {
            statusCode = code;
            return this;
        },
        json(data) {
            responseBody = data;
            return this;
        },
        send(data) {
            responseBody = data;
            return this;
        }
    };

    const next = () => {
        nextCalled = true;
    };

    return {
        req,
        res,
        next,
        getStatusCode: () => statusCode,
        getBody: () => responseBody,
        isNextCalled: () => nextCalled
    };
}

describe('Backend Tenant Authorization & Isolation Security Suite', () => {

    describe('1. Audit Log Cross-Tenant Isolation', () => {
        it('prevents Tenant A from querying Tenant B audit logs (returns 403 FORBIDDEN)', async () => {
            // Find the GET / handler on auditRouter
            const getRoute = auditRouter.stack.find(s => s.route && s.route.methods.get);
            assert(getRoute, 'Audit router must have a GET route');
            const handler = getRoute.route.stack[0].handle;

            const { req, res, getStatusCode, getBody } = createMockReqRes({
                query: { tenant: 'tenant-beta' },
                user: {
                    id: 'user-tenant-a',
                    role: 'OPERATOR',
                    tenantId: 'tenant-alpha'
                }
            });

            await handler(req, res);

            assert.strictEqual(getStatusCode(), 403, 'Cross-tenant query must be rejected with 403');
            assert.strictEqual(getBody().ok, false);
            assert.match(getBody().error, /Cross-tenant audit log access denied/i);
        });

        it('forces effective tenant to user tenantId even if tenant param is omitted', async () => {
            const getRoute = auditRouter.stack.find(s => s.route && s.route.methods.get);
            const handler = getRoute.route.stack[0].handle;

            // Spy on db.query
            let executedQuery = '';
            let executedParams = [];
            const originalQuery = db.query;
            db.query = async (queryStr, params) => {
                executedQuery = queryStr;
                executedParams = params;
                return [];
            };

            try {
                const { req, res } = createMockReqRes({
                    query: {}, // no tenant param passed
                    user: {
                        id: 'user-tenant-a',
                        role: 'OPERATOR',
                        tenantId: 'tenant-alpha'
                    }
                });

                await handler(req, res);

                assert(executedQuery.includes('tenant_id = ?'), 'SQL must enforce tenant_id constraint');
                assert(executedParams.includes('tenant-alpha'), 'SQL params must contain caller tenantId');
            } finally {
                db.query = originalQuery;
            }
        });

        it('allows SUPER_ADMIN to query across tenants', async () => {
            const getRoute = auditRouter.stack.find(s => s.route && s.route.methods.get);
            const handler = getRoute.route.stack[0].handle;

            let executedParams = [];
            const originalQuery = db.query;
            db.query = async (queryStr, params) => {
                executedParams = params;
                return [];
            };

            try {
                const { req, res, getStatusCode } = createMockReqRes({
                    query: { tenant: 'tenant-target' },
                    user: {
                        id: 'super-admin-1',
                        email: 'admin@printprice.pro',
                        role: 'SUPER_ADMIN'
                    }
                });

                await handler(req, res);

                assert.strictEqual(getStatusCode(), 200, 'SUPER_ADMIN should be allowed to query target tenant');
                assert(executedParams.includes('tenant-target'), 'Params should reflect targeted tenant');
            } finally {
                db.query = originalQuery;
            }
        });
    });

    describe('2. Global Platform Anomalies RBAC Isolation', () => {
        it('rejects PRINTHOUSE_ADMIN from accessing global anomaly telemetry (returns 403 FORBIDDEN)', async () => {
            // Check anomaly router level middleware
            const middleware = anomalyRouter.stack.find(s => !s.route && typeof s.handle === 'function');
            assert(middleware, 'Anomaly router must have protection middleware');

            const { req, res, next, getStatusCode, getBody, isNextCalled } = createMockReqRes({
                user: {
                    id: 'printer-owner-1',
                    role: 'PRINTHOUSE_ADMIN',
                    tenantId: 'printhouse-node-101',
                    printhouseId: 'node-101'
                }
            });

            middleware.handle(req, res, next);

            assert.strictEqual(isNextCalled(), false, 'Printhouse admin must not pass to next handler');
            assert.strictEqual(getStatusCode(), 403, 'Must return HTTP 403');
            assert.strictEqual(getBody().error.code, 'FORBIDDEN');
            assert.match(getBody().error.message, /Required: SUPER_ADMIN/i);
        });

        it('allows SUPER_ADMIN to access global anomaly telemetry', async () => {
            const middleware = anomalyRouter.stack.find(s => !s.route && typeof s.handle === 'function');

            const { req, res, next, isNextCalled } = createMockReqRes({
                user: {
                    id: 'admin-1',
                    email: 'ops@printprice.pro',
                    role: 'SUPER_ADMIN'
                }
            });

            middleware.handle(req, res, next);

            assert.strictEqual(isNextCalled(), true, 'SUPER_ADMIN must pass through successfully');
        });
    });

    describe('3. Notification Preferences Boundary Enforcement', () => {
        it('prevents Tenant A from reading Tenant B notification preferences (returns 403)', async () => {
            const prefGetLayer = adminRouter.stack.find(s => s.route && s.route.path === '/tenants/:id/notification-preferences' && s.route.methods.get);
            assert(prefGetLayer, 'Preferences route must be registered on adminRouter');
            const handler = prefGetLayer.route.stack[0].handle;

            const { req, res, getStatusCode, getBody } = createMockReqRes({
                params: { id: 'tenant-beta' },
                user: {
                    id: 'user-tenant-a',
                    role: 'TENANT_ADMIN',
                    tenantId: 'tenant-alpha'
                }
            });

            await handler(req, res);

            assert.strictEqual(getStatusCode(), 403);
            assert.strictEqual(getBody().ok, false);
            assert.match(getBody().error, /Cross-tenant notification preference access denied/i);
        });

        it('prevents Tenant A from modifying Tenant B notification preferences (returns 403)', async () => {
            const prefPutLayer = adminRouter.stack.find(s => s.route && s.route.path === '/tenants/:id/notification-preferences' && s.route.methods.put);
            assert(prefPutLayer, 'Preferences PUT route must be registered on adminRouter');
            const handler = prefPutLayer.route.stack[0].handle;

            const { req, res, getStatusCode, getBody } = createMockReqRes({
                method: 'PUT',
                params: { id: 'tenant-beta' },
                body: { email_order_alerts: 1 },
                user: {
                    id: 'user-tenant-a',
                    role: 'TENANT_ADMIN',
                    tenantId: 'tenant-alpha'
                }
            });

            await handler(req, res);

            assert.strictEqual(getStatusCode(), 403);
            assert.strictEqual(getBody().ok, false);
            assert.match(getBody().error, /Cross-tenant notification preference update denied/i);
        });

        it('rejects unknown notification preference fields with 400 before querying DB', async () => {
            const prefPutLayer = adminRouter.stack.find(s => s.route && s.route.path === '/tenants/:id/notification-preferences' && s.route.methods.put);
            const handler = prefPutLayer.route.stack[0].handle;

            const { req, res, getStatusCode, getBody } = createMockReqRes({
                method: 'PUT',
                params: { id: 'tenant-alpha' },
                body: { 
                    email_order_alerts: 1,
                    unauthorized_custom_flag: 'malicious_injection',
                    extra_field_evil: true
                },
                user: {
                    id: 'user-tenant-a',
                    role: 'TENANT_ADMIN',
                    tenantId: 'tenant-alpha'
                }
            });

            await handler(req, res);

            assert.strictEqual(getStatusCode(), 400);
            assert.strictEqual(getBody().ok, false);
            assert.match(getBody().error, /UNKNOWN_FIELDS_REJECTED/i);
        });

        it('rejects invalid types for alert flags with 400', async () => {
            const prefPutLayer = adminRouter.stack.find(s => s.route && s.route.path === '/tenants/:id/notification-preferences' && s.route.methods.put);
            const handler = prefPutLayer.route.stack[0].handle;

            const { req, res, getStatusCode, getBody } = createMockReqRes({
                method: 'PUT',
                params: { id: 'tenant-alpha' },
                body: { 
                    email_sla_alerts: 'INVALID_STRING_VALUE'
                },
                user: {
                    id: 'user-tenant-a',
                    role: 'TENANT_ADMIN',
                    tenantId: 'tenant-alpha'
                }
            });

            await handler(req, res);

            assert.strictEqual(getStatusCode(), 400);
            assert.strictEqual(getBody().ok, false);
            assert.match(getBody().error, /INVALID_TYPE/i);
        });

        it('accepts legitimate operational alert preferences including email_sla_alerts', async () => {
            const prefPutLayer = adminRouter.stack.find(s => s.route && s.route.path === '/tenants/:id/notification-preferences' && s.route.methods.put);
            const handler = prefPutLayer.route.stack[0].handle;

            let executedSql = '';
            let executedParams = [];
            const originalQuery = db.query;
            db.query = async (queryStr, params) => {
                executedSql = queryStr;
                executedParams = params;
                return [{ affectedRows: 1 }];
            };

            try {
                const { req, res, getStatusCode, getBody } = createMockReqRes({
                    method: 'PUT',
                    params: { id: 'tenant-alpha' },
                    body: { 
                        email_order_alerts: 1,
                        email_qc_alerts: 1,
                        email_sla_alerts: 1,
                        email_recipients_json: ['alerts@tenant-alpha.com'],
                        webhook_endpoint: 'https://mfg.tenant-alpha.com/webhook'
                    },
                    user: {
                        id: 'user-tenant-a',
                        role: 'TENANT_ADMIN',
                        tenantId: 'tenant-alpha'
                    }
                });

                await handler(req, res);

                assert.strictEqual(getStatusCode(), 200);
                assert.strictEqual(getBody().ok, true);
                assert.match(executedSql, /tenant_notification_preferences/i);
                assert(executedParams.includes('tenant-alpha'));
            } finally {
                db.query = originalQuery;
            }
        });

        it('allows PRINTHOUSE_OPERATOR to update their own tenant notification preferences', async () => {
            const prefPutLayer = adminRouter.stack.find(s => s.route && s.route.path === '/tenants/:id/notification-preferences' && s.route.methods.put);
            const handler = prefPutLayer.route.stack[0].handle;

            let executedSql = '';
            let executedParams = [];
            const originalQuery = db.query;
            db.query = async (queryStr, params) => {
                executedSql = queryStr;
                executedParams = params;
                return [{ affectedRows: 1 }];
            };

            try {
                const { req, res, getStatusCode, getBody } = createMockReqRes({
                    method: 'PUT',
                    params: { id: 'tenant-alpha' },
                    body: { 
                        email_order_alerts: 1,
                        email_qc_alerts: 1
                    },
                    user: {
                        id: 'operator-1',
                        role: 'PRINTHOUSE_OPERATOR',
                        tenantId: 'tenant-alpha'
                    }
                });

                await handler(req, res);

                assert.strictEqual(getStatusCode(), 200);
                assert.strictEqual(getBody().ok, true);
                assert.match(executedSql, /tenant_notification_preferences/i);
                assert(executedParams.includes('tenant-alpha'));
            } finally {
                db.query = originalQuery;
            }
        });

        it('denies VIEWER role from modifying notification preferences (returns 403)', async () => {
            const prefPutLayer = adminRouter.stack.find(s => s.route && s.route.path === '/tenants/:id/notification-preferences' && s.route.methods.put);
            const handler = prefPutLayer.route.stack[0].handle;

            const { req, res, getStatusCode, getBody } = createMockReqRes({
                method: 'PUT',
                params: { id: 'tenant-alpha' },
                body: { email_order_alerts: 1 },
                user: {
                    id: 'user-viewer',
                    role: 'VIEWER',
                    tenantId: 'tenant-alpha'
                }
            });

            await handler(req, res);

            assert.strictEqual(getStatusCode(), 403);
            assert.strictEqual(getBody().ok, false);
            assert.match(getBody().error, /Insufficient permissions/i);
        });
    });

    describe('4. Notification Service SQL Scoping', () => {
        it('scopes getMyNotifications strictly to caller tenantId and userId', async () => {
            let executedQuery = '';
            let executedParams = [];
            const originalQuery = db.query;
            db.query = async (queryStr, params) => {
                executedQuery = queryStr;
                executedParams = params;
                return [];
            };

            try {
                await notificationService.getMyNotifications('tenant-gamma', 'user-456', 15);

                assert(executedQuery.includes('WHERE tenant_id = ?'), 'Notification query must filter by tenant_id');
                assert(executedQuery.includes("scope = 'TENANT' OR (scope = 'USER' AND user_id = ?)"), 'Must respect scope');
                assert.strictEqual(executedParams[0], 'tenant-gamma');
                assert.strictEqual(executedParams[1], 'user-456');
                assert.strictEqual(executedParams[2], 15);
            } finally {
                db.query = originalQuery;
            }
        });

        it('scopes markAsRead strictly to caller tenantId preventing cross-tenant dismissal', async () => {
            let executedQuery = '';
            let executedParams = [];
            const originalQuery = db.query;
            db.query = async (queryStr, params) => {
                executedQuery = queryStr;
                executedParams = params;
                return true;
            };

            try {
                await notificationService.markAsRead('notif-999', 'tenant-delta');

                assert(executedQuery.includes('WHERE id = ? AND tenant_id = ?'), 'markAsRead must include tenant_id in WHERE clause');
                assert.strictEqual(executedParams[0], 'notif-999');
                assert.strictEqual(executedParams[1], 'tenant-delta');
            } finally {
                db.query = originalQuery;
            }
        });
    });

    describe('5. HTTP Auth Chain & Bearer JWT Validation Pipeline', () => {
        const signTestJwt = (payload, options = {}) => {
            return jwt.sign(payload, process.env.JWT_SECRET, {
                audience: process.env.JWT_AUDIENCE,
                issuer: process.env.JWT_ISSUER,
                expiresIn: '1h',
                ...options
            });
        };

        it('rejects HTTP requests without authorization token (returns 401 Bearer token required)', async () => {
            const { req, res, next, getStatusCode, getBody, isNextCalled } = createMockReqRes({
                headers: {}
            });

            await requireAdmin(req, res, next);

            assert.strictEqual(isNextCalled(), false, 'Request must not proceed without token');
            assert.strictEqual(getStatusCode(), 401);
            assert.strictEqual(getBody().ok, false);
            const errStr = typeof getBody().error === 'object' ? getBody().error.message : getBody().error;
            assert.match(errStr, /Bearer token required/i);
        });

        it('rejects HTTP requests with invalid or malformed token (returns 401)', async () => {
            const { req, res, next, getStatusCode, getBody, isNextCalled } = createMockReqRes({
                headers: { authorization: 'Bearer this.is.an.invalid.token' }
            });

            await requireAdmin(req, res, next);

            assert.strictEqual(isNextCalled(), false, 'Request must not proceed with invalid token');
            assert.strictEqual(getStatusCode(), 401);
            assert.strictEqual(getBody().ok, false);
            const errStr = typeof getBody().error === 'object' ? getBody().error.message : getBody().error;
            assert.match(errStr, /Invalid or malformed token|JWT Error/i);
        });

        it('authenticates valid JWT and populates req.user with tenant context', async () => {
            const token = signTestJwt({
                sub: 'user-ph-100',
                email: 'operator@printhouse.de',
                role: 'PRINTHOUSE_ADMIN',
                tenant_id: 'tenant-stuttgart',
                printhouse_id: 'node-stuttgart-01'
            });

            const { req, res, next, isNextCalled } = createMockReqRes({
                headers: { authorization: `Bearer ${token}` }
            });

            await requireAdmin(req, res, next);

            assert.strictEqual(isNextCalled(), true, 'Valid JWT must call next()');
            assert.strictEqual(req.user.id, 'user-ph-100');
            assert.strictEqual(req.user.tenantId, 'tenant-stuttgart');
            assert.strictEqual(req.user.role, 'PRINTHOUSE_ADMIN');
        });

        it('allows authorized user to query own tenant preferences through full auth chain', async () => {
            const token = signTestJwt({
                sub: 'user-ph-100',
                email: 'operator@printhouse.de',
                role: 'TENANT_ADMIN',
                tenant_id: 'tenant-stuttgart'
            });

            const { req, res, next } = createMockReqRes({
                headers: { authorization: `Bearer ${token}` },
                params: { id: 'tenant-stuttgart' }
            });

            await requireAdmin(req, res, next);
            assert(req.user, 'req.user must be authenticated');

            // Dispatch to preferences route
            const prefGetLayer = adminRouter.stack.find(s => s.route && s.route.path === '/tenants/:id/notification-preferences' && s.route.methods.get);
            const handler = prefGetLayer.route.stack[0].handle;

            const originalQuery = db.query;
            let queriedTenant = null;
            db.query = async (queryStr, params) => {
                queriedTenant = params[0];
                return [{ email_order_alerts: 1 }];
            };

            try {
                await handler(req, res);
                assert.strictEqual(queriedTenant, 'tenant-stuttgart');
                assert.strictEqual(res.getStatusCode ? res.getStatusCode() : 200, 200);
            } finally {
                db.query = originalQuery;
            }
        });

        it('denies authorized user when attempting cross-tenant access to another tenant (returns 403)', async () => {
            const token = signTestJwt({
                sub: 'user-ph-100',
                email: 'operator@printhouse.de',
                role: 'TENANT_ADMIN',
                tenant_id: 'tenant-stuttgart'
            });

            const { req, res, next, getStatusCode, getBody } = createMockReqRes({
                headers: { authorization: `Bearer ${token}` },
                params: { id: 'tenant-munich' } // target is different tenant!
            });

            await requireAdmin(req, res, next);
            assert(req.user, 'req.user must be authenticated');

            const prefGetLayer = adminRouter.stack.find(s => s.route && s.route.path === '/tenants/:id/notification-preferences' && s.route.methods.get);
            const handler = prefGetLayer.route.stack[0].handle;

            await handler(req, res);

            assert.strictEqual(getStatusCode(), 403);
            assert.strictEqual(getBody().ok, false);
            assert.match(getBody().error, /Cross-tenant notification preference access denied/i);
        });

        it('verifies notification preferences route through the entire Express middleware pipeline (adminRouter)', async () => {
            // Test 1: PRINTHOUSE_OPERATOR passes through global adminRouter middleware gate into own preferences
            const operatorToken = signTestJwt({
                sub: 'usr-klaus-01',
                email: 'klaus@faehrmann-druck.de',
                role: 'PRINTHOUSE_OPERATOR',
                tenant_id: 'tenant-faehrmann-stuttgart'
            });

            const { req: reqOp, res: resOp, next: nextOp, getStatusCode: getStatusCodeOp, getBody: getBodyOp } = createMockReqRes({
                method: 'GET',
                url: '/tenants/tenant-faehrmann-stuttgart/notification-preferences',
                headers: { authorization: `Bearer ${operatorToken}` }
            });

            await requireAdmin(reqOp, resOp, nextOp);
            assert(reqOp.user, 'PRINTHOUSE_OPERATOR must be authenticated');

            // Dispatch through adminRouter top-level middleware chain
            const originalQuery = db.query;
            let queriedId = null;
            db.query = async (sql, params) => {
                queriedId = params[0];
                return [{ email_order_alerts: 1, email_qc_alerts: 1 }];
            };

            try {
                await new Promise((resolve) => {
                    const origJson = resOp.json;
                    resOp.json = (data) => {
                        origJson.call(resOp, data);
                        resolve(null);
                    };
                    adminRouter(reqOp, resOp, (err) => {
                        resolve(err);
                    });
                });

                assert.strictEqual(getStatusCodeOp(), 200);
                assert.strictEqual(getBodyOp().ok, true);
                assert.strictEqual(queriedId, 'tenant-faehrmann-stuttgart');
            } finally {
                db.query = originalQuery;
            }

            // Test 2: Other tenant routes (e.g. /tenants/tenant-target) without notification-preferences are blocked by adminRouter global gate for non-global admin
            const { req: reqGate, res: resGate, next: nextGate, getStatusCode: getStatusCodeGate, getBody: getBodyGate } = createMockReqRes({
                method: 'GET',
                url: '/tenants/tenant-faehrmann-stuttgart/other-restricted-setting',
                headers: { authorization: `Bearer ${operatorToken}` }
            });
            await requireAdmin(reqGate, resGate, nextGate);

            await new Promise((resolve) => {
                const origJson = resGate.json;
                resGate.json = (data) => {
                    origJson.call(resGate, data);
                    resolve(null);
                };
                adminRouter(reqGate, resGate, (err) => {
                    resolve(err);
                });
            });

            assert.strictEqual(getStatusCodeGate(), 403, 'Global admin router middleware must reject non-whitelisted tenant routes for non-superadmin');
            assert.strictEqual(getBodyGate().ok, false);
            assert.match(getBodyGate().error.message, /Access denied: Route restricted to global system administrators/i);

            // Test 3: PUT notification preferences with cross-tenant ID is rejected with 403
            const { req: reqCross, res: resCross, next: nextCross, getStatusCode: getStatusCodeCross, getBody: getBodyCross } = createMockReqRes({
                method: 'PUT',
                url: '/tenants/tenant-other-company/notification-preferences',
                headers: { authorization: `Bearer ${operatorToken}` },
                body: { email_order_alerts: true }
            });
            await requireAdmin(reqCross, resCross, nextCross);

            await new Promise((resolve) => {
                const origJson = resCross.json;
                resCross.json = (data) => {
                    origJson.call(resCross, data);
                    resolve(null);
                };
                adminRouter(reqCross, resCross, (err) => {
                    resolve(err);
                });
            });

            assert.strictEqual(getStatusCodeCross(), 403);
            assert.strictEqual(getBodyCross().ok, false);
            assert.match(getBodyCross().error, /Cross-tenant notification preference update denied/i);

            // Test 4: PUT notification preferences with unauthorized fields returns 400
            const { req: reqBadField, res: resBadField, next: nextBadField, getStatusCode: getStatusCodeBadField, getBody: getBodyBadField } = createMockReqRes({
                method: 'PUT',
                url: '/tenants/tenant-faehrmann-stuttgart/notification-preferences',
                headers: { authorization: `Bearer ${operatorToken}` },
                body: { 
                    email_order_alerts: true,
                    unauthorized_malicious_column: 'DROP TABLE;'
                }
            });
            await requireAdmin(reqBadField, resBadField, nextBadField);

            await new Promise((resolve) => {
                const origJson = resBadField.json;
                resBadField.json = (data) => {
                    origJson.call(resBadField, data);
                    resolve(null);
                };
                adminRouter(reqBadField, resBadField, (err) => {
                    resolve(err);
                });
            });

            assert.strictEqual(getStatusCodeBadField(), 400);
            assert.strictEqual(getBodyBadField().ok, false);
            assert.match(getBodyBadField().error, /UNKNOWN_FIELDS_REJECTED/i);
        });

        it('denies non-superadmin role from accessing global anomalies telemetry (returns 403)', async () => {
            const token = signTestJwt({
                sub: 'user-ph-100',
                email: 'operator@printhouse.de',
                role: 'PRINTHOUSE_ADMIN',
                tenant_id: 'tenant-stuttgart'
            });

            const { req, res, next, getStatusCode, getBody, isNextCalled } = createMockReqRes({
                headers: { authorization: `Bearer ${token}` }
            });

            await requireAdmin(req, res, next);
            assert(req.user, 'req.user must be authenticated');

            const middleware = anomalyRouter.stack.find(s => !s.route && typeof s.handle === 'function');
            let nextCalled = false;
            middleware.handle(req, res, () => { nextCalled = true; });

            assert.strictEqual(nextCalled, false);
            assert.strictEqual(getStatusCode(), 403);
            assert.strictEqual(getBody().error.code, 'FORBIDDEN');
        });
    });
});
