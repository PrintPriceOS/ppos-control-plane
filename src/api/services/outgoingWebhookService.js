/**
 * src/api/services/outgoingWebhookService.js
 * 
 * Phase 195F — Signed Outgoing Webhooks Engine & SSRF Protection.
 */
const crypto = require('crypto');
const axios = require('axios');
const dns = require('dns');
const net = require('net');
const { v4: uuidv4 } = require('uuid');
const db = require('./mysqlClient');
const logger = require('./logger').child('outgoing-webhooks');

const DEFAULT_TIMEOUT_MS = 5000;
const BACKOFF_DELAYS_MS = [60000, 300000, 900000]; // 1m, 5m, 15m

function isPrivateOrForbiddenIp(ip) {
    if (!ip || typeof ip !== 'string') return true;
    const clean = ip.trim().toLowerCase();

    // Check IPv4
    if (net.isIPv4(clean)) {
        if (clean === '0.0.0.0' || clean.startsWith('0.')) return true;
        if (clean.startsWith('127.')) return true; // Loopback
        if (clean.startsWith('10.')) return true; // Private RFC 1918
        if (clean.startsWith('192.168.')) return true; // Private RFC 1918
        if (clean.startsWith('169.254.')) return true; // Link-local & Cloud Metadata (169.254.169.254)
        if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(clean)) return true; // Private RFC 1918 (172.16.0.0/12)
        if (/^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./.test(clean)) return true; // Carrier-grade NAT RFC 6598
        if (clean === '255.255.255.255') return true;
        return false;
    }

    // Check IPv6
    if (net.isIPv6(clean)) {
        if (clean === '::1' || clean === '0:0:0:0:0:0:0:1') return true; // Loopback
        if (clean === '::' || clean === '0:0:0:0:0:0:0:0') return true; // Unspecified
        if (clean.startsWith('fc') || clean.startsWith('fd')) return true; // Unique local (fc00::/7)
        if (clean.startsWith('fe8') || clean.startsWith('fe9') || clean.startsWith('fea') || clean.startsWith('feb')) return true; // Link-local (fe80::/10)
        // IPv4-mapped IPv6 (::ffff:127.0.0.1 etc.)
        if (clean.startsWith('::ffff:')) {
            const mappedIpv4 = clean.replace('::ffff:', '');
            return isPrivateOrForbiddenIp(mappedIpv4);
        }
        return false;
    }

    return false;
}

class OutgoingWebhookService {
    constructor() {
        this._workerTimer = null;
        this._isProcessing = false;
    }

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

        // Strictly disallow local webhooks in production
        const isProduction = process.env.NODE_ENV === 'production';
        const allowLocal = process.env.ALLOW_LOCAL_WEBHOOKS === 'true' && !isProduction;

        if (!allowLocal) {
            const hostname = parsed.hostname.toLowerCase();

            // 1. Check hostname string directly for obvious loopback / metadata
            if (
                hostname === 'localhost' ||
                hostname === '127.0.0.1' ||
                hostname === '0.0.0.0' ||
                hostname === '::1' ||
                hostname === '169.254.169.254' ||
                hostname.endsWith('.localhost') ||
                hostname.endsWith('.local')
            ) {
                throw new Error('Forbidden webhook target destination: Loopback or metadata addresses are prohibited to prevent SSRF.');
            }

            if (isPrivateOrForbiddenIp(hostname)) {
                throw new Error('Forbidden webhook target destination: Private or loopback IP addresses are prohibited to prevent SSRF.');
            }
        }

        return parsed.toString();
    }

    /**
     * Performs async DNS resolution to inspect underlying IPv4/IPv6 addresses against SSRF.
     */
    async validateDnsResolution(targetUrl) {
        const isProduction = process.env.NODE_ENV === 'production';
        const allowLocal = process.env.ALLOW_LOCAL_WEBHOOKS === 'true' && !isProduction;
        if (allowLocal) return;

        let parsed;
        try {
            parsed = new URL(targetUrl);
        } catch {
            return;
        }

        const hostname = parsed.hostname.toLowerCase();
        try {
            const resolvedAddresses = await dns.promises.lookup(hostname, { all: true });
            for (const addr of resolvedAddresses) {
                if (isPrivateOrForbiddenIp(addr.address)) {
                    throw new Error(`Forbidden webhook target destination: Resolved IP (${addr.address}) is private, loopback, or metadata (SSRF protection).`);
                }
            }
        } catch (dnsErr) {
            if (dnsErr.message && dnsErr.message.includes('Forbidden webhook target')) {
                throw dnsErr;
            }
            logger.warn('DNS lookup failed for webhook target URL', { hostname, error: dnsErr.message });
            if (isProduction) {
                throw new Error(`Invalid webhook target destination: Unable to resolve hostname "${hostname}".`);
            }
        }
    }

    /**
     * Creates or updates a tenant webhook subscription.
     */
    async createSubscription({ tenantId, url, events = ['*'], status = 'ACTIVE' }) {

        const validatedUrl = this.validateTargetUrl(url);
        await this.validateDnsResolution(url);
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
            await this.validateTargetUrl(delivery.url);

            const response = await axios.post(delivery.url, payloadString, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-PPOS-Signature': delivery.signature,
                    'X-PPOS-Timestamp': timestamp,
                    'X-PPOS-Event-Id': delivery.event_id,
                    'X-PPOS-Tenant-Id': delivery.tenant_id,
                    'User-Agent': 'PPOS-Control-Plane-WebhookWorker/1.0'
                },
                timeout: DEFAULT_TIMEOUT_MS,
                maxRedirects: 0 // Prevent redirect-based SSRF bypass
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
     * Outbox processing: fetches pending deliveries and due retries, dispatching each.
     */
    async processPendingDeliveries(batchSize = 25) {
        if (this._isProcessing) {
            return { processed: 0, inFlight: true };
        }

        this._isProcessing = true;
        try {
            const rows = await db.query(
                `SELECT id FROM webhook_deliveries
                 WHERE status = 'PENDING' OR (status = 'FAILED' AND next_retry_at IS NOT NULL AND next_retry_at <= NOW())
                 ORDER BY created_at ASC
                 LIMIT ?`,
                [batchSize]
            ).catch(err => {
                logger.warn('Failed to query pending webhook deliveries:', err.message);
                return [];
            });

            const results = [];
            for (const row of rows) {
                try {
                    const res = await this.deliverSingleWebhook(row.id);
                    results.push({ id: row.id, ...res });
                } catch (delivErr) {
                    results.push({ id: row.id, ok: false, error: delivErr.message });
                }
            }

            return { processed: results.length, results };
        } finally {
            this._isProcessing = false;
        }
    }

    /**
     * Starts the background outbox polling loop.
     */
    startWorker(intervalMs = 10000) {
        if (this._workerTimer) return;
        this._workerTimer = setInterval(() => {
            this.processPendingDeliveries().catch(err => {
                logger.warn('Error in webhook outbox worker interval:', err.message);
            });
        }, intervalMs);
        if (this._workerTimer.unref) this._workerTimer.unref();
        logger.info('Outgoing webhook outbox worker started', { intervalMs });
    }

    /**
     * Gracefully stops the outbox background worker.
     */
    stopWorker() {
        if (this._workerTimer) {
            clearInterval(this._workerTimer);
            this._workerTimer = null;
            logger.info('Outgoing webhook outbox worker stopped');
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
