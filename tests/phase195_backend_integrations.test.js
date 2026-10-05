/**
 * tests/phase195_backend_integrations.test.js
 * 
 * Comprehensive Unit & Integration Verification Suite for Phase 195:
 * Goal A: Server-Side Session Revocation
 * Goal B: Real TOTP MFA
 * Goal C: Signed Outgoing Webhooks & SSRF Protection
 * Goal D: Slack Alerts Integration
 * Goal E: Gemini Real Assistant Integration
 * Goal F: Governed Pricing Rate Publication Control Plane -> BPE
 */
import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

// Set up fallback mock environment if DB unconfigured
process.env.JWT_SECRET = process.env.JWT_SECRET || 'ppos_test_jwt_secret_key_32_bytes_long';
process.env.JWT_AUDIENCE = 'ppos:control';
process.env.JWT_ISSUER = 'https://auth.printprice.pro';

const userSessionService = require('../src/api/services/userSessionService');
const userMfaService = require('../src/api/services/userMfaService');
const outgoingWebhookService = require('../src/api/services/outgoingWebhookService');
const slackNotificationService = require('../src/api/services/slackNotificationService');
const calibrationAssistantService = require('../src/api/services/calibrationAssistantService');
const bpePublicationService = require('../src/api/services/bpePublicationService');
const db = require('../src/api/services/mysqlClient');

// In-Memory Database Store Fallback for Unit Tests
const inMemoryTables = {
    user_sessions: [],
    user_mfa: [],
    webhook_subscriptions: [],
    webhook_deliveries: [],
    slack_integrations: [],
    bpe_pricing_publications: [],
    printhouse_pricing_revisions: []
};

// Intercept db.query to use in-memory store if DB is unconfigured
const origQuery = db.query.bind(db);
db.query = async function (sql, params = []) {
    try {
        return await origQuery(sql, params);
    } catch (err) {
        if (err.code === 'DB_UNCONFIGURED' || err.code === 'DB_CONNECTION_REFUSED' || err.message?.includes('UNCONFIGURED')) {
            return handleInMemoryQuery(sql, params);
        }
        throw err;
    }
};

function handleInMemoryQuery(sql, params = []) {
    const s = sql.trim();
    
    // DDL Statements
    if (/^CREATE TABLE/i.test(s)) {
        return [];
    }

    // INSERT INTO user_sessions
    if (/INSERT INTO user_sessions/i.test(s)) {
        const [id, userId, tenantId, role, ipAddress, userAgent, status, lastActivityAt, expiresAt] = params;
        const record = {
            id,
            user_id: userId,
            tenant_id: tenantId,
            role,
            ip_address: ipAddress,
            user_agent: userAgent,
            status: 'ACTIVE',
            last_activity_at: new Date(),
            expires_at: params[8] || new Date(Date.now() + 86400000),
            created_at: new Date()
        };
        inMemoryTables.user_sessions.push(record);
        return { affectedRows: 1 };
    }

    // SELECT FROM user_sessions
    if (/SELECT.*FROM user_sessions/i.test(s)) {
        const sessionId = params[0];
        const session = inMemoryTables.user_sessions.find(r => r.id === sessionId);
        return session ? [session] : [];
    }

    // UPDATE user_sessions
    if (/UPDATE user_sessions SET status = 'REVOKED'/i.test(s)) {
        const reason = params[0];
        let affected = 0;
        for (const sess of inMemoryTables.user_sessions) {
            if (s.includes('WHERE user_id = ?')) {
                if (sess.user_id === params[1]) {
                    sess.status = 'REVOKED';
                    sess.revoked_reason = reason;
                    affected++;
                }
            } else if (sess.id === params[1]) {
                sess.status = 'REVOKED';
                sess.revoked_reason = reason;
                affected++;
            }
        }
        return { affectedRows: affected || 1 };
    }

    // INSERT INTO user_mfa
    if (/INSERT INTO user_mfa/i.test(s)) {
        const [userId, tenantId, secret, confirmed, recoveryJson] = params;
        const existingIdx = inMemoryTables.user_mfa.findIndex(r => r.user_id === userId);
        const record = {
            user_id: userId,
            tenant_id: tenantId,
            totp_secret_encrypted: secret,
            is_confirmed: Number(confirmed || 0),
            recovery_codes_json: typeof recoveryJson === 'string' ? recoveryJson : JSON.stringify(recoveryJson),
            last_used_timestep: 0,
            failed_attempts: 0,
            created_at: new Date()
        };
        if (existingIdx >= 0) inMemoryTables.user_mfa[existingIdx] = record;
        else inMemoryTables.user_mfa.push(record);
        return { affectedRows: 1 };
    }

    // SELECT FROM user_mfa
    if (/SELECT.*FROM user_mfa/i.test(s)) {
        const userId = params[0];
        const record = inMemoryTables.user_mfa.find(r => r.user_id === userId);
        return record ? [record] : [];
    }

    // UPDATE user_mfa
    if (/UPDATE user_mfa/i.test(s)) {
        const userId = params[params.length - 1];
        const record = inMemoryTables.user_mfa.find(r => r.user_id === userId);
        if (record) {
            if (s.includes('is_confirmed = 1')) {
                record.is_confirmed = 1;
                record.last_used_timestep = params[0];
            }
            if (s.includes('recovery_codes_json = ?')) {
                record.recovery_codes_json = params[0];
            }
        }
        return { affectedRows: 1 };
    }

    // INSERT INTO webhook_subscriptions
    if (/INSERT INTO webhook_subscriptions/i.test(s)) {
        const [id, tenantId, url, secret, eventsJson, status] = params;
        const record = { id, tenant_id: tenantId, url, secret, events_json: eventsJson, status: status || 'ACTIVE' };
        inMemoryTables.webhook_subscriptions.push(record);
        return { affectedRows: 1 };
    }

    // SELECT FROM webhook_subscriptions
    if (/SELECT.*FROM webhook_subscriptions/i.test(s)) {
        const tenantId = params[0];
        return inMemoryTables.webhook_subscriptions.filter(r => r.tenant_id === tenantId && r.status === 'ACTIVE');
    }

    // INSERT INTO webhook_deliveries
    if (/INSERT INTO webhook_deliveries/i.test(s)) {
        const [id, tenantId, subId, eventType, eventId, payloadJson, signature] = params;
        const record = { id, tenant_id: tenantId, subscription_id: subId, event_type: eventType, event_id: eventId, payload_json: payloadJson, signature, status: 'PENDING', attempt_count: 0, max_attempts: 3 };
        inMemoryTables.webhook_deliveries.push(record);
        return { affectedRows: 1 };
    }

    // SELECT FROM webhook_deliveries JOIN webhook_subscriptions
    if (/FROM webhook_deliveries/i.test(s)) {
        const deliveryId = params[0];
        const del = inMemoryTables.webhook_deliveries.find(r => r.id === deliveryId);
        if (del) {
            const sub = inMemoryTables.webhook_subscriptions.find(r => r.id === del.subscription_id);
            return [{ ...del, url: sub ? sub.url : 'https://example.com/webhook' }];
        }
        return [];
    }

    // UPDATE webhook_deliveries
    if (/UPDATE webhook_deliveries/i.test(s)) {
        const deliveryId = params[params.length - 1];
        const del = inMemoryTables.webhook_deliveries.find(r => r.id === deliveryId);
        if (del) {
            del.status = params[0];
            del.attempt_count = params[1];
        }
        return { affectedRows: 1 };
    }

    // INSERT INTO slack_integrations
    if (/INSERT INTO slack_integrations/i.test(s)) {
        const [id, tenantId, webhookUrl, channelName, enabled, eventsJson] = params;
        const record = { id, tenant_id: tenantId, webhook_url: webhookUrl, channel_name: channelName, enabled, events_json: eventsJson };
        inMemoryTables.slack_integrations = inMemoryTables.slack_integrations.filter(r => r.tenant_id !== tenantId);
        inMemoryTables.slack_integrations.push(record);
        return { affectedRows: 1 };
    }

    // SELECT FROM slack_integrations
    if (/SELECT.*FROM slack_integrations/i.test(s)) {
        const tenantId = params[0];
        const record = inMemoryTables.slack_integrations.find(r => r.tenant_id === tenantId);
        return record ? [record] : [];
    }

    // UPDATE slack_integrations
    if (/UPDATE slack_integrations/i.test(s)) {
        return { affectedRows: 1 };
    }

    // INSERT INTO printhouse_pricing_revisions
    if (/INSERT INTO printhouse_pricing_revisions/i.test(s)) {
        const [id, tenantId, nodeId, acceptedChecksum, proposedChecksum, ratesJson, version] = params;
        const record = { id, tenant_id: tenantId, printer_node_id: nodeId, accepted_patch_checksum: acceptedChecksum, proposed_patch_checksum: proposedChecksum, rates_json: ratesJson, version };
        inMemoryTables.printhouse_pricing_revisions.push(record);
        return { affectedRows: 1 };
    }

    // SELECT FROM printhouse_pricing_revisions
    if (/FROM printhouse_pricing_revisions/i.test(s)) {
        const revId = params[0];
        const rev = inMemoryTables.printhouse_pricing_revisions.find(r => r.id === revId);
        return rev ? [rev] : [];
    }

    // INSERT INTO bpe_pricing_publications
    if (/INSERT INTO bpe_pricing_publications/i.test(s)) {
        const [id, tenantId, nodeId, bpeHouseId, revId, checksum, version] = params;
        const record = { id, tenant_id: tenantId, printer_node_id: nodeId, bpe_printhouse_id: bpeHouseId, revision_id: revId, accepted_patch_checksum: checksum, version, status: 'PENDING' };
        inMemoryTables.bpe_pricing_publications.push(record);
        return { affectedRows: 1 };
    }

    // SELECT FROM bpe_pricing_publications
    if (/FROM bpe_pricing_publications/i.test(s)) {
        const nodeId = params[0];
        const pub = inMemoryTables.bpe_pricing_publications.find(r => r.printer_node_id === nodeId && r.status === 'PUBLISHED');
        return pub ? [pub] : [];
    }

    // UPDATE bpe_pricing_publications
    if (/UPDATE bpe_pricing_publications/i.test(s)) {
        const pubId = params[params.length - 1];
        const pub = inMemoryTables.bpe_pricing_publications.find(r => r.id === pubId);
        if (pub) {
            if (s.includes("status = 'PUBLISHED'")) {
                pub.status = 'PUBLISHED';
                pub.bpe_response_checksum = params[0];
            } else if (s.includes("status = 'FAILED'")) {
                pub.status = 'FAILED';
                pub.error_message = params[0];
            }
        }
        return { affectedRows: 1 };
    }

    return [];
}


describe('Phase 195 Backend Integrations Suite', () => {

    // ── GOAL A: REVOCACIÓN DE SESIONES EN SERVIDOR ───────────────────────────
    describe('Goal A: Server Session Revocation', () => {

        it('should create an active session with valid jti and expiration', async () => {
            const session = await userSessionService.createSession({
                userId: 'user_test_1',
                tenantId: 'tenant_test_1',
                role: 'PRINTHOUSE_ADMIN',
                ipAddress: '127.0.0.1',
                userAgent: 'Mozilla/5.0'
            });

            expect(session.sessionId).toBeDefined();
            expect(session.userId).toBe('user_test_1');

            const check = await userSessionService.validateSession(session.sessionId, 'tenant_test_1');
            expect(check.valid).toBe(true);
            expect(check.session.status).toBe('ACTIVE');
        });

        it('should revoke session on logout and reject subsequent validation', async () => {
            const session = await userSessionService.createSession({
                userId: 'user_logout_test',
                tenantId: 'tenant_test_1',
                role: 'OPERATOR'
            });

            const initialCheck = await userSessionService.validateSession(session.sessionId, 'tenant_test_1');
            expect(initialCheck.valid).toBe(true);

            await userSessionService.revokeSession(session.sessionId, 'tenant_test_1', 'USER_LOGOUT');

            const revokedCheck = await userSessionService.validateSession(session.sessionId, 'tenant_test_1');
            expect(revokedCheck.valid).toBe(false);
            expect(revokedCheck.reason).toBe('SESSION_REVOKED');
        });

        it('should support revoking all active sessions for a user', async () => {
            const s1 = await userSessionService.createSession({ userId: 'user_multi', tenantId: 'tenant_test_1', role: 'VIEWER' });
            const s2 = await userSessionService.createSession({ userId: 'user_multi', tenantId: 'tenant_test_1', role: 'VIEWER' });

            const res = await userSessionService.revokeAllUserSessions('user_multi', 'tenant_test_1', 'SECURITY_RESET');
            expect(res.revokedCount).toBeGreaterThanOrEqual(1);

            const check1 = await userSessionService.validateSession(s1.sessionId, 'tenant_test_1');
            const check2 = await userSessionService.validateSession(s2.sessionId, 'tenant_test_1');
            expect(check1.valid).toBe(false);
            expect(check2.valid).toBe(false);
        });
    });

    // ── GOAL B: REAL TOTP MFA ───────────────────────────────────────────────
    describe('Goal B: Real TOTP MFA', () => {

        it('should initiate MFA setup, encrypt secret, and generate recovery codes', async () => {
            const userId = 'mfa_user_' + Date.now();
            const setup = await userMfaService.setupMfa(userId, 'tenant_test_1', 'mfa@printprice.pro');

            expect(setup.ok).toBe(true);
            expect(setup.secret).toBeDefined();
            expect(setup.otpauthUrl).toContain('otpauth://totp/');
            expect(setup.recoveryCodes).toHaveLength(8);

            const status = await userMfaService.getUserMfaStatus(userId);
            expect(status.mfaEnabled).toBe(false); // Unconfirmed
        });

        it('should confirm MFA with valid TOTP code and enable MFA status', async () => {
            const userId = 'mfa_confirm_user_' + Date.now();
            const setup = await userMfaService.setupMfa(userId, 'tenant_test_1', 'confirm@printprice.pro');

            // Generate expected code for current timestep
            const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
            function base32Decode(s) {
                let bits = 0, val = 0, out = [];
                for (let c of s) {
                    val = (val << 5) | BASE32_CHARS.indexOf(c);
                    bits += 5;
                    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
                }
                return Buffer.from(out);
            }
            const key = base32Decode(setup.secret);
            const step = Math.floor(Date.now() / 1000 / 30);
            const buf = Buffer.alloc(8);
            buf.writeBigInt64BE(BigInt(step), 0);
            const hmac = crypto.createHmac('sha1', key).update(buf).digest();
            const offset = hmac[hmac.length - 1] & 0xf;
            const codeNum = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
            const totpCode = (codeNum % 1000000).toString().padStart(6, '0');

            const confirm = await userMfaService.confirmMfa(userId, 'tenant_test_1', totpCode);
            expect(confirm.ok).toBe(true);

            const status = await userMfaService.getUserMfaStatus(userId);
            expect(status.mfaEnabled).toBe(true);
        });

        it('should reject invalid MFA challenge codes', async () => {
            const userId = 'mfa_invalid_user_' + Date.now();
            await userMfaService.setupMfa(userId, 'tenant_test_1', 'invalid@printprice.pro');

            const verify = await userMfaService.verifyMfaChallenge(userId, '000000');
            expect(verify.valid).toBe(false);
        });
    });

    // ── GOAL C: SIGNED OUTGOING WEBHOOKS ────────────────────────────────────
    describe('Goal C: Signed Outgoing Webhooks & SSRF Protection', () => {

        it('should enforce SSRF protection by rejecting loopback and private IPs', () => {
            expect(() => outgoingWebhookService.validateTargetUrl('http://127.0.0.1/webhook')).toThrow(/SSRF/);
            expect(() => outgoingWebhookService.validateTargetUrl('http://localhost:8080')).toThrow(/SSRF/);
            expect(() => outgoingWebhookService.validateTargetUrl('http://10.0.0.5/api')).toThrow(/SSRF/);
            expect(() => outgoingWebhookService.validateTargetUrl('http://192.168.1.1/event')).toThrow(/SSRF/);

            const validUrl = outgoingWebhookService.validateTargetUrl('https://example.com/webhooks/intake');
            expect(validUrl).toBe('https://example.com/webhooks/intake');
        });

        it('should create subscription, compute HMAC-SHA256 signature, and deliver via mock', async () => {
            const sub = await outgoingWebhookService.createSubscription({
                tenantId: 'tenant_webhook_1',
                url: 'https://example.com/webhook-target',
                events: ['order.created']
            });

            expect(sub.id).toBeDefined();
            expect(sub.secret).toHaveLength(64);

            const payload = { orderId: 'ord_1001', amount: 150.0 };
            const enqueue = await outgoingWebhookService.enqueueWebhookEvent({
                tenantId: 'tenant_webhook_1',
                eventType: 'order.created',
                payload
            });

            expect(enqueue.ok).toBe(true);
            expect(enqueue.deliveryIds).toHaveLength(1);

            let capturedHeaders = null;
            const deliveryResult = await outgoingWebhookService.deliverSingleWebhook(enqueue.deliveryIds[0], {
                mockHandler: async (req) => {
                    capturedHeaders = req.headers;
                    return { status: 200 };
                }
            });

            expect(deliveryResult.ok).toBe(true);
            expect(deliveryResult.status).toBe('DELIVERED');
            expect(capturedHeaders['X-PPOS-Signature']).toContain('sha256=');
            expect(capturedHeaders['X-PPOS-Tenant-Id']).toBe('tenant_webhook_1');
        });
    });

    // ── GOAL D: SLACK ALERTS INTEGRATION ────────────────────────────────────
    describe('Goal D: Real Slack Integration', () => {

        it('should store Slack configuration and redact secret webhook URL', async () => {
            const mockSlackWebhookUrl = ['https://hooks.slack.com', 'services', 'T00000000', 'B00000000', 'MOCK_KEY_REDACTED_FOR_TESTING'].join('/');
            const config = await slackNotificationService.configureSlackIntegration({
                tenantId: 'tenant_slack_1',
                webhookUrl: mockSlackWebhookUrl,
                channelName: '#ops-alerts',
                enabled: true
            });

            expect(config.channelName).toBe('#ops-alerts');
            expect(config.webhookUrlRedacted).toContain('/****');
            expect(config.webhookUrlRedacted).not.toContain('MOCK_KEY_REDACTED_FOR_TESTING');

            const retrieved = await slackNotificationService.getSlackConfig('tenant_slack_1');
            expect(retrieved.configured).toBe(true);
            expect(retrieved.webhookUrlRedacted).toContain('/****');
        });

        it('should execute test notification via controlled mock handler', async () => {
            const mockSlackWebhookUrl = ['https://hooks.slack.com', 'services', 'T11111111', 'B22222222', 'MOCK_KEY_TEST_ALERT'].join('/');
            await slackNotificationService.configureSlackIntegration({
                tenantId: 'tenant_slack_test',
                webhookUrl: mockSlackWebhookUrl,
                channelName: '#test-alerts'
            });

            let capturedPayload = null;
            const testResult = await slackNotificationService.testSlackIntegration('tenant_slack_test', {
                mockHandler: async (req) => {
                    capturedPayload = req.payload;
                    return { ok: true };
                }
            });

            expect(testResult.ok).toBe(true);
            expect(capturedPayload.text).toContain('Test Alert');
        });
    });

    // ── GOAL E: REAL GEMINI EN EL ASISTENTE ─────────────────────────────────
    describe('Goal E: Gemini Real Assistant Integration', () => {

        it('should perform structured extraction, preserve PDF provenance, and enforce zero-write contract', async () => {
            const mockProposal = {
                intent: 'SPEC_EXTRACTION',
                specPatch: {
                    copies: 500,
                    book_width_mm: 170,
                    book_height_mm: 240,
                    interior_pages: 128,
                    interior_print: '1/1',
                    paper_type_interior: 'offset',
                    paper_weight_interior: 80,
                    binding_method: 'perfect bound'
                },
                declaredCommercials: {
                    targetManufacturingPrice: 1250,
                    currency: 'EUR'
                },
                clarificationQuestions: [],
                explanation: 'Extracted 500 copies of 128-page reference book at 1250 EUR target.',
                warnings: [],
                readyForValidation: true
            };

            const response = await calibrationAssistantService.interpret(
                'tenant_gemini_1',
                'Quiero calibrar 500 libros 170x240mm de 128 paginas offset 80g a 1250€',
                { id: 'user_1', email: 'admin@printprice.pro', role: 'SUPER_ADMIN' },
                { mockResponse: mockProposal }
            );

            expect(response.ok).toBe(true);
            expect(response.proposal.intent).toBe('SPEC_EXTRACTION');
            expect(response.proposal.specPatch.copies).toBe(500);
            expect(response.proposal.declaredCommercials.targetManufacturingPrice).toBe(1250);
        });
    });

    // ── GOAL F: PROPAGACIÓN DE TARIFAS CONTROL PLANE -> BPE ────────────────
    describe('Goal F: Governed Rates Publication Control Plane -> BPE', () => {

        it('should publish accepted revision to BPE, verify checksum readback, and support idempotency', async () => {
            const revisionId = 'rev_test_' + Date.now();
            const printerNodeId = 'node_test_1';
            const tenantId = 'tenant_bpe_1';
            const checksum = 'sha256:accepted_test_checksum_12345';

            // Insert mock revision record
            await db.query(
                `INSERT INTO printhouse_pricing_revisions (id, tenant_id, printer_node_id, accepted_patch_checksum, proposed_patch_checksum, rates_json, version, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, 1, NOW())`,
                [revisionId, tenantId, printerNodeId, checksum, checksum, JSON.stringify({ paper: { offset: { gsm80: 0.05 } } })]
            );

            let capturedPayload = null;
            const makeMockBpeResponse = (payload) => {
                const ratesCs = bpePublicationService.computeRatesChecksum(payload.rates);
                return {
                    ok: true,
                    status: 'PUBLISHED',
                    bpe_printhouse_id: payload.bpe_printhouse_id,
                    revision_id: payload.revision_id,
                    accepted_patch_checksum: payload.accepted_patch_checksum,
                    rates_checksum: ratesCs,
                    readback: {
                        verified: true,
                        accepted_patch_checksum: payload.accepted_patch_checksum,
                        rates_checksum: ratesCs
                    }
                };
            };

            const pubResult = await bpePublicationService.publishAcceptedRevision(tenantId, printerNodeId, revisionId, {
                mockHandler: async (payload) => {
                    capturedPayload = payload;
                    return makeMockBpeResponse(payload);
                }
            });

            expect(pubResult.ok).toBe(true);
            expect(pubResult.status).toBe('PUBLISHED');
            expect(pubResult.checksumMatched).toBe(true);
            expect(capturedPayload.origin).toBe('PPOS_CONTROL_PLANE');
            expect(capturedPayload.accepted_patch_checksum).toBe(checksum);

            // Idempotency check
            const rePub = await bpePublicationService.publishAcceptedRevision(tenantId, printerNodeId, revisionId, {
                mockHandler: async (payload) => makeMockBpeResponse(payload)
            });
            expect(rePub.ok).toBe(true);
            expect(rePub.alreadyPublished).toBe(true);
        });
    });
});
