/**
 * src/api/services/developerApiKeyService.js
 *
 * Phase 199A: Self-Service Developer API Key Provisioning, Granular Scopes,
 * Dual Environment Keys (pp_test_<32hex> / pp_live_<32hex>), SHA-256 One-Way Hashing,
 * and Metered Billing / Telemetry Service.
 */
const crypto = require('crypto');
const db = require('./mysqlClient');
const auditLogger = require('./auditLoggerService');

const ALLOWED_SCOPES = [
    'pricing:read',
    'preflight:write',
    'orders:create',
    'webhooks:manage',
    'logistics:read'
];

const TIER_DEFINITIONS = {
    SANDBOX_FREE: {
        name: 'Developer Sandbox',
        monthlyPriceEur: 0,
        rateLimitPerMinute: 60,
        monthlyQuota: 1000,
        allowLiveKeys: false
    },
    PRODUCTION_SCALE: {
        name: 'Production Scale (Metered)',
        monthlyPriceEur: 49,
        rateLimitPerMinute: 600,
        monthlyQuota: 100000,
        allowLiveKeys: true
    },
    ENTERPRISE_TENANT: {
        name: 'Enterprise / Printhouse & Publisher Partner',
        monthlyPriceEur: 0,
        rateLimitPerMinute: 1200,
        monthlyQuota: 1000000,
        allowLiveKeys: true
    }
};

// Global singleton fallback store across ESM/CJS module boundaries in test & dev environments
const fallbackMemoryKeys = globalThis.__PPOS_DEV_API_KEYS_STORE__ || (globalThis.__PPOS_DEV_API_KEYS_STORE__ = new Map());
const fallbackUsageLogs = globalThis.__PPOS_DEV_API_USAGE_LOGS__ || (globalThis.__PPOS_DEV_API_USAGE_LOGS__ = []);

class DeveloperApiKeyService {
    static _isDbConfigured() {
        return Boolean(process.env.MYSQL_HOST || process.env.DATABASE_URL);
    }

    static hashKey(rawKey) {
        return crypto.createHash('sha256').update(String(rawKey).trim()).digest('hex');
    }

    static constantTimeCompare(hashA, hashB) {
        if (typeof hashA !== 'string' || typeof hashB !== 'string') return false;
        const bufA = Buffer.from(hashA, 'hex');
        const bufB = Buffer.from(hashB, 'hex');
        if (bufA.length !== bufB.length) return false;
        return crypto.timingSafeEqual(bufA, bufB);
    }

    static get memoryStore() {
        return fallbackMemoryKeys;
    }

    static get usageLogsStore() {
        return fallbackUsageLogs;
    }

    static generateRawKey(keyType = 'TEST') {
        const typeNormalized = String(keyType).toUpperCase() === 'LIVE' ? 'live' : 'test';
        const randomHex = crypto.randomBytes(16).toString('hex'); // 32 hex chars
        const rawKey = `pp_${typeNormalized}_${randomHex}`;
        const keyPrefix = `pp_${typeNormalized}_${randomHex.slice(0, 4)}`;
        return {
            rawKey,
            keyPrefix,
            hashedKey: DeveloperApiKeyService.hashKey(rawKey),
            keyType: typeNormalized === 'live' ? 'LIVE' : 'TEST'
        };
    }

    static normalizeScopes(scopes) {
        if (!Array.isArray(scopes) || scopes.length === 0) {
            return ['pricing:read', 'preflight:write'];
        }
        const filtered = scopes
            .map(s => String(s).trim().toLowerCase())
            .filter(s => ALLOWED_SCOPES.includes(s));
        return filtered.length > 0 ? Array.from(new Set(filtered)) : ['pricing:read', 'preflight:write'];
    }

    /**
     * Check if a tenant/user is eligible for LIVE keys (either verified partner tenant or active billing).
     */
    async checkLiveKeyEligibility(tenantId, actor = {}) {
        if (!tenantId) return { eligible: false, tier: 'SANDBOX_FREE', reason: 'Missing tenant context' };

        const role = String(actor?.role || '').toUpperCase();
        if (['SUPER_ADMIN', 'OPS_ADMIN', 'PRINTHOUSE_ADMIN', 'PRINTHOUSE_OPERATOR', 'TENANT_ADMIN', 'PUBLISHER'].includes(role)) {
            return { eligible: true, tier: 'ENTERPRISE_TENANT', reason: 'Verified Partner Tenant Role' };
        }

        try {
            // Check if tenant has active billing or verified node
            const rows = await db.query(
                'SELECT billing_tier, stripe_customer_id FROM developer_api_keys WHERE tenant_id = ? AND billing_tier IN ("PRODUCTION_SCALE", "ENTERPRISE_TENANT") LIMIT 1',
                [tenantId]
            );
            const match = Array.isArray(rows) ? (Array.isArray(rows[0]) ? rows[0][0] : rows[0]) : null;
            if (match) {
                return { eligible: true, tier: match.billing_tier, stripeCustomerId: match.stripe_customer_id };
            }
        } catch (_) {}

        // Check Stripe Billing Subscription table / store
        try {
            const stripeBillingService = require('./stripeBillingService');
            const sub = await stripeBillingService.getBillingSubscription(tenantId);
            if (sub && (sub.billingTier === 'PRODUCTION_SCALE' || sub.billingTier === 'ENTERPRISE_TENANT') && sub.status === 'ACTIVE') {
                return {
                    eligible: true,
                    tier: sub.billingTier,
                    stripeCustomerId: sub.stripeCustomerId,
                    stripeSubscriptionId: sub.stripeSubscriptionId
                };
            }
        } catch (_) {}

        // Check in-memory fallback
        for (const rec of fallbackMemoryKeys.values()) {
            if (rec.tenantId === tenantId && (rec.billingTier === 'PRODUCTION_SCALE' || rec.billingTier === 'ENTERPRISE_TENANT')) {
                return { eligible: true, tier: rec.billingTier, stripeCustomerId: rec.stripeCustomerId };
            }
        }

        return {
            eligible: false,
            tier: 'SANDBOX_FREE',
            reason: 'Live Production keys require an active Partner Tenant account or a linked Stripe payment method (Production Scale Plan).'
        };
    }

    /**
     * Provision a new API Key (TEST or LIVE).
     * Returns rawKey ONCE upon creation.
     */
    async createApiKey(tenantId, userId, payload = {}, actor = {}) {
        if (!tenantId) {
            const err = new Error('VALIDATION_ERROR: tenantId is required');
            err.statusCode = 400;
            throw err;
        }

        const keyName = String(payload.keyName || payload.name || 'Default Integration Key').trim().slice(0, 128);
        const requestedType = String(payload.keyType || 'TEST').toUpperCase() === 'LIVE' ? 'LIVE' : 'TEST';
        const scopes = DeveloperApiKeyService.normalizeScopes(payload.scopes);

        let billingTier = 'SANDBOX_FREE';
        let rateLimitPerMinute = TIER_DEFINITIONS.SANDBOX_FREE.rateLimitPerMinute;
        let monthlyQuota = TIER_DEFINITIONS.SANDBOX_FREE.monthlyQuota;
        let resolvedStripeCustomerId = payload.stripeCustomerId || null;

        if (requestedType === 'LIVE') {
            const eligibility = await this.checkLiveKeyEligibility(tenantId, actor);
            if (!eligibility.eligible && !payload.forceLiveUpgrade) {
                const err = new Error(`PAYWALL_REQUIRED: ${eligibility.reason}`);
                err.statusCode = 402;
                err.code = 'PAYWALL_UPGRADE_REQUIRED';
                throw err;
            }
            billingTier = eligibility.eligible ? eligibility.tier : 'PRODUCTION_SCALE';
            resolvedStripeCustomerId = resolvedStripeCustomerId || eligibility.stripeCustomerId || null;
            const tierDef = TIER_DEFINITIONS[billingTier] || TIER_DEFINITIONS.PRODUCTION_SCALE;
            rateLimitPerMinute = tierDef.rateLimitPerMinute;
            monthlyQuota = tierDef.monthlyQuota;
        }

        const id = `dkey_${crypto.randomUUID()}`;
        const { rawKey, keyPrefix, hashedKey, keyType } = DeveloperApiKeyService.generateRawKey(requestedType);
        const scopesJson = JSON.stringify(scopes);
        const now = new Date().toISOString();

        const record = {
            id,
            tenantId,
            userId: String(userId || actor?.id || 'user-default'),
            keyName,
            keyType,
            keyPrefix,
            hashedKey,
            scopes,
            rateLimitPerMinute,
            monthlyQuota,
            usageCurrentMonth: 0,
            billingTier,
            stripeCustomerId: resolvedStripeCustomerId,
            status: 'ACTIVE',
            lastUsedAt: null,
            createdAt: now,
            updatedAt: now
        };

        try {
            await db.query(
                `INSERT INTO developer_api_keys
                (id, tenant_id, user_id, key_name, key_type, key_prefix, hashed_key, scopes_json, rate_limit_per_minute, monthly_quota, usage_current_month, billing_tier, stripe_customer_id, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'ACTIVE')`,
                [
                    record.id,
                    record.tenantId,
                    record.userId,
                    record.keyName,
                    record.keyType,
                    record.keyPrefix,
                    record.hashedKey,
                    scopesJson,
                    record.rateLimitPerMinute,
                    record.monthlyQuota,
                    record.billingTier,
                    record.stripeCustomerId
                ]
            );
        } catch (dbErr) {
            // Store in memory fallback if DB is offline or table not yet migrated in test env
            fallbackMemoryKeys.set(record.id, record);
        }

        // Also keep in memory for fast lookup during test runs
        fallbackMemoryKeys.set(record.id, record);

        await auditLogger.log({
            type: 'DEVELOPER_API_KEY_CREATED',
            tenantId,
            userId: record.userId,
            status: 'SUCCESS',
            metadata: {
                keyId: record.id,
                keyName: record.keyName,
                keyType: record.keyType,
                keyPrefix: record.keyPrefix,
                scopes: record.scopes,
                billingTier: record.billingTier,
                rawKeyLogged: false
            }
        }).catch(() => {});

        return {
            id: record.id,
            tenantId: record.tenantId,
            keyName: record.keyName,
            keyType: record.keyType,
            keyPrefix: record.keyPrefix,
            maskedKey: `${record.keyPrefix}••••••••••••••••••••••••••••`,
            scopes: record.scopes,
            rateLimitPerMinute: record.rateLimitPerMinute,
            monthlyQuota: record.monthlyQuota,
            usageCurrentMonth: 0,
            billingTier: record.billingTier,
            status: record.status,
            createdAt: record.createdAt,
            // ONE-TIME SECRET REVEAL
            rawKey,
            securityWarning: 'Copy and store this API key securely now. For security reasons, the full key cannot be displayed again.'
        };
    }

    /**
     * List all API keys for a tenant (never returns hashedKey or rawKey).
     */
    async listApiKeys(tenantId) {
        if (!tenantId) return [];

        try {
            const rows = await db.query(
                `SELECT id, tenant_id, user_id, key_name, key_type, key_prefix, scopes_json,
                        rate_limit_per_minute, monthly_quota, usage_current_month, billing_tier,
                        stripe_customer_id, status, last_used_at, created_at, updated_at
                 FROM developer_api_keys
                 WHERE tenant_id = ?
                 ORDER BY created_at DESC`,
                [tenantId]
            );
            const list = Array.isArray(rows) ? (Array.isArray(rows[0]) ? rows[0] : rows) : [];
            if (list.length > 0) {
                return list.map(r => ({
                    id: r.id,
                    tenantId: r.tenant_id,
                    userId: r.user_id,
                    keyName: r.key_name,
                    keyType: r.key_type,
                    keyPrefix: r.key_prefix,
                    maskedKey: `${r.key_prefix}••••••••••••••••••••••••••••`,
                    scopes: typeof r.scopes_json === 'string' ? JSON.parse(r.scopes_json) : (r.scopes_json || []),
                    rateLimitPerMinute: Number(r.rate_limit_per_minute || 60),
                    monthlyQuota: Number(r.monthly_quota || 1000),
                    usageCurrentMonth: Number(r.usage_current_month || 0),
                    billingTier: r.billing_tier || 'SANDBOX_FREE',
                    status: r.status,
                    lastUsedAt: r.last_used_at,
                    createdAt: r.created_at,
                    updatedAt: r.updated_at
                }));
            }
        } catch (_) {}

        // Fallback to memory store
        const memResults = [];
        for (const r of fallbackMemoryKeys.values()) {
            if (r.tenantId === tenantId) {
                memResults.push({
                    id: r.id,
                    tenantId: r.tenantId,
                    userId: r.userId,
                    keyName: r.keyName,
                    keyType: r.keyType,
                    keyPrefix: r.keyPrefix,
                    maskedKey: `${r.keyPrefix}••••••••••••••••••••••••••••`,
                    scopes: r.scopes,
                    rateLimitPerMinute: r.rateLimitPerMinute,
                    monthlyQuota: r.monthlyQuota,
                    usageCurrentMonth: r.usageCurrentMonth,
                    billingTier: r.billingTier,
                    status: r.status,
                    lastUsedAt: r.lastUsedAt,
                    createdAt: r.createdAt,
                    updatedAt: r.updatedAt
                });
            }
        }
        return memResults;
    }

    /**
     * Revoke an API Key immediately.
     */
    async revokeApiKey(tenantId, keyId, actor = {}) {
        if (!tenantId || !keyId) {
            const err = new Error('VALIDATION_ERROR: tenantId and keyId are required');
            err.statusCode = 400;
            throw err;
        }

        try {
            await db.query(
                'UPDATE developer_api_keys SET status = "REVOKED" WHERE id = ? AND tenant_id = ?',
                [keyId, tenantId]
            );
        } catch (_) {}

        const mem = fallbackMemoryKeys.get(keyId);
        if (mem && mem.tenantId === tenantId) {
            mem.status = 'REVOKED';
            mem.updatedAt = new Date().toISOString();
        }

        await auditLogger.log({
            type: 'DEVELOPER_API_KEY_REVOKED',
            tenantId,
            userId: actor?.id || 'system',
            status: 'SUCCESS',
            metadata: { keyId }
        }).catch(() => {});

        return { id: keyId, status: 'REVOKED', revokedAt: new Date().toISOString() };
    }

    /**
     * Rotate an existing API key: revokes old key and issues a new one with identical name, type, and scopes.
     */
    async rotateApiKey(tenantId, keyId, actor = {}) {
        const existingKeys = await this.listApiKeys(tenantId);
        const target = existingKeys.find(k => k.id === keyId);
        if (!target) {
            const err = new Error('NOT_FOUND: API Key not found for this tenant');
            err.statusCode = 404;
            throw err;
        }

        await this.revokeApiKey(tenantId, keyId, actor);

        return this.createApiKey(
            tenantId,
            target.userId,
            {
                keyName: `${target.keyName} (Rotated)`,
                keyType: target.keyType,
                scopes: target.scopes,
                forceLiveUpgrade: target.keyType === 'LIVE'
            },
            actor
        );
    }

    /**
     * Upgrade tenant billing tier (Stripe Metered Billing activation).
     */
    async upgradeBillingTier(tenantId, planTier = 'PRODUCTION_SCALE', stripeCustomerId = null, actor = {}) {
        const tierKey = TIER_DEFINITIONS[planTier] ? planTier : 'PRODUCTION_SCALE';
        const tierDef = TIER_DEFINITIONS[tierKey];
        const custId = stripeCustomerId || `cus_ppos_${crypto.randomBytes(6).toString('hex')}`;

        try {
            await db.query(
                `UPDATE developer_api_keys
                 SET billing_tier = ?, stripe_customer_id = ?, rate_limit_per_minute = ?, monthly_quota = ?
                 WHERE tenant_id = ? AND status = 'ACTIVE'`,
                [tierKey, custId, tierDef.rateLimitPerMinute, tierDef.monthlyQuota, tenantId]
            );
        } catch (_) {}

        for (const rec of fallbackMemoryKeys.values()) {
            if (rec.tenantId === tenantId && rec.status === 'ACTIVE') {
                rec.billingTier = tierKey;
                rec.stripeCustomerId = custId;
                rec.rateLimitPerMinute = tierDef.rateLimitPerMinute;
                rec.monthlyQuota = tierDef.monthlyQuota;
            }
        }

        await auditLogger.log({
            type: 'DEVELOPER_BILLING_TIER_UPGRADED',
            tenantId,
            userId: actor?.id || 'system',
            status: 'SUCCESS',
            metadata: { billingTier: tierKey, stripeCustomerId: custId }
        }).catch(() => {});

        return {
            tenantId,
            billingTier: tierKey,
            stripeCustomerId: custId,
            rateLimitPerMinute: tierDef.rateLimitPerMinute,
            monthlyQuota: tierDef.monthlyQuota,
            upgradedAt: new Date().toISOString()
        };
    }

    /**
     * Verify an incoming raw API key (`pp_test_...` or `pp_live_...`), check status & quota, and record usage.
     */
    async verifyRawApiKey(rawKey, requiredScope = null) {
        if (!rawKey || typeof rawKey !== 'string') {
            return { valid: false, statusCode: 401, error: 'Missing or malformed API key' };
        }

        const trimmed = rawKey.trim();
        if (!/^pp_(test|live)_[0-9a-f]{32}$/i.test(trimmed)) {
            return { valid: false, statusCode: 401, error: 'Invalid API key format. Expected pp_test_<32hex> or pp_live_<32hex>' };
        }

        const incomingHash = DeveloperApiKeyService.hashKey(trimmed);
        let keyRecord = null;

        try {
            const rows = await db.query(
                `SELECT id, tenant_id, user_id, key_name, key_type, key_prefix, hashed_key, scopes_json,
                        rate_limit_per_minute, monthly_quota, usage_current_month, billing_tier, stripe_customer_id, status
                 FROM developer_api_keys
                 WHERE hashed_key = ? LIMIT 1`,
                [incomingHash]
            );
            const row = Array.isArray(rows) ? (Array.isArray(rows[0]) ? rows[0][0] : rows[0]) : null;
            if (row) {
                keyRecord = {
                    id: row.id,
                    tenantId: row.tenant_id,
                    userId: row.user_id,
                    keyName: row.key_name,
                    keyType: row.key_type,
                    keyPrefix: row.key_prefix,
                    hashedKey: row.hashed_key,
                    scopes: typeof row.scopes_json === 'string' ? JSON.parse(row.scopes_json) : (row.scopes_json || []),
                    rateLimitPerMinute: Number(row.rate_limit_per_minute || 60),
                    monthlyQuota: Number(row.monthly_quota || 1000),
                    usageCurrentMonth: Number(row.usage_current_month || 0),
                    billingTier: row.billing_tier || 'SANDBOX_FREE',
                    stripeCustomerId: row.stripe_customer_id || null,
                    status: row.status
                };
            }
        } catch (_) {}

        if (!keyRecord) {
            for (const rec of fallbackMemoryKeys.values()) {
                if (DeveloperApiKeyService.constantTimeCompare(rec.hashedKey, incomingHash)) {
                    keyRecord = rec;
                    break;
                }
            }
        }

        if (!keyRecord) {
            return { valid: false, statusCode: 401, error: 'Invalid API key' };
        }

        if (keyRecord.status !== 'ACTIVE') {
            return { valid: false, statusCode: 403, error: `API key is ${keyRecord.status}` };
        }

        if (keyRecord.usageCurrentMonth >= keyRecord.monthlyQuota) {
            return {
                valid: false,
                statusCode: 429,
                error: `Monthly quota exceeded (${keyRecord.monthlyQuota} calls). Please upgrade your billing tier in the Developer Hub.`
            };
        }

        if (requiredScope && !keyRecord.scopes.includes(requiredScope)) {
            return {
                valid: false,
                statusCode: 403,
                error: `Forbidden: API key lacks required scope '${requiredScope}'`
            };
        }

        // Increment usage counter asynchronously
        this.incrementKeyUsage(keyRecord.id, keyRecord.tenantId).catch(() => {});

        return {
            valid: true,
            keyRecord
        };
    }

    async incrementKeyUsage(keyId, tenantId, endpoint = '/api/v1', method = 'POST', statusCode = 200, durationMs = 14, idempotencyKey = null) {
        const mem = fallbackMemoryKeys.get(keyId);
        if (mem) {
            mem.usageCurrentMonth = (mem.usageCurrentMonth || 0) + 1;
            mem.lastUsedAt = new Date().toISOString();
        }

        const isPreflight = endpoint.includes('/api/preflight') || endpoint.includes('preflight');
        const isPricing = endpoint.includes('/api/pricing') || endpoint.includes('pricing');
        const billableUnits = isPreflight ? 0.10 : isPricing ? 0.005 : 0.0;

        fallbackUsageLogs.unshift({
            id: `ulog_${crypto.randomUUID()}`,
            apiKeyId: keyId,
            tenantId,
            endpoint,
            httpMethod: method,
            statusCode,
            durationMs,
            billableUnits,
            createdAt: new Date().toISOString()
        });
        if (fallbackUsageLogs.length > 200) fallbackUsageLogs.pop();

        try {
            await db.query(
                'UPDATE developer_api_keys SET usage_current_month = usage_current_month + 1, last_used_at = CURRENT_TIMESTAMP WHERE id = ?',
                [keyId]
            );
            await db.query(
                `INSERT INTO developer_api_usage_logs (id, api_key_id, tenant_id, endpoint, http_method, status_code, duration_ms, billable_units)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [`ulog_${crypto.randomUUID()}`, keyId, tenantId, endpoint, method, statusCode, durationMs, billableUnits]
            );
        } catch (_) {}

        // Phase 199B: If key is LIVE on PRODUCTION_SCALE and HTTP 200 on Preflight or Pricing, report metered event to Stripe
        if (statusCode === 200 && (isPreflight || isPricing)) {
            let keyRecord = mem;
            if (!keyRecord) {
                try {
                    const rows = await db.query(
                        'SELECT id, tenant_id, key_type, billing_tier, stripe_customer_id FROM developer_api_keys WHERE id = ? LIMIT 1',
                        [keyId]
                    );
                    const row = Array.isArray(rows) ? (Array.isArray(rows[0]) ? rows[0][0] : rows[0]) : null;
                    if (row) {
                        keyRecord = {
                            id: row.id,
                            tenantId: row.tenant_id,
                            keyType: row.key_type,
                            billingTier: row.billing_tier,
                            stripeCustomerId: row.stripe_customer_id
                        };
                    }
                } catch (_) {}
            }

            if (keyRecord && keyRecord.keyType === 'LIVE' && keyRecord.billingTier === 'PRODUCTION_SCALE') {
                const eventName = isPreflight ? 'preflight_2gb_inspection' : 'bpe_pricing_quote';
                try {
                    const stripeBillingService = require('./stripeBillingService');
                    await stripeBillingService.reportMeterUsage({
                        customerId: keyRecord.stripeCustomerId || null,
                        tenantId: keyRecord.tenantId || tenantId,
                        apiKeyId: keyRecord.id || keyId,
                        eventName,
                        quantity: 1,
                        idempotencyKey
                    });
                } catch (_) {}
            }
        }
    }

    /**
     * Log an API call and report Stripe Metered Usage if applicable (pp_live_* on PRODUCTION_SCALE).
     */
    async logApiCall({
        keyRecord = null,
        keyId = null,
        tenantId = null,
        endpoint = '/api/v1',
        method = 'POST',
        statusCode = 200,
        durationMs = 14,
        idempotencyKey = null
    } = {}) {
        const resolvedKeyId = keyRecord?.id || keyId;
        const resolvedTenantId = keyRecord?.tenantId || tenantId;
        if (!resolvedKeyId || !resolvedTenantId) return null;

        await this.incrementKeyUsage(
            resolvedKeyId,
            resolvedTenantId,
            endpoint,
            method,
            statusCode,
            durationMs,
            idempotencyKey
        );

        const isPreflight = endpoint.includes('/api/preflight') || endpoint.includes('preflight');
        const isPricing = endpoint.includes('/api/pricing') || endpoint.includes('pricing');
        return {
            ok: true,
            keyId: resolvedKeyId,
            tenantId: resolvedTenantId,
            endpoint,
            statusCode,
            meteredEvent: statusCode === 200
                ? (isPreflight ? 'preflight_2gb_inspection' : isPricing ? 'bpe_pricing_quote' : null)
                : null
        };
    }

    /**
     * Reset monthly usage counters for all keys belonging to a tenant upon `invoice.payment_succeeded`.
     */
    async resetMonthlyUsageCounters(tenantId) {
        if (!tenantId) return { ok: false };

        try {
            await db.query(
                'UPDATE developer_api_keys SET usage_current_month = 0 WHERE tenant_id = ?',
                [tenantId]
            );
        } catch (_) {}

        for (const rec of fallbackMemoryKeys.values()) {
            if (rec.tenantId === tenantId) {
                rec.usageCurrentMonth = 0;
                rec.updatedAt = new Date().toISOString();
            }
        }

        return { ok: true, tenantId, resetAt: new Date().toISOString() };
    }

    /**
     * Suspend LIVE keys and downgrade tenant billing tier to SANDBOX_FREE
     * upon `invoice.payment_failed` or `customer.subscription.deleted`.
     */
    async handleSubscriptionDowngradeOrSuspension(tenantId, reason = 'customer.subscription.deleted') {
        if (!tenantId) return { ok: false };

        const sandboxDef = TIER_DEFINITIONS.SANDBOX_FREE;

        try {
            await db.query(
                `UPDATE developer_api_keys
                 SET status = CASE WHEN key_type = 'LIVE' THEN 'SUSPENDED' ELSE status END,
                     billing_tier = 'SANDBOX_FREE',
                     rate_limit_per_minute = ?,
                     monthly_quota = ?
                 WHERE tenant_id = ? AND status = 'ACTIVE'`,
                [sandboxDef.rateLimitPerMinute, sandboxDef.monthlyQuota, tenantId]
            );
        } catch (_) {}

        for (const rec of fallbackMemoryKeys.values()) {
            if (rec.tenantId === tenantId && rec.status === 'ACTIVE') {
                if (rec.keyType === 'LIVE') {
                    rec.status = 'SUSPENDED';
                }
                rec.billingTier = 'SANDBOX_FREE';
                rec.rateLimitPerMinute = sandboxDef.rateLimitPerMinute;
                rec.monthlyQuota = sandboxDef.monthlyQuota;
                rec.updatedAt = new Date().toISOString();
            }
        }

        await auditLogger.log({
            type: 'DEVELOPER_SUBSCRIPTION_DOWNGRADED',
            tenantId,
            userId: 'stripe-webhook',
            status: 'WARNING',
            metadata: { reason, targetTier: 'SANDBOX_FREE', liveKeysSuspended: true }
        }).catch(() => {});

        return { ok: true, tenantId, billingTier: 'SANDBOX_FREE', reason };
    }

    async getUsageTelemetry(tenantId) {
        const keys = await this.listApiKeys(tenantId);
        let subscription = null;
        let meterEvents = [];

        try {
            const stripeBillingService = require('./stripeBillingService');
            subscription = await stripeBillingService.getBillingSubscription(tenantId);
            meterEvents = await stripeBillingService.getMeterEventsForTenant(tenantId);
        } catch (_) {}

        const totalCallsMonth = keys.reduce((acc, k) => acc + (k.usageCurrentMonth || 0), 0);
        const activeTierFromKey = keys.find(k => k.status === 'ACTIVE')?.billingTier;
        const activeTier = (subscription?.status === 'ACTIVE' && subscription?.billingTier === 'PRODUCTION_SCALE')
            ? 'PRODUCTION_SCALE'
            : (activeTierFromKey || subscription?.billingTier || 'SANDBOX_FREE');
        const tierDetails = TIER_DEFINITIONS[activeTier] || TIER_DEFINITIONS.SANDBOX_FREE;
        const activeQuota = Math.max(
            tierDetails.monthlyQuota,
            keys.reduce((acc, k) => Math.max(acc, k.monthlyQuota || 1000), 1000)
        );

        let recentLogs = [];
        try {
            const rows = await db.query(
                `SELECT id, api_key_id, endpoint, http_method, status_code, duration_ms, billable_units, created_at
                 FROM developer_api_usage_logs
                 WHERE tenant_id = ?
                 ORDER BY created_at DESC LIMIT 25`,
                [tenantId]
            );
            const list = Array.isArray(rows) ? (Array.isArray(rows[0]) ? rows[0] : rows) : [];
            recentLogs = list.map(r => ({
                id: r.id,
                apiKeyId: r.api_key_id,
                endpoint: r.endpoint,
                httpMethod: r.http_method,
                statusCode: Number(r.status_code),
                durationMs: Number(r.duration_ms),
                billableUnits: Number(r.billable_units),
                createdAt: r.created_at
            }));
        } catch (_) {}

        if (recentLogs.length === 0) {
            recentLogs = fallbackUsageLogs.filter(l => l.tenantId === tenantId).slice(0, 25);
        }

        const logsCostEur = recentLogs.reduce((acc, l) => acc + Number(l.billableUnits || 0), 0);
        const meterCostEur = meterEvents.reduce((acc, m) => acc + Number(m.totalCostEur || 0), 0);
        const accruedCostEur = Math.max(logsCostEur, meterCostEur);

        return {
            tenantId,
            activeTier,
            tierDetails,
            totalCallsMonth,
            monthlyQuota: activeQuota,
            utilizationPct: Math.min(100, Number(((totalCallsMonth / activeQuota) * 100).toFixed(2))),
            avgLatencyMs: recentLogs.length > 0
                ? Math.round(recentLogs.reduce((s, r) => s + r.durationMs, 0) / recentLogs.length)
                : 18,
            successRatePct: recentLogs.length > 0
                ? Number(((recentLogs.filter(r => r.statusCode < 400).length / recentLogs.length) * 100).toFixed(1))
                : 100.0,
            accruedMeteredEur: Number(accruedCostEur.toFixed(3)),
            subscription: subscription || {
                tenantId,
                billingTier: activeTier,
                status: 'ACTIVE',
                stripeCustomerId: null,
                stripeSubscriptionId: null,
                monthlySpendCapEur: 150.00,
                alertEmail: null
            },
            meterEvents: meterEvents.slice(0, 25),
            recentLogs,
            availableScopes: ALLOWED_SCOPES,
            tiersCatalog: TIER_DEFINITIONS
        };
    }

    _clearFallbackStore() {
        fallbackMemoryKeys.clear();
        fallbackUsageLogs.length = 0;
        try {
            const stripeBillingService = require('./stripeBillingService');
            stripeBillingService._clearFallbackStores();
        } catch (_) {}
    }
}

module.exports = new DeveloperApiKeyService();
module.exports.DeveloperApiKeyService = DeveloperApiKeyService;
module.exports.ALLOWED_SCOPES = ALLOWED_SCOPES;
module.exports.TIER_DEFINITIONS = TIER_DEFINITIONS;
