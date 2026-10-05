/**
 * src/api/services/outgoingWebhookService.js
 * 
 * Phase 195F — Signed Outgoing Webhooks Engine & SSRF Protection.
 */
const crypto = require('crypto');
const axios = require('axios');
const http = require('http');
const https = require('https');
const dns = require('dns');
const net = require('net');
const { v4: uuidv4 } = require('uuid');
const db = require('./mysqlClient');
const logger = require('./logger').child('outgoing-webhooks');

const DEFAULT_TIMEOUT_MS = 5000;
const BACKOFF_DELAYS_MS = [60000, 300000, 900000]; // 1m, 5m, 15m

/**
 * Normalizes any IPv4 representation (dotted quad decimal/hex/octal, single integer, 2-part, 3-part)
 * into a 32-bit unsigned integer, or null if not a valid IPv4 representation.
 */
function parseIpv4ToUint32(input) {
    if (!input || typeof input !== 'string') return null;
    let s = input.trim().toLowerCase();

    // Remove IPv4 mapped prefix if present
    if (s.startsWith('::ffff:')) {
        s = s.slice(7);
    }

    // Check single 32-bit integer (hex 0x..., octal 0..., or decimal)
    if (/^0x[0-9a-f]+$/i.test(s)) {
        const val = parseInt(s, 16);
        return (val >= 0 && val <= 0xFFFFFFFF) ? (val >>> 0) : null;
    }
    if (/^\d+$/.test(s)) {
        const val = s.startsWith('0') && s.length > 1 ? parseInt(s, 8) : parseInt(s, 10);
        return (val >= 0 && val <= 0xFFFFFFFF) ? (val >>> 0) : null;
    }

    // Check dotted notation (1 to 4 parts)
    const parts = s.split('.');
    if (parts.length >= 1 && parts.length <= 4) {
        const nums = [];
        for (const part of parts) {
            let n;
            if (/^0x[0-9a-f]+$/i.test(part)) {
                n = parseInt(part, 16);
            } else if (/^0[0-7]+$/i.test(part)) {
                n = parseInt(part, 8);
            } else if (/^\d+$/.test(part)) {
                n = parseInt(part, 10);
            } else {
                return null;
            }
            if (isNaN(n) || n < 0) return null;
            nums.push(n);
        }

        if (parts.length === 4) {
            if (nums.some(n => n > 255)) return null;
            return (((nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]) >>> 0);
        } else if (parts.length === 3) {
            if (nums[0] > 255 || nums[1] > 255 || nums[2] > 0xFFFF) return null;
            return (((nums[0] << 24) | (nums[1] << 16) | nums[2]) >>> 0);
        } else if (parts.length === 2) {
            if (nums[0] > 255 || nums[1] > 0xFFFFFF) return null;
            return (((nums[0] << 24) | nums[1]) >>> 0);
        } else if (parts.length === 1) {
            if (nums[0] > 0xFFFFFFFF) return null;
            return (nums[0] >>> 0);
        }
    }

    return null;
}

/**
 * Checks whether an unsigned 32-bit IPv4 integer falls into private, loopback, multicast, or reserved ranges.
 */
function isPrivateOrForbiddenIpv4Int(ipInt) {
    const b0 = (ipInt >>> 24) & 0xFF;
    const b1 = (ipInt >>> 16) & 0xFF;

    // 0.0.0.0/8 (Current network / "this" network)
    if (b0 === 0) return true;
    // 10.0.0.0/8 (Private RFC 1918)
    if (b0 === 10) return true;
    // 100.64.0.0/10 (Shared Address Space / Carrier-Grade NAT RFC 6598: 100.64.0.0 – 100.127.255.255)
    if (b0 === 100 && (b1 >= 64 && b1 <= 127)) return true;
    // 127.0.0.0/8 (Loopback RFC 1122)
    if (b0 === 127) return true;
    // 169.254.0.0/16 (Link-local RFC 3927 & Cloud Metadata 169.254.169.254)
    if (b0 === 169 && b1 === 254) return true;
    // 172.16.0.0/12 (Private RFC 1918: 172.16.0.0 – 172.31.255.255)
    if (b0 === 172 && (b1 >= 16 && b1 <= 31)) return true;
    // 192.0.0.0/24 (IETF Protocol Assignments)
    if (b0 === 192 && b1 === 0 && ((ipInt >>> 8) & 0xFF) === 0) return true;
    // 192.0.2.0/24 (TEST-NET-1)
    if (b0 === 192 && b1 === 0 && ((ipInt >>> 8) & 0xFF) === 2) return true;
    // 192.88.99.0/24 (6to4 Relay Anycast)
    if (b0 === 192 && b1 === 88 && ((ipInt >>> 8) & 0xFF) === 99) return true;
    // 192.168.0.0/16 (Private RFC 1918)
    if (b0 === 192 && b1 === 168) return true;
    // 198.18.0.0/15 (Network Benchmark Tests: 198.18.0.0 – 198.19.255.255)
    if (b0 === 198 && (b1 === 18 || b1 === 19)) return true;
    // 198.51.100.0/24 (TEST-NET-2)
    if (b0 === 198 && b1 === 51 && ((ipInt >>> 8) & 0xFF) === 100) return true;
    // 203.0.113.0/24 (TEST-NET-3)
    if (b0 === 203 && b1 === 0 && ((ipInt >>> 8) & 0xFF) === 113) return true;
    // 224.0.0.0/4 (Multicast RFC 5771: 224.0.0.0 – 239.255.255.255)
    if (b0 >= 224 && b0 <= 239) return true;
    // 240.0.0.0/4 (Reserved RFC 1112: 240.0.0.0 – 255.255.255.255)
    if (b0 >= 240) return true;

    return false;
}

/**
 * Checks whether an IP string is private, loopback, link-local, cloud metadata, or forbidden.
 * Robustly inspects IPv4, IPv6, IPv4-mapped IPv6, and numeric/hex/octal forms.
 */
function isPrivateOrForbiddenIp(ip) {
    if (!ip || typeof ip !== 'string') return true;
    let clean = ip.trim().toLowerCase();

    // Strip brackets e.g. [::1] or [::ffff:127.0.0.1]
    if (clean.startsWith('[') && clean.endsWith(']')) {
        clean = clean.slice(1, -1).trim();
    }

    // Check if it's an IPv4 representation
    const v4Int = parseIpv4ToUint32(clean);
    if (v4Int !== null) {
        return isPrivateOrForbiddenIpv4Int(v4Int);
    }

    // Check IPv4-mapped IPv6 formats (dotted-quad or hex groups)
    const mappedPrefixMatch = clean.match(/^(?:0:0:0:0:0:ffff:|::ffff:)(.*)$/i);
    if (mappedPrefixMatch) {
        const mappedSuffix = mappedPrefixMatch[1];
        const mappedV4Int = parseIpv4ToUint32(mappedSuffix);
        if (mappedV4Int !== null) {
            return isPrivateOrForbiddenIpv4Int(mappedV4Int);
        }
        const hexParts = mappedSuffix.split(':');
        if (hexParts.length === 2) {
            const h0 = parseInt(hexParts[0], 16);
            const h1 = parseInt(hexParts[1], 16);
            if (!isNaN(h0) && !isNaN(h1) && h0 >= 0 && h0 <= 0xFFFF && h1 >= 0 && h1 <= 0xFFFF) {
                const combinedInt = (((h0 << 16) | h1) >>> 0);
                return isPrivateOrForbiddenIpv4Int(combinedInt);
            }
        }
    }

    // Standard IPv6 check
    if (net.isIPv6(clean)) {
        if (clean === '::1' || clean === '0:0:0:0:0:0:0:1') return true; // Loopback
        if (clean === '::' || clean === '0:0:0:0:0:0:0:0') return true; // Unspecified
        if (clean.startsWith('fc') || clean.startsWith('fd')) return true; // Unique local (fc00::/7)
        if (clean.startsWith('fe8') || clean.startsWith('fe9') || clean.startsWith('fea') || clean.startsWith('feb')) return true; // Link-local (fe80::/10)
        if (clean.startsWith('2001:db8') || clean.startsWith('2001:0db8')) return true; // Documentation RFC 3849
        if (clean.startsWith('ff') || clean.startsWith('00ff')) return true; // Multicast
        if (clean.startsWith('100::') || clean.startsWith('0100::')) return true; // Discard-only RFC 6666
        return false;
    }

    return false;
}

/**
 * Checks hostname directly against loopback, metadata, or private IP labels.
 */
function isPrivateOrForbiddenHostname(hostname) {
    if (!hostname || typeof hostname !== 'string') return true;
    const clean = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
    if (
        clean === 'localhost' ||
        clean.endsWith('.localhost') ||
        clean.endsWith('.local') ||
        clean === '169.254.169.254' ||
        clean === 'metadata.google.internal' ||
        clean === 'instance-data'
    ) {
        return true;
    }
    return isPrivateOrForbiddenIp(clean);
}

/**
 * Creates custom DNS lookup for http/https agents that validates every resolved IP address
 * right before establishing the connection socket. This prevents TOCTOU / DNS rebinding attacks
 * while strictly preserving original Host headers and SNI in TLS handshakes.
 */
function createSsrfSafeLookup(options = {}) {
    const isProduction = process.env.NODE_ENV === 'production';
    const allowLocal = process.env.ALLOW_LOCAL_WEBHOOKS === 'true' && !isProduction;

    return function ssrfSafeLookup(hostname, dnsOpts, callback) {
        if (typeof dnsOpts === 'function') {
            callback = dnsOpts;
            dnsOpts = {};
        }

        if (!allowLocal && isPrivateOrForbiddenHostname(hostname)) {
            return callback(new Error(`SSRF blocked: Hostname "${hostname}" is private, loopback, or metadata.`));
        }

        const resolver = options.dnsResolver || dns.lookup;

        resolver(hostname, { ...dnsOpts, all: true }, (err, addresses) => {
            if (err) return callback(err);
            const list = Array.isArray(addresses) ? addresses : [addresses];
            if (!allowLocal) {
                for (const entry of list) {
                    const ip = typeof entry === 'string' ? entry : entry.address;
                    if (isPrivateOrForbiddenIp(ip)) {
                        return callback(new Error(`SSRF blocked: Resolved IP (${ip}) is private, loopback, or metadata.`));
                    }
                }
            }
            if (dnsOpts && dnsOpts.all) {
                return callback(null, list);
            }
            return callback(null, list[0].address, list[0].family || 4);
        });
    };
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
            if (isPrivateOrForbiddenHostname(hostname)) {
                throw new Error('Forbidden webhook target destination: Private, loopback, or metadata addresses are prohibited to prevent SSRF.');
            }
        }

        return parsed.toString();
    }

    /**
     * Performs async DNS resolution to inspect underlying IPv4/IPv6 addresses against SSRF.
     */
    async validateDnsResolution(targetUrl, options = {}) {
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
            const resolver = options.dnsResolver
                ? (h, opts) => new Promise((resolve, reject) => options.dnsResolver(h, opts, (e, res) => e ? reject(e) : resolve(res)))
                : dns.promises.lookup;

            const resolvedAddresses = await resolver(hostname, { all: true });
            const list = Array.isArray(resolvedAddresses) ? resolvedAddresses : [resolvedAddresses];
            for (const addr of list) {
                const ip = typeof addr === 'string' ? addr : addr.address;
                if (isPrivateOrForbiddenIp(ip)) {
                    throw new Error(`Forbidden webhook target destination: Resolved IP (${ip}) is private, loopback, or metadata (SSRF protection).`);
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
            await this.validateDnsResolution(delivery.url, options);

            const ssrfLookup = options.customLookup || createSsrfSafeLookup(options);
            const httpAgent = new http.Agent({ lookup: ssrfLookup, keepAlive: false });
            const httpsAgent = new https.Agent({ lookup: ssrfLookup, keepAlive: false });

            const response = await axios.post(delivery.url, payloadString, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-PPOS-Signature': delivery.signature,
                    'X-PPOS-Timestamp': timestamp,
                    'X-PPOS-Event-Id': delivery.event_id,
                    'X-PPOS-Tenant-Id': delivery.tenant_id,
                    'User-Agent': 'PPOS-Control-Plane-WebhookWorker/1.0'
                },
                httpAgent,
                httpsAgent,
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
     * Authorized re-delivery operation: verifies tenant ownership of both delivery and subscription.
     * Separated from internal worker execution.
     *
     * @param {Object} params
     * @param {string} params.deliveryId - Webhook delivery ID
     * @param {string} params.tenantId - Requesting tenant ID from auth context
     * @param {string} [params.requestingUserRole] - Role from auth context
     * @param {Object} [params.options] - Testing options (e.g. mockHandler)
     */
    async resendDelivery({ deliveryId, tenantId, requestingUserRole, options = {} }) {
        if (!deliveryId) {
            const err = new Error('deliveryId is required');
            err.statusCode = 400;
            throw err;
        }

        const isSuperAdmin = requestingUserRole === 'SUPER_ADMIN';

        const [delivery] = await db.query(
            `SELECT d.id, d.tenant_id, d.subscription_id, d.status, d.attempt_count, d.max_attempts,
                    s.tenant_id AS sub_tenant_id, s.status AS sub_status, s.url
             FROM webhook_deliveries d
             LEFT JOIN webhook_subscriptions s ON d.subscription_id = s.id
             WHERE d.id = ?`,
            [deliveryId]
        );

        if (!delivery) {
            const err = new Error(`Webhook delivery ${deliveryId} not found`);
            err.statusCode = 404;
            throw err;
        }

        // Strict tenant isolation: Tenant A cannot resend Tenant B's delivery
        if (!isSuperAdmin) {
            if (String(delivery.tenant_id) !== String(tenantId) || (delivery.sub_tenant_id && String(delivery.sub_tenant_id) !== String(tenantId))) {
                const err = new Error(`Forbidden: Tenant ${tenantId} is not authorized to resend delivery ${deliveryId}`);
                err.statusCode = 403;
                throw err;
            }
        }

        if (delivery.sub_status && delivery.sub_status !== 'ACTIVE') {
            const err = new Error(`Cannot resend delivery: Webhook subscription is ${delivery.sub_status}`);
            err.statusCode = 400;
            throw err;
        }

        return this.deliverSingleWebhook(deliveryId, options);
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

const serviceInstance = new OutgoingWebhookService();
serviceInstance.OutgoingWebhookService = OutgoingWebhookService;
serviceInstance.isPrivateOrForbiddenIp = isPrivateOrForbiddenIp;
serviceInstance.isPrivateOrForbiddenHostname = isPrivateOrForbiddenHostname;
serviceInstance.createSsrfSafeLookup = createSsrfSafeLookup;
serviceInstance.parseIpv4ToUint32 = parseIpv4ToUint32;

module.exports = serviceInstance;
