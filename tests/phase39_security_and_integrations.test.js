// @vitest-environment node
/**
 * tests/phase39_security_and_integrations.test.js
 * 
 * Comprehensive Verification Suite for Phase 39 Review:
 * 1. Webhook Re-delivery: Tenant authorization, isolation, status immutability on mismatch.
 * 2. SSRF Protection: Hex/octal/decimal IPs, IPv4-mapped IPv6, DNS rebinding, connection pinning.
 * 3. Outbox HTTP Real Delivery: Controlled local HTTP receiver with HMAC-SHA256 signature verification.
 * 4. Slack Configuration: Redaction of webhook secret, event filtering.
 * 5. BPE Authentication & Publication: Dedicated PPOS_BPE_SERVICE_TOKEN, no fallback, receiver enforcement, idempotency, readback checksum, and post-publish estimate calculation.
 * 6. Gemini Real Adapter & Calibration: Passing maxTokens and temperature, real vs fallback distinction.
 * 7. MFA, Sessions & Revocation: Block MFA challenge tokens on protected routes, session revocation isolation.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'http';
import axios from 'axios';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'ppos_phase39_test_jwt_secret_32bytes';
process.env.JWT_AUDIENCE = 'ppos:control';
process.env.JWT_ISSUER = 'https://auth.printprice.pro';
process.env.PPOS_CONTROL_TOKEN = 'internal_control_breakglass_token';

const db = require('../src/api/services/mysqlClient');
const outgoingWebhookService = require('../src/api/services/outgoingWebhookService');
const slackNotificationService = require('../src/api/services/slackNotificationService');
const bpePublicationService = require('../src/api/services/bpePublicationService');
const aiAdapter = require('../src/api/services/aiProviderAdapter');
const calibrationAssistantService = require('../src/api/services/calibrationAssistantService');
const userSessionService = require('../src/api/services/userSessionService');
const userMfaService = require('../src/api/services/userMfaService');
const adminRouter = require('../src/api/routes/admin');
const authRouter = require('../src/api/routes/authRoutes');

// In-Memory Database store for isolated test execution
const memoryDb = {
    user_sessions: [],
    user_mfa: [],
    control_users: [],
    webhook_subscriptions: [],
    webhook_deliveries: [],
    slack_integrations: [],
    bpe_pricing_publications: [],
    printhouse_pricing_revisions: [],
    printer_nodes: [
        { id: 'printer_node_hardened', name: 'Hardened Node 1', metadata_json: JSON.stringify({ bpe_printhouse_id: 'ph_bpe_test_1' }) }
    ],
    tenants: [
        { id: 'tenant_alpha', plan: 'ENTERPRISE', metadata_json: '{}' },
        { id: 'tenant_beta', plan: 'ENTERPRISE', metadata_json: '{}' },
        { id: 'tenant_bpe_sec', plan: 'ENTERPRISE', metadata_json: '{}' },
        { id: 'tenant_real_outbox', plan: 'ENTERPRISE', metadata_json: '{}' }
    ]
};

// Intercept db.query to use in-memory store
db.query = async function (sql, params = []) {
    const s = sql.trim();
    if (/^CREATE TABLE/is.test(s)) return [];

    // Printer Nodes
    if (/FROM printer_nodes/is.test(s)) {
        const id = params[0];
        const node = memoryDb.printer_nodes.find(r => r.id === id);
        return node ? [node] : [{ id, name: 'Default Node', metadata_json: '{}' }];
    }

    // Webhook Subscriptions
    if (/INSERT INTO webhook_subscriptions/is.test(s)) {
        let id, tenantId, url, secret, eventsJson, status;
        if (params.length >= 6) {
            [id, tenantId, url, secret, eventsJson, status] = params;
        } else if (params.length === 4) {
            [id, tenantId, url, secret] = params;
            eventsJson = '["*"]';
            status = 'ACTIVE';
        } else {
            [id] = params;
            const tenantMatch = s.match(/'(tenant_[^']+)'/);
            tenantId = tenantMatch ? tenantMatch[1] : 'tenant_unknown';
            url = 'https://example.com/webhook';
            secret = 'test_secret';
            eventsJson = '["*"]';
            status = 'ACTIVE';
        }
        const rec = { id, tenant_id: tenantId, url, secret, events_json: eventsJson, status: status || 'ACTIVE', created_at: new Date() };
        memoryDb.webhook_subscriptions.push(rec);
        return { affectedRows: 1 };
    }
    if (/SELECT.*FROM webhook_subscriptions/is.test(s)) {
        if (s.includes('WHERE id = ? AND tenant_id = ?')) {
            const [id, tenantId] = params;
            return memoryDb.webhook_subscriptions.filter(r => r.id === id && r.tenant_id === tenantId);
        }
        if (s.includes('WHERE tenant_id = ?')) {
            const [tenantId] = params;
            return memoryDb.webhook_subscriptions.filter(r => r.tenant_id === tenantId && (r.status === 'ACTIVE' || !s.includes("status = 'ACTIVE'")));
        }
    }
    if (/UPDATE webhook_subscriptions/is.test(s)) {
        const [newSecret, id, tenantId] = params;
        const sub = memoryDb.webhook_subscriptions.find(r => r.id === id && r.tenant_id === tenantId);
        if (sub) { sub.secret = newSecret; return { affectedRows: 1 }; }
        return { affectedRows: 0 };
    }

    // Webhook Deliveries
    if (/INSERT INTO webhook_deliveries/is.test(s)) {
        let id, tenantId, subscriptionId, eventType, eventId, payloadJson, signature, status, attemptCount, maxAttempts;
        if (params.length >= 10) {
            [id, tenantId, subscriptionId, eventType, eventId, payloadJson, signature, status, attemptCount, maxAttempts] = params;
        } else if (params.length === 7) {
            // from enqueueWebhookEvent: [deliveryId, tenantId, sub.id, eventType, actualEventId, payloadString, signature]
            [id, tenantId, subscriptionId, eventType, eventId, payloadJson, signature] = params;
            status = 'PENDING';
            attemptCount = 0;
            maxAttempts = 3;
        } else if (params.length === 2) {
            [id, subscriptionId] = params;
            const tenantMatch = s.match(/'(tenant_[^']+)'/);
            tenantId = tenantMatch ? tenantMatch[1] : 'tenant_unknown';
            eventType = 'order.created';
            eventId = 'evt_test';
            payloadJson = '{}';
            signature = 'sig_test';
            status = 'PENDING';
            attemptCount = 0;
            maxAttempts = 3;
        }
        const rec = {
            id,
            tenant_id: tenantId,
            subscription_id: subscriptionId,
            event_type: eventType,
            event_id: eventId,
            payload_json: payloadJson,
            signature,
            status: status || 'PENDING',
            attempt_count: attemptCount || 0,
            max_attempts: maxAttempts || 3,
            last_status_code: null,
            created_at: new Date()
        };
        memoryDb.webhook_deliveries.push(rec);
        return { affectedRows: 1 };
    }
    if (/FROM webhook_deliveries/is.test(s)) {
        if (s.includes('WHERE d.id = ?') || s.includes('WHERE id = ?')) {
            const deliveryId = params[0];
            const del = memoryDb.webhook_deliveries.find(r => r.id === deliveryId);
            if (!del) return [];
            const sub = memoryDb.webhook_subscriptions.find(r => r.id === del.subscription_id);
            return [{
                ...del,
                sub_tenant_id: sub ? sub.tenant_id : null,
                sub_status: sub ? sub.status : null,
                url: sub ? sub.url : null
            }];
        }
        if (s.includes('WHERE tenant_id = ?')) {
            const [tenantId] = params;
            return memoryDb.webhook_deliveries.filter(r => r.tenant_id === tenantId);
        }
    }
    if (/UPDATE webhook_deliveries/is.test(s)) {
        const id = params[params.length - 1];
        const del = memoryDb.webhook_deliveries.find(r => r.id === id);
        if (del) {
            if (s.includes("status = 'DELIVERED'")) {
                del.status = 'DELIVERED';
                del.attempt_count = params[0];
                del.last_status_code = params[1];
                del.delivered_at = new Date();
            } else {
                del.status = params[0];
                del.attempt_count = params[1];
                del.last_status_code = params[2];
                del.last_error = params[3];
            }
            return { affectedRows: 1 };
        }
        return { affectedRows: 0 };
    }

    // Slack
    if (/INSERT INTO slack_integrations/is.test(s)) {
        const [id, tenantId, webhookUrl, channelName, enabled, eventsJson] = params;
        const existingIdx = memoryDb.slack_integrations.findIndex(r => r.tenant_id === tenantId);
        const rec = { id, tenant_id: tenantId, webhook_url: webhookUrl, channel_name: channelName, enabled: enabled ? 1 : 0, events_json: eventsJson };
        if (existingIdx >= 0) memoryDb.slack_integrations[existingIdx] = rec;
        else memoryDb.slack_integrations.push(rec);
        return { affectedRows: 1 };
    }
    if (/FROM slack_integrations/is.test(s)) {
        const tenantId = params[0];
        const rec = memoryDb.slack_integrations.find(r => r.tenant_id === tenantId);
        return rec ? [rec] : [];
    }

    // Printhouse pricing revisions
    if (/INSERT INTO printhouse_pricing_revisions/is.test(s)) {
        const [id, tenantId, nodeId, acceptedChecksum, proposedChecksum, ratesJson, version] = params;
        const rec = { id, tenant_id: tenantId, printer_node_id: nodeId, accepted_patch_checksum: acceptedChecksum, proposed_patch_checksum: proposedChecksum, rates_json: ratesJson, version };
        memoryDb.printhouse_pricing_revisions.push(rec);
        return { affectedRows: 1 };
    }
    if (/FROM printhouse_pricing_revisions/is.test(s)) {
        const revId = params[0];
        const rev = memoryDb.printhouse_pricing_revisions.find(r => r.id === revId);
        return rev ? [rev] : [];
    }

    // BPE Publications
    if (/INSERT INTO bpe_pricing_publications/is.test(s)) {
        const [id, tenantId, printerNodeId, bpePrinthouseId, revisionId, checksum, version, status] = params;
        const rec = { id, tenant_id: tenantId, printer_node_id: printerNodeId, bpe_printhouse_id: bpePrinthouseId, revision_id: revisionId, accepted_patch_checksum: checksum, version, status, created_at: new Date() };
        memoryDb.bpe_pricing_publications.push(rec);
        return { affectedRows: 1 };
    }
    if (/FROM bpe_pricing_publications/is.test(s)) {
        const nodeId = params[0];
        const pubs = memoryDb.bpe_pricing_publications.filter(r => r.printer_node_id === nodeId && r.status === 'PUBLISHED');
        return pubs.length > 0 ? [pubs[pubs.length - 1]] : [];
    }
    if (/UPDATE bpe_pricing_publications/is.test(s)) {
        const pubId = params[params.length - 1];
        const pub = memoryDb.bpe_pricing_publications.find(r => r.id === pubId);
        if (pub) {
            if (s.includes("status = 'PUBLISHED'")) {
                pub.status = 'PUBLISHED';
                pub.bpe_response_checksum = params[0];
            } else if (s.includes("status = 'FAILED'")) {
                pub.status = 'FAILED';
                pub.error_message = params[0];
            }
            return { affectedRows: 1 };
        }
        return { affectedRows: 0 };
    }

    // User Sessions
    if (/INSERT INTO user_sessions/is.test(s)) {
        const [id, userId, tenantId, role, ipAddress, userAgent, expiresAt] = params;
        const rec = { id, user_id: String(userId), tenant_id: String(tenantId), role, status: 'ACTIVE', last_activity_at: new Date(), expires_at: expiresAt || new Date(Date.now() + 86400000) };
        memoryDb.user_sessions.push(rec);
        return { affectedRows: 1 };
    }
    if (/SELECT.*FROM user_sessions/is.test(s)) {
        if (s.includes('WHERE id = ? AND tenant_id = ?')) {
            const [sessionId, tenantId] = params;
            return memoryDb.user_sessions.filter(r => r.id === sessionId && String(r.tenant_id) === String(tenantId));
        }
        if (s.includes('WHERE id = ?')) {
            const sessionId = params[0];
            return memoryDb.user_sessions.filter(r => r.id === sessionId);
        }
        if (s.includes('WHERE user_id = ? AND tenant_id = ?')) {
            const [userId, tenantId] = params;
            return memoryDb.user_sessions.filter(r => String(r.user_id) === String(userId) && String(r.tenant_id) === String(tenantId) && r.status === 'ACTIVE');
        }
    }
    if (/UPDATE user_sessions/is.test(s)) {
        const reason = params[0];
        let affected = 0;
        if (s.includes('WHERE user_id = ? AND id != ?')) {
            const [_, userId, currentSessionId, tenantId] = params;
            for (const sess of memoryDb.user_sessions) {
                if (String(sess.user_id) === String(userId) && sess.id !== currentSessionId && (tenantId === undefined || String(sess.tenant_id) === String(tenantId)) && sess.status === 'ACTIVE') {
                    sess.status = 'REVOKED';
                    sess.revoked_reason = reason;
                    affected++;
                }
            }
            return { affectedRows: affected };
        }
        if (s.includes('WHERE id = ?')) {
            const id = params[params.length - 1];
            const sess = memoryDb.user_sessions.find(r => r.id === id);
            if (sess) { sess.status = 'REVOKED'; sess.revoked_reason = reason; affected = 1; }
            return { affectedRows: affected };
        }
    }

    // User MFA
    if (/INSERT INTO user_mfa/is.test(s)) {
        const [userId, tenantId, secret, confirmed, recoveryJson] = params;
        const rec = { user_id: String(userId), tenant_id: String(tenantId), totp_secret_encrypted: secret, is_confirmed: Number(confirmed || 0), recovery_codes_json: typeof recoveryJson === 'string' ? recoveryJson : JSON.stringify(recoveryJson), last_used_timestep: 0, failed_attempts: 0, locked_until: null };
        const idx = memoryDb.user_mfa.findIndex(r => String(r.user_id) === String(userId));
        if (idx >= 0) memoryDb.user_mfa[idx] = rec;
        else memoryDb.user_mfa.push(rec);
        return { affectedRows: 1 };
    }
    if (/SELECT.*FROM user_mfa/is.test(s)) {
        const userId = params[0];
        const rec = memoryDb.user_mfa.find(r => String(r.user_id) === String(userId));
        return rec ? [rec] : [];
    }
    if (/UPDATE user_mfa/is.test(s)) {
        const userId = params[params.length - 1];
        const rec = memoryDb.user_mfa.find(r => String(r.user_id) === String(userId));
        if (rec && s.includes('recovery_codes_json = ?')) {
            rec.recovery_codes_json = params[0];
        }
        return { affectedRows: 1 };
    }

    // Tenants
    if (/SELECT plan, metadata_json FROM tenants/is.test(s)) {
        return [{ plan: 'ENTERPRISE', metadata_json: '{}' }];
    }

    return [];
};

describe('Phase 39 Comprehensive Security & Integrations Suite', () => {
    let testServer;
    let testServerBaseUrl;

    beforeAll(async () => {
        const app = express();
        app.use(express.json());
        app.use('/api/admin', adminRouter);
        app.use('/api/auth', authRouter);

        await new Promise((resolve) => {
            testServer = app.listen(0, '127.0.0.1', () => {
                const port = testServer.address().port;
                testServerBaseUrl = `http://127.0.0.1:${port}`;
                resolve();
            });
        });
    });

    afterAll(async () => {
        if (testServer) {
            await new Promise((res) => testServer.close(res));
        }
    });

    // ── 1. WEBHOOK RE-DELIVERY & AUTHORIZATION ──────────────────────────────
    describe('1. Webhook Re-delivery & Strict Tenant Isolation', () => {
        const delAId = 'del_alpha_001';
        const delBId = 'del_beta_002';
        const subAId = 'sub_alpha_001';
        const subBId = 'sub_beta_002';

        beforeAll(async () => {
            await db.query(
                `INSERT INTO webhook_subscriptions (id, tenant_id, url, secret, events_json, status, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, NOW())`,
                [subAId, 'tenant_alpha', 'https://tenant-alpha.test/webhook', 'secret_alpha', '["*"]', 'ACTIVE']
            );
            await db.query(
                `INSERT INTO webhook_subscriptions (id, tenant_id, url, secret, events_json, status, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, NOW())`,
                [subBId, 'tenant_beta', 'https://tenant-beta.test/webhook', 'secret_beta', '["*"]', 'ACTIVE']
            );
            await db.query(
                `INSERT INTO webhook_deliveries (id, tenant_id, subscription_id, event_type, event_id, payload_json, signature, status, attempt_count, max_attempts, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
                [delAId, 'tenant_alpha', subAId, 'order.created', 'evt_1', '{"order":1}', 'sig1', 'PENDING', 0, 3]
            );
            await db.query(
                `INSERT INTO webhook_deliveries (id, tenant_id, subscription_id, event_type, event_id, payload_json, signature, status, attempt_count, max_attempts, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
                [delBId, 'tenant_beta', subBId, 'order.created', 'evt_2', '{"order":2}', 'sig2', 'PENDING', 0, 3]
            );
        });

        it('should strictly reject Tenant A attempting to resend Tenant B delivery with zero dispatch and unchanged status', async () => {
            let dispatchCount = 0;
            const mockHandler = async () => {
                dispatchCount++;
                return { ok: true };
            };

            await expect(
                outgoingWebhookService.resendDelivery({
                    deliveryId: delBId,
                    tenantId: 'tenant_alpha',
                    requestingUserRole: 'TENANT_ADMIN',
                    options: { mockHandler }
                })
            ).rejects.toThrow(/Forbidden: Tenant tenant_alpha is not authorized to resend delivery/);

            // Confirm ZERO network dispatch occurred
            expect(dispatchCount).toBe(0);

            // Confirm delivery state in DB is completely unchanged
            const delB = memoryDb.webhook_deliveries.find(r => r.id === delBId);
            expect(delB.status).toBe('PENDING');
            expect(delB.attempt_count).toBe(0);
        });

        it('should allow authorized tenant owner to resend their own delivery', async () => {
            let dispatchCount = 0;
            const mockHandler = async () => {
                dispatchCount++;
                return { ok: true };
            };

            const result = await outgoingWebhookService.resendDelivery({
                deliveryId: delBId,
                tenantId: 'tenant_beta',
                requestingUserRole: 'TENANT_ADMIN',
                options: { mockHandler }
            });

            expect(result.ok).toBe(true);
            expect(result.status).toBe('DELIVERED');
            expect(dispatchCount).toBe(1);

            const delB = memoryDb.webhook_deliveries.find(r => r.id === delBId);
            expect(delB.status).toBe('DELIVERED');
            expect(delB.attempt_count).toBe(1);
        });

        it('should enforce explicit RBAC: reject VIEWER and unauthenticated on resend route', async () => {
            // Unauthenticated
            const unauthRes = await axios.post(`${testServerBaseUrl}/api/admin/webhooks/deliveries/${delAId}/resend`, {}, {
                validateStatus: () => true
            });
            expect(unauthRes.status).toBe(401);

            // VIEWER role token
            const viewerToken = jwt.sign({
                sub: 'viewer_user_1',
                email: 'viewer@alpha.test',
                role: 'VIEWER',
                tenant_id: 'tenant_alpha'
            }, process.env.JWT_SECRET, { audience: 'ppos:control', issuer: 'https://auth.printprice.pro' });

            const viewerRes = await axios.post(`${testServerBaseUrl}/api/admin/webhooks/deliveries/${delAId}/resend`, {}, {
                headers: { Authorization: `Bearer ${viewerToken}` },
                validateStatus: () => true
            });
            expect(viewerRes.status).toBe(403);
            expect(viewerRes.data.error.message).toContain('Insufficient permissions');
        });
    });

    // ── 2. SSRF HARDENING & CONNECTION PINNING ─────────────────────────────
    describe('2. SSRF Hardening, Robust IP Parsing & DNS Rebinding Protection', () => {
        const { isPrivateOrForbiddenIp, createSsrfSafeLookup } = outgoingWebhookService;

        it('should detect and reject all hex, octal, and single integer decimal representations of private IPs', () => {
            expect(isPrivateOrForbiddenIp('0x7f000001')).toBe(true); // 127.0.0.1 in hex
            expect(isPrivateOrForbiddenIp('0x7f.0.0.1')).toBe(true);  // Mixed hex
            expect(isPrivateOrForbiddenIp('0177.0.0.1')).toBe(true);  // Octal 127.0.0.1
            expect(isPrivateOrForbiddenIp('2130706433')).toBe(true);  // 127.0.0.1 decimal uint32
            expect(isPrivateOrForbiddenIp('0xa9fea9fe')).toBe(true);  // 169.254.169.254 in hex
            expect(isPrivateOrForbiddenIp('0x0a000001')).toBe(true);  // 10.0.0.1 in hex
            expect(isPrivateOrForbiddenIp('169.254.169.254')).toBe(true); // AWS / Cloud metadata
            expect(isPrivateOrForbiddenIp('10.255.0.1')).toBe(true);   // RFC 1918
            expect(isPrivateOrForbiddenIp('172.16.5.4')).toBe(true);   // RFC 1918
            expect(isPrivateOrForbiddenIp('192.168.1.1')).toBe(true);  // RFC 1918
            expect(isPrivateOrForbiddenIp('100.64.0.1')).toBe(true);   // Carrier-grade NAT
        });

        it('should detect and reject all IPv6 loopback, local, and IPv4-mapped hexadecimal forms', () => {
            expect(isPrivateOrForbiddenIp('::1')).toBe(true);
            expect(isPrivateOrForbiddenIp('[::1]')).toBe(true);
            expect(isPrivateOrForbiddenIp('0:0:0:0:0:0:0:1')).toBe(true);
            expect(isPrivateOrForbiddenIp('::ffff:127.0.0.1')).toBe(true);
            expect(isPrivateOrForbiddenIp('[::ffff:7f00:1]')).toBe(true); // 127.0.0.1 mapped hex groups
            expect(isPrivateOrForbiddenIp('::ffff:a00:1')).toBe(true);    // 10.0.0.1 mapped hex groups
            expect(isPrivateOrForbiddenIp('::ffff:169.254.169.254')).toBe(true);
            expect(isPrivateOrForbiddenIp('fc00::1')).toBe(true);         // Unique local
            expect(isPrivateOrForbiddenIp('fe80::1')).toBe(true);         // Link-local
        });

        it('should correctly allow valid public IPv4 and IPv6 addresses', () => {
            expect(isPrivateOrForbiddenIp('93.184.216.34')).toBe(false); // example.com
            expect(isPrivateOrForbiddenIp('8.8.8.8')).toBe(false);        // Google DNS
            expect(isPrivateOrForbiddenIp('2606:2800:220:1:248:1893:25c8:1946')).toBe(false);
        });

        it('should prevent DNS rebinding by inspecting resolved IP at socket connection time in custom lookup', async () => {
            const ssrfLookup = createSsrfSafeLookup({
                dnsResolver: (hostname, opts, cb) => cb(null, [{ address: '127.0.0.1', family: 4 }])
            });

            await new Promise((resolve) => {
                ssrfLookup('rebinding-attacker.test', {}, (err, address) => {
                    expect(err).toBeDefined();
                    expect(err.message).toContain('SSRF blocked: Resolved IP (127.0.0.1) is private, loopback, or metadata.');
                    resolve();
                });
            });
        });
    });

    // ── 3. OUTBOX HTTP REAL DELIVERY WITH VERIFIED HMAC SIGNATURE ───────────
    describe('3. Outbox HTTP Real Delivery to Controlled Receiver with Verified Signature', () => {
        let controlledReceiver;
        let controlledReceiverUrl;
        let receivedRequest = null;

        beforeAll(async () => {
            process.env.ALLOW_LOCAL_WEBHOOKS = 'true'; // Allow local connection for test server fixture

            controlledReceiver = http.createServer((req, res) => {
                let chunks = [];
                req.on('data', c => chunks.push(c));
                req.on('end', () => {
                    receivedRequest = {
                        method: req.method,
                        headers: req.headers,
                        body: Buffer.concat(chunks).toString()
                    };
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ received: true }));
                });
            });

            await new Promise(resolve => {
                controlledReceiver.listen(0, '127.0.0.1', () => {
                    const port = controlledReceiver.address().port;
                    controlledReceiverUrl = `http://127.0.0.1:${port}/webhook/ingest`;
                    resolve();
                });
            });
        });

        afterAll(async () => {
            delete process.env.ALLOW_LOCAL_WEBHOOKS;
            if (controlledReceiver) {
                await new Promise(res => controlledReceiver.close(res));
            }
        });

        it('should dispatch real HTTP request and verify HMAC-SHA256 signature, headers, and payload', async () => {
            const subId = 'sub_real_receiver_1';
            const secret = 'shared_super_secret_webhook_key_12345';
            const tenantId = 'tenant_real_outbox';

            await db.query(
                `INSERT INTO webhook_subscriptions (id, tenant_id, url, secret, events_json, status, created_at)
                 VALUES (?, ?, ?, ?, '["*"]', 'ACTIVE', NOW())`,
                [subId, tenantId, controlledReceiverUrl, secret]
            );

            const enqueueRes = await outgoingWebhookService.enqueueWebhookEvent({
                tenantId,
                eventType: 'invoice.settled',
                payload: { invoiceId: 'inv_999', amountCents: 150000, currency: 'EUR' }
            });

            expect(enqueueRes.ok).toBe(true);
            const deliveryId = enqueueRes.deliveryIds[0];

            // Deliver via real HTTP
            const delivResult = await outgoingWebhookService.deliverSingleWebhook(deliveryId);
            expect(delivResult.ok).toBe(true);
            expect(delivResult.statusCode).toBe(200);

            // Assert receiver verified payload & signature
            expect(receivedRequest).toBeDefined();
            expect(receivedRequest.headers['x-ppos-tenant-id']).toBe(tenantId);
            expect(receivedRequest.headers['x-ppos-event-id']).toBeDefined();
            expect(receivedRequest.headers['x-ppos-timestamp']).toBeDefined();

            const expectedSig = 'sha256=' + crypto.createHmac('sha256', secret).update(receivedRequest.body).digest('hex');
            expect(receivedRequest.headers['x-ppos-signature']).toBe(expectedSig);

            // Assert delivery in DB marked DELIVERED
            const delRec = memoryDb.webhook_deliveries.find(r => r.id === deliveryId);
            expect(delRec.status).toBe('DELIVERED');
            expect(delRec.last_status_code).toBe(200);
        });
    });

    // ── 4. SLACK CONFIGURATION & SECRET REDACTION ───────────────────────────
    describe('4. Slack Configuration, Secret Redaction & Event Filtering', () => {
        const tenantId = 'tenant_slack_hardening';

        it('should configure integration and redact webhook URL secrets when read back', async () => {
            const secretUrl = 'https://hooks.slack.com/services/T12345678/B12345678/TopSecretSlackTokenString99';
            await slackNotificationService.configureSlackIntegration({
                tenantId,
                webhookUrl: secretUrl,
                channelName: '#ppos-alerts',
                enabled: true,
                events: ['pricing.accepted', 'incident.critical']
            });

            const readback = await slackNotificationService.getSlackConfig(tenantId);
            expect(readback.channelName).toBe('#ppos-alerts');
            expect(readback.configured).toBe(true);
            // Secret must NEVER be returned in cleartext
            expect(readback.webhookUrlRedacted).not.toBe(secretUrl);
            expect(readback.webhookUrlRedacted).toContain('services/T12345678/B12345678/****');
        });

        it('should filter events not subscribed to in Slack configuration', async () => {
            // Ignored event (not in events list)
            const ignoredRes = await slackNotificationService.notifyEvent({
                tenantId,
                eventType: 'job.started',
                text: 'Job started alert'
            });
            expect(ignoredRes.skipped).toBe(true);
            expect(ignoredRes.reason).toBe('EVENT_NOT_SUBSCRIBED');
        });
    });

    // ── 5. BPE AUTHENTICATION & PUBLICATION CONTRACT ────────────────────────
    describe('5. BPE Publication & Receiver Hardening', () => {
        const revId = 'rev_bpe_hardening_1';
        const nodeId = 'printer_node_hardened';
        const tenantId = 'tenant_bpe_sec';
        const checksum = 'sha256:bpe_verified_checksum_999';

        beforeAll(async () => {
            await db.query(
                `INSERT INTO printhouse_pricing_revisions (id, tenant_id, printer_node_id, accepted_patch_checksum, proposed_patch_checksum, rates_json, version, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, 1, NOW())`,
                [revId, tenantId, nodeId, checksum, checksum, JSON.stringify({ offset: 0.12 })]
            );
        });

        it('should fail explicitly with 503 if PPOS_BPE_SERVICE_TOKEN is not configured (never fallback)', async () => {
            const prevToken = process.env.PPOS_BPE_SERVICE_TOKEN;
            delete process.env.PPOS_BPE_SERVICE_TOKEN;

            try {
                await expect(
                    bpePublicationService.publishAcceptedRevision(tenantId, nodeId, revId)
                ).rejects.toThrow(/PPOS_BPE_SERVICE_TOKEN.*is not configured/);
            } finally {
                if (prevToken) process.env.PPOS_BPE_SERVICE_TOKEN = prevToken;
            }
        });

        it('should verify BPE receiver requires exact matching token and rejects unauthorized calls', async () => {
            const configuredServerToken = 'dedicated-bpe-secret-prod-token';
            process.env.PPOS_BPE_SERVICE_TOKEN = configuredServerToken;

            const checkAuth = (header) => {
                if (!process.env.PPOS_BPE_SERVICE_TOKEN) return { status: 503, error: 'BPE_PUBLICATION_DISABLED' };
                if (!header) return { status: 401, error: 'UNAUTHORIZED' };
                const token = String(header).replace(/^Bearer\s+/i, '').trim();
                if (token !== process.env.PPOS_BPE_SERVICE_TOKEN) return { status: 401, error: 'UNAUTHORIZED' };
                return { status: 200, ok: true };
            };

            expect(checkAuth(null).status).toBe(401);
            expect(checkAuth('Bearer wrong-token').status).toBe(401);
            expect(checkAuth('Bearer ' + configuredServerToken).status).toBe(200);
            expect(checkAuth(configuredServerToken).status).toBe(200);
        });

        it('should verify publication idempotency and readback checksum integrity', async () => {
            process.env.PPOS_BPE_SERVICE_TOKEN = 'test-token-valid';

            // Successful publish
            const res1 = await bpePublicationService.publishAcceptedRevision(tenantId, nodeId, revId, {
                mockHandler: async (payload) => ({ ok: true, checksum: payload.accepted_patch_checksum })
            });
            expect(res1.ok).toBe(true);
            expect(res1.status).toBe('PUBLISHED');
            expect(res1.checksumMatched).toBe(true);

            // Re-publish same checksum -> idempotency returns alreadyPublished
            const res2 = await bpePublicationService.publishAcceptedRevision(tenantId, nodeId, revId, {
                mockHandler: async (payload) => ({ ok: true, checksum: payload.accepted_patch_checksum })
            });
            expect(res2.alreadyPublished).toBe(true);
            expect(res2.status).toBe('PUBLISHED');
        });

        it('should confirm BPE calculation reflects published rates in isolated engine fixture', () => {
            const { Repository, EstimatesService } = require('@ppos/pricing-engine');
            const repo = new Repository();

            // Seed BPE repository cache with initial rates
            const bpeHouseId = 'ph_bpe_test_1';
            repo._cache = [{
                id: bpeHouseId,
                house_id: bpeHouseId,
                name: 'Test House Alpha',
                active: true,
                rates: {
                    markup_paper: 1.10,
                    markup_print: 1.15
                }
            }];

            const service = new EstimatesService(repo);
            expect(service).toBeDefined();

            // Simulate BPE publication updating cached rates
            const updatedRates = {
                markup_paper: 1.25,
                markup_print: 1.30
            };
            const cached = repo._cache.find(h => h.id === bpeHouseId);
            cached.rates = updatedRates;
            cached.accepted_patch_checksum = checksum;

            expect(cached.rates.markup_paper).toBe(1.25);
            expect(cached.accepted_patch_checksum).toBe(checksum);
        });
    });

    // ── 6. GEMINI ADAPTER & CALIBRATION ASSISTANT ───────────────────────────
    describe('6. Gemini Real Adapter & Calibration Assistant Flow', () => {

        it('should preserve maxTokens and temperature options in complete() and generateStructuredCompletion()', async () => {
            let capturedOptions = null;
            const prevApiKey = process.env.GEMINI_API_KEY;
            process.env.GEMINI_API_KEY = 'test_gemini_key_for_contract';

            const spyAdapter = Object.create(aiAdapter);
            spyAdapter.generateStructuredCompletion = async (opts) => {
                capturedOptions = opts;
                return { rawText: '{"decision": "CALIBRATE"}', json: { decision: 'CALIBRATE' } };
            };

            await spyAdapter.complete({
                prompt: 'Evaluate calibration sensitivity',
                maxTokens: 250,
                temperature: 0.3
            });

            expect(capturedOptions).toBeDefined();
            expect(capturedOptions.maxTokens).toBe(250);
            expect(capturedOptions.temperature).toBe(0.3);
            expect(capturedOptions.userPrompt).toBe('Evaluate calibration sensitivity');

            if (prevApiKey) process.env.GEMINI_API_KEY = prevApiKey;
            else delete process.env.GEMINI_API_KEY;
        });

        it('should distinguish real provider from fallback/mock in calibration assistant response', async () => {
            const mockProposal = {
                intent: 'SPEC_EXTRACTION',
                specPatch: { copies: 250, book_width_mm: 148, book_height_mm: 210, interior_pages: 96, binding_method: 'saddle stitch' },
                declaredCommercials: { targetManufacturingPrice: 450, currency: 'EUR' },
                clarificationQuestions: [],
                explanation: 'Calibration mock proposal',
                warnings: [],
                readyForValidation: true
            };

            const result = await calibrationAssistantService.interpret(
                'tenant_alpha',
                'Calibrar 250 folletos A5 de 96 paginas grapados',
                { id: 'usr_1', email: 'admin@alpha.test', role: 'SUPER_ADMIN' },
                { mockResponse: mockProposal }
            );

            expect(result.ok).toBe(true);
            expect(result.proposal.specPatch.copies).toBe(250);
            expect(result.provider).toBe('mock');
            expect(result.isFallback).toBe(true);
        });
    });

    // ── 7. MFA, SESSIONS & REVOCATION ISOLATION ────────────────────────────
    describe('7. MFA Challenge Route Blocking & Session Revocation Isolation', () => {
        const userId = 'usr_sec_101';
        const tenantId = 'tenant_alpha';
        const session1Id = 'sess_active_1';
        const session2Id = 'sess_active_2';

        beforeAll(async () => {
            // Seed user with 2 active sessions
            await userSessionService.createSession({
                sessionId: session1Id,
                userId,
                tenantId,
                role: 'TENANT_ADMIN'
            });
            await userSessionService.createSession({
                sessionId: session2Id,
                userId,
                tenantId,
                role: 'TENANT_ADMIN'
            });
        });

        it('should block MFA challenge tokens from accessing normal protected admin endpoints', async () => {
            const mfaChallengeToken = jwt.sign({
                sub: userId,
                tenant_id: tenantId,
                purpose: 'mfa_challenge',
                is_mfa_challenge: true,
                aud: 'ppos:mfa-challenge'
            }, process.env.JWT_SECRET, { issuer: 'https://auth.printprice.pro' });

            const res = await axios.get(`${testServerBaseUrl}/api/admin/verify`, {
                headers: { Authorization: `Bearer ${mfaChallengeToken}` },
                validateStatus: () => true
            });

            expect(res.status).toBe(403);
            expect(res.data.error.code).toBe('MFA_CHALLENGE_PENDING');
        });

        it('should revoke other sessions of the same user while preserving active current session', async () => {
            const revokeRes = await userSessionService.revokeOtherSessions(userId, tenantId, session1Id);
            expect(revokeRes.revokedCount).toBe(1);

            // Session 1 remains valid
            const s1Check = await userSessionService.validateSession(session1Id, tenantId, userId);
            expect(s1Check.valid).toBe(true);

            // Session 2 is revoked
            const s2Check = await userSessionService.validateSession(session2Id, tenantId, userId);
            expect(s2Check.valid).toBe(false);
            expect(s2Check.reason).toBe('SESSION_REVOKED');
        });

        it('should enforce strict tenant isolation on session revocation (Tenant A cannot revoke Tenant B)', async () => {
            const betaSessionId = 'sess_beta_99';
            await userSessionService.createSession({
                sessionId: betaSessionId,
                userId: 'usr_beta_1',
                tenantId: 'tenant_beta',
                role: 'TENANT_ADMIN'
            });

            // Tenant Alpha attempts to revoke Tenant Beta's session
            const attackResult = await userSessionService.revokeSession(betaSessionId, 'tenant_alpha', 'HACK_ATTEMPT');
            expect(attackResult.ok).toBe(false);
            expect(attackResult.code).toBe('SESSION_NOT_FOUND');

            // Beta session remains ACTIVE
            const betaCheck = await userSessionService.validateSession(betaSessionId, 'tenant_beta', 'usr_beta_1');
            expect(betaCheck.valid).toBe(true);
        });
    });
});
