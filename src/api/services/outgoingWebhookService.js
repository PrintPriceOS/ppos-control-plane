/**
 * src/api/services/outgoingWebhookService.js
 * 
 * Phase 195F — Signed Outgoing Webhooks Engine & SSRF Protection.
 */
const crypto = require('crypto');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const db = require('./mysqlClient');
const logger = require('./logger').child('outgoing-webhooks');

const DEFAULT_TIMEOUT_MS = 5000;
const BACKOFF_DELAYS_MS = [60000, 300000, 900000]; // 1m, 5m, 15m

class OutgoingWebhookService {

    /**
     * Validates URL against SSRF threats (rejects loopback/private IPs unless explicitly allowed).
     */
    validateTargetUrl(targetUrl) {
        if (!targetUrl || typeof targetUrl !== 'string') {
            throw new Error('Webhook URL is required');
        }

        let parsed;
        try {
            parsed = new URL(targetUrl);
        } catch (e) {
            throw new Error('Invalid webhook target URL format');
        }

        if (!['http:', 'https:'].includes(parsed.protocol)) {
            throw new Error('Webhook URL must use HTTP or HTTPS protocol');
        }

        const allowLocal = process.env.ALLOW_LOCAL_WEBHOOKS === 'true';
        if (!allowLocal) {
            const hostname = parsed.hostname.toLowerCase();
            const isForbidden = 
                hostname === 'localhost' ||
                hostname === '127.0.0.1' ||
                hostname === '0.0.0.0' ||
                hostname === '::1' ||
                hostname === '169.254.169.254' ||
                hostname.startsWith('10.') ||
                hostname.startsWith('192.168.') ||
                /^172\.(1[6-9]|2[0-9]|3[01])\./.test(hostname);

            if (isForbidden) {
                throw new Error('Forbidden webhook target destination: Private or loopback IP addresses are prohibited to prevent SSRF.');
            }
        }

        return parsed.toString();
    }

    /**
     * Creates or updates a tenant webhook subscription.
     */
    async createSubscription({ tenantId, url, events = ['*'], status = 'ACTIVE' }) {

        const validatedUrl = this.validateTargetUrl(url);
        const subscriptionId = uuidv4();
        const secret = crypto.randomBytes(32).toString('hex');

        await db.query(
            `INSERT INTO webhook_subscriptions (id, tenant_id, url, secret, events_json, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, NOW())`,
            [subscriptionId, tenantId, validatedUrl, secret, JSON.stringify(events), status]
        );

        return {
            id: subscriptionId,
            tenantId,
            url: validatedUrl,
            secret, // Exposed ONCE upon creation
            events,
            status
        };
    }

    /**
     * Rotates subscription secret key.
     */
    async rotateSecret(subscriptionId, tenantId) {

        const newSecret = crypto.randomBytes(32).toString('hex');
        const result = await db.query(
            `UPDATE webhook_subscriptions SET secret = ?, updated_at = NOW() WHERE id = ? AND tenant_id = ?`,
            [newSecret, subscriptionId, tenantId]
        );

        if (result.affectedRows === 0) {
            throw new Error('Webhook subscription not found');
        }

        return { subscriptionId, secret: newSecret };
    }

    /**
     * Computes HMAC-SHA256 signature for outgoing webhook payload.
     */
    computeSignature(payloadString, secret) {
        return 'sha256=' + crypto.createHmac('sha256', secret).update(payloadString).digest('hex');
    }

    /**
     * Enqueues an outgoing webhook event to outbox deliveries.
     */
    async enqueueWebhookEvent({ tenantId, eventType, payload, eventId = null }) {

        const actualEventId = eventId || uuidv4();
        const subs = await db.query(
            `SELECT id, url, secret, events_json FROM webhook_subscriptions WHERE tenant_id = ? AND status = 'ACTIVE'`,
            [tenantId]
        );

        const createdDeliveries = [];
        const payloadString = JSON.stringify(payload);

        for (const sub of subs) {
            const events = typeof sub.events_json === 'string' ? JSON.parse(sub.events_json) : (sub.events_json || []);
            if (!events.includes('*') && !events.includes(eventType)) {
                continue;
            }

            const signature = this.computeSignature(payloadString, sub.secret);
            const deliveryId = uuidv4();

            await db.query(
                `INSERT INTO webhook_deliveries (id, tenant_id, subscription_id, event_type, event_id, payload_json, signature, status, attempt_count, max_attempts, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, 3, NOW())`,
                [deliveryId, tenantId, sub.id, eventType, actualEventId, payloadString, signature]
            );

            createdDeliveries.push(deliveryId);
        }

        return { ok: true, count: createdDeliveries.length, deliveryIds: createdDeliveries };
    }

    /**
     * Dispatches a single pending webhook delivery record over HTTP.
     */
    async deliverSingleWebhook(deliveryId, options = {}) {

        const [delivery] = await db.query(
            `SELECT d.id, d.tenant_id, d.subscription_id, d.event_type, d.event_id, d.payload_json, d.signature, d.attempt_count, d.max_attempts,
                    s.url
             FROM webhook_deliveries d
             JOIN webhook_subscriptions s ON d.subscription_id = s.id
             WHERE d.id = ?`,
            [deliveryId]
        );

        if (!delivery) {
            throw new Error(`Webhook delivery ${deliveryId} not found`);
        }

        const timestamp = new Date().toISOString();
        const payloadString = typeof delivery.payload_json === 'string' ? delivery.payload_json : JSON.stringify(delivery.payload_json);
        const attempt = delivery.attempt_count + 1;

        // Custom transport handler for unit/integration testing
        if (options.mockHandler) {
            try {
                const res = await options.mockHandler({
                    url: delivery.url,
                    payload: delivery.payload_json,
                    headers: {
                        'X-PPOS-Signature': delivery.signature,
                        'X-PPOS-Timestamp': timestamp,
                        'X-PPOS-Event-Id': delivery.event_id,
                        'X-PPOS-Tenant-Id': delivery.tenant_id
                    }
                });
                await db.query(`UPDATE webhook_deliveries SET status = 'DELIVERED', attempt_count = ?, last_status_code = 200, delivered_at = NOW() WHERE id = ?`, [attempt, deliveryId]);
                return { ok: true, status: 'DELIVERED', statusCode: 200 };
            } catch (err) {
                const isExhausted = attempt >= delivery.max_attempts;
                const nextRetry = isExhausted ? null : new Date(Date.now() + (BACKOFF_DELAYS_MS[attempt - 1] || 60000));
                await db.query(
                    `UPDATE webhook_deliveries SET status = ?, attempt_count = ?, last_status_code = 500, last_error = ?, next_retry_at = ? WHERE id = ?`,
                    [isExhausted ? 'EXHAUSTED' : 'FAILED', attempt, err.message, nextRetry, deliveryId]
                );
                return { ok: false, status: isExhausted ? 'EXHAUSTED' : 'FAILED', error: err.message };
            }
        }

        try {
            const response = await axios.post(delivery.url, payloadString, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-PPOS-Signature': delivery.signature,
                    'X-PPOS-Timestamp': timestamp,
                    'X-PPOS-Event-Id': delivery.event_id,
                    'X-PPOS-Tenant-Id': delivery.tenant_id,
                    'User-Agent': 'PPOS-Control-Plane-WebhookWorker/1.0'
                },
                timeout: DEFAULT_TIMEOUT_MS
            });

            await db.query(
                `UPDATE webhook_deliveries SET status = 'DELIVERED', attempt_count = ?, last_status_code = ?, delivered_at = NOW() WHERE id = ?`,
                [attempt, response.status, deliveryId]
            );

            return { ok: true, status: 'DELIVERED', statusCode: response.status };

        } catch (err) {
            const statusCode = err.response ? err.response.status : null;
            const errorMsg = err.message || 'HTTP post failed';
            const isExhausted = attempt >= delivery.max_attempts;
            const nextRetry = isExhausted ? null : new Date(Date.now() + (BACKOFF_DELAYS_MS[attempt - 1] || 60000));

            await db.query(
                `UPDATE webhook_deliveries SET status = ?, attempt_count = ?, last_status_code = ?, last_error = ?, next_retry_at = ? WHERE id = ?`,
                [isExhausted ? 'EXHAUSTED' : 'FAILED', attempt, statusCode, errorMsg, nextRetry, deliveryId]
            );

            return { ok: false, status: isExhausted ? 'EXHAUSTED' : 'FAILED', statusCode, error: errorMsg };
        }
    }

    /**
     * Lists tenant subscriptions.
     */
    async listSubscriptions(tenantId) {
        return db.query(`SELECT id, url, events_json, status, created_at, updated_at FROM webhook_subscriptions WHERE tenant_id = ?`, [tenantId]);
    }

    /**
     * Lists recent deliveries.
     */
    async listDeliveries(tenantId) {
        return db.query(
            `SELECT id, subscription_id, event_type, event_id, status, attempt_count, last_status_code, last_error, delivered_at, created_at
             FROM webhook_deliveries WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 50`,
            [tenantId]
        );
    }
}

module.exports = new OutgoingWebhookService();
