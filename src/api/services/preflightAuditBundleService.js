/**
 * src/api/services/preflightAuditBundleService.js
 * 
 * Phase 74D — Control Plane Audit Export Service.
 * Compiles a defensible compliance/audit bundle containing preflight findings, fixes,
 * artifact hashes, validator evidence, and lifecycle events, dynamically sanitizing
 * based on audience (operator vs. customer).
 */

const db = require('./mysqlClient');
const humanReportService = require('./preflightHumanReportService');
const crypto = require('crypto');
const logger = require('./logger').child('preflight-audit-bundle');

const PATH_PATTERN = /[A-Za-z]:[/\\]|\/(tmp|var|home|storage)\//;
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_PATTERN = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;

const PII_KEYS = new Set([
    'customer_email', 'email', 'phone', 'phone_number', 'customer_phone', 'address',
    'customer_address', 'shipping_address', 'billing_address', 'shippingAddress', 'billingAddress',
    'tax_id', 'taxId', 'customer_name', 'fullName'
]);

/**
 * Recursively sanitizes an object/array/value for customer audience.
 */
function sanitizeForCustomer(val) {
    if (val === null || val === undefined) return val;

    if (Array.isArray(val)) {
        return val.map(item => sanitizeForCustomer(item));
    }

    if (typeof val === 'object') {
        const cleaned = {};
        for (const [key, value] of Object.entries(val)) {
            // Block sensitive keys entirely
            const keyLower = key.toLowerCase();
            if (
                PII_KEYS.has(key) ||
                keyLower.includes('command') ||
                keyLower.includes('path') ||
                keyLower.includes('token') ||
                keyLower.includes('secret') ||
                keyLower.includes('password') ||
                keyLower.includes('credentials') ||
                keyLower.includes('debug') ||
                keyLower.includes('internal') ||
                keyLower.includes('staging')
            ) {
                cleaned[key] = '[REDACTED]';
                continue;
            }
            cleaned[key] = sanitizeForCustomer(value);
        }
        return cleaned;
    }

    if (typeof val === 'string') {
        let cleanStr = val;
        // Check for local file paths
        if (PATH_PATTERN.test(cleanStr)) {
            return '[PATH_REDACTED]';
        }
        // Check for emails
        if (EMAIL_PATTERN.test(cleanStr)) {
            cleanStr = cleanStr.replace(EMAIL_PATTERN, '[EMAIL_REDACTED]');
        }
        // Check for phone numbers
        if (PHONE_PATTERN.test(cleanStr)) {
            cleanStr = cleanStr.replace(PHONE_PATTERN, '[PHONE_REDACTED]');
        }
        return cleanStr;
    }

    return val;
}

class PreflightAuditBundleService {
    /**
     * Compiles, signs, and sanitizes an audit bundle for a given preflight job / order.
     * 
     * @param {string} orderId - Marketplace order identifier
     * @param {string} jobId - Preflight job identifier
     * @param {Object} context - Request context (auth, tenantId, etc.)
     * @param {Object} [options] - Options e.g., { audience: 'operator' | 'customer' }
     */
    async compileAuditBundle(orderId, jobId, context, options = {}) {
        const audience = options.audience || 'customer';
        const tenantId = context?.tenantId || 'ppos-production';

        logger.info({ event: 'COMPILE_BUNDLE_STARTED', orderId, jobId, audience });

        // 1. Fetch Human Report Preflight Signals
        const reportResult = await humanReportService.getHumanReport(jobId, context);
        if (!reportResult || !reportResult.ok) {
            throw new Error(`Failed to generate human report for job: ${jobId}`);
        }

        // 2. Query Lifecycle Audit Events from marketplace_order_events
        const orderEvents = await db.query(
            'SELECT * FROM marketplace_order_events WHERE order_id = ? ORDER BY created_at ASC',
            [orderId]
        );
        const lifecycleEvents = (Array.isArray(orderEvents) && Array.isArray(orderEvents[0]) ? orderEvents[0] : (Array.isArray(orderEvents) ? orderEvents : []))
            .map(e => ({
                event_id: e.event_id,
                order_id: e.order_id,
                file_id: e.file_id || null,
                type: e.type,
                actor_type: e.actor_type,
                actor_id: e.actor_id,
                payload: typeof e.payload_json === 'string' ? JSON.parse(e.payload_json) : (e.payload_json || {}),
                created_at: e.created_at
            }));

        // 3. Extract Preflight Artifacts (names, hashes) from the registry if available
        let artifacts = [];
        try {
            const regRows = await db.query('SELECT canonical_payload_json FROM preflight_job_registry WHERE job_id = ? AND tenant_id = ?', [jobId, tenantId]);
            const localRecord = Array.isArray(regRows) && Array.isArray(regRows[0]) ? regRows[0][0] : (Array.isArray(regRows) ? regRows[0] : null);
            if (localRecord) {
                const canonicalData = typeof localRecord.canonical_payload_json === 'string' ? JSON.parse(localRecord.canonical_payload_json) : localRecord.canonical_payload_json;
                const jobPayload = canonicalData.job || canonicalData;
                artifacts = jobPayload.artifacts || jobPayload.artifact_list || [];
            }
        } catch (err) {
            logger.warn({ event: 'ARTIFACT_EXTRACTION_FAILED', error: err.message });
        }

        const artifactManifest = artifacts.map(a => ({
            name: a.filename || a.name || a.type || 'unknown',
            type: a.type || 'unknown',
            hash: a.checksum_sha256 || a.hash || a.checksum || null,
            size_bytes: a.size_bytes || a.sizeBytes || 0,
            customer_visible: a.customer_visible !== false
        }));

        // 4. Extract Upstream audit_bundle_governance (worker/service hashes)
        const auditBundleGov = reportResult.audit_bundle_governance || null;

        // 5. Build raw/operator manifest structure
        const manifest = {
            order_id: orderId,
            job_id: jobId,
            compiled_at: new Date().toISOString(),
            audience,
            preflight_outcome: {
                outcome: reportResult.outcome,
                severity: reportResult.severity,
                summary_title: reportResult.summary_title,
                governance_summary: reportResult.governance_summary || {}
            },
            artifacts: artifactManifest,
            audit_bundle_governance: auditBundleGov,
            lifecycle_timeline: lifecycleEvents
        };

        // 6. Generate defensible SHA-256 signature / hash-lock over critical parts of the manifest
        const canonicalDataToSign = JSON.stringify({
            order_id: manifest.order_id,
            job_id: manifest.job_id,
            preflight_outcome: manifest.preflight_outcome,
            artifacts: manifest.artifacts.map(a => ({ name: a.name, hash: a.hash })),
            audit_bundle_governance: manifest.audit_bundle_governance
        });
        const signature = crypto.createHash('sha256').update(canonicalDataToSign).digest('hex');
        manifest.manifest_hash = signature;

        // 7. Enforce sanitization rules for Customer audience
        if (audience === 'customer') {
            // Apply recursive customer sanitization
            const sanitizedManifest = sanitizeForCustomer(manifest);
            // Redact customer-unsafe artifacts
            sanitizedManifest.artifacts = manifest.artifacts
                .filter(a => a.customer_visible)
                .map(a => sanitizeForCustomer(a));
            
            sanitizedManifest.audience = 'customer';
            // Recalculate signature over sanitized fields to guarantee tamper detection on customer view too
            const customerCanonical = JSON.stringify({
                order_id: sanitizedManifest.order_id,
                job_id: sanitizedManifest.job_id,
                preflight_outcome: sanitizedManifest.preflight_outcome,
                artifacts: sanitizedManifest.artifacts.map(a => ({ name: a.name, hash: a.hash })),
                audit_bundle_governance: sanitizedManifest.audit_bundle_governance
            });
            sanitizedManifest.manifest_hash = crypto.createHash('sha256').update(customerCanonical).digest('hex');
            
            logger.info({ event: 'COMPILE_BUNDLE_SUCCESS', orderId, jobId, hash: sanitizedManifest.manifest_hash });
            return { ok: true, manifest: sanitizedManifest };
        }

        logger.info({ event: 'COMPILE_BUNDLE_SUCCESS', orderId, jobId, hash: manifest.manifest_hash });
        return { ok: true, manifest };
    }
}

module.exports = new PreflightAuditBundleService();
