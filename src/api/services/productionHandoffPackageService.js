'use strict';

/**
 * Phase 71D — Control Plane Printhouse Handoff Package
 *
 * Builds a controlled, sanitized handoff package for a preflight job, bundling the
 * approved production artifact reference, human report summary, fix audit summary,
 * validation report summary, artifact trust, warnings, payment/invoice/production-unlock
 * status, order/customer metadata, and file access audit.
 *
 * Policy:
 * - The handoff package is a packaging/delivery manifest, not a new certification authority.
 * - The approved artifact reference is only included when package_release_gate.ready=true.
 * - The package cannot be released unless invoice/payment/production unlock are satisfied
 *   in addition to the preflight production_package_governance.package_ready flag.
 * - No raw filesystem paths, tokens, or internal IDs are exposed.
 */

const FILE_ACCESS_AUDIT_EVENT_TYPES = [
    'PRINTHOUSE_FILE_ACCESS_TOKEN_CREATED',
    'PRINTHOUSE_FILE_DOWNLOAD_DESCRIPTOR_CREATED',
    'PRINTHOUSE_FILE_DOWNLOADED',
    'PRINTHOUSE_HANDOFF_ACCEPTED',
    'PRINTHOUSE_HANDOFF_REJECTED'
];

/**
 * Evaluates whether the handoff package may be released.
 *
 * @param {object} params
 * @param {object} params.productionPackageGovernance  Phase 71B/71C/preflightHumanReportService governance subset
 * @param {object|null} params.invoice                  order metadata.invoice
 * @param {object|null} params.payment                  order metadata.payment
 * @param {object|null} params.productionUnlock         order metadata.production_unlock
 * @returns {{ ready: boolean, blockers: string[] }}
 */
function evaluatePackageReleaseGate({ productionPackageGovernance, invoice, payment, productionUnlock }) {
    const ppg = productionPackageGovernance || {};
    const blockers = [];

    if (ppg.package_ready !== true) {
        blockers.push('PREFLIGHT_PACKAGE_NOT_READY');
    }
    if (Array.isArray(ppg.blocked_by_governance_domains) && ppg.blocked_by_governance_domains.length > 0) {
        blockers.push('GOVERNANCE_DOMAINS_BLOCKING');
    }
    if (!invoice || invoice.status !== 'ISSUED') {
        blockers.push('INVOICE_NOT_ISSUED');
    }
    if (!payment || payment.status !== 'PAYMENT_CONFIRMED') {
        blockers.push('PAYMENT_NOT_CONFIRMED');
    }
    if (!productionUnlock || productionUnlock.status !== 'PRODUCTION_UNLOCKED') {
        blockers.push('PRODUCTION_NOT_UNLOCKED');
    }

    return {
        ready: blockers.length === 0,
        blockers
    };
}

/**
 * Builds a sanitized order/customer summary safe for printhouse handoff display.
 */
function buildOrderSummary(order) {
    if (!order) return null;
    return {
        order_id: order.orderId || null,
        status: order.status || null,
        printhouse_id: order.printhouseId || null,
        customer_name: order.customer?.name || null,
        total: order.totals?.total ?? null,
        currency: order.totals?.currency || null
    };
}

/**
 * Filters and sanitizes order audit events down to file-access-relevant entries.
 * Never exposes tokens or raw storage paths.
 */
function sanitizeFileAccessAuditEvents(events) {
    if (!Array.isArray(events)) return [];
    return events
        .filter(e => FILE_ACCESS_AUDIT_EVENT_TYPES.includes(e.eventType || e.type))
        .map(e => ({
            event_type: e.eventType || e.type,
            actor: e.payload?.actor || e.actorId || 'SYSTEM',
            role: e.payload?.role || null,
            created_at: e.createdAt || e.created_at || null
        }));
}

/**
 * Builds the validation report summary from human report standards governance.
 */
function buildValidationReportSummary(report) {
    const stdGov = report?.standards_certification_governance;
    if (!stdGov || Object.keys(stdGov).length === 0) return null;
    return {
        standard_claimed: report.standard_claimed ?? null,
        standard_certified: stdGov.standard_certified === true,
        validation_performed: stdGov.validation_performed === true,
        validation_passed: stdGov.validation_passed === true,
        validator_name: stdGov.validator_name || null,
        validator_version: stdGov.validator_version || null,
        validation_report_hash: stdGov.validation_report_hash || null
    };
}

/**
 * Builds the full printhouse handoff package for a preflight job.
 *
 * @param {string} jobId
 * @param {object} context  gateway context (Authorization, tenantId, ...)
 * @param {object} options  { orderId? } — orderId override if known by the caller
 * @returns {Promise<object>}
 */
async function buildProductionHandoffPackage(jobId, context = {}, options = {}) {
    const humanReportService = require('./preflightHumanReportService');
    const marketplaceOrderService = require('./marketplaceOrderService');
    const mysqlClient = require('./mysqlClient');

    const reportRes = await humanReportService.getHumanReport(jobId, context);
    if (!reportRes || !reportRes.ok) {
        return { ok: false, error: (reportRes && reportRes.error) || 'HUMAN_REPORT_UNAVAILABLE' };
    }
    const report = reportRes.report;
    const productionPackageGovernance = report.production_package_governance || {};

    // Resolve the order linked to this preflight job, if any.
    let orderId = options.orderId || null;
    if (!orderId) {
        try {
            const rows = await mysqlClient.query(
                'SELECT order_id FROM marketplace_order_files WHERE preflight_job_id = ? LIMIT 1',
                [jobId]
            );
            if (rows && rows.length > 0) orderId = rows[0].order_id;
        } catch (e) {
            // Order linkage is best-effort — proceed without it.
        }
    }

    let order = null;
    let invoice = null;
    let payment = null;
    let productionUnlock = null;
    let fileAccessAudit = [];

    if (orderId) {
        try {
            order = await marketplaceOrderService.getOrder(orderId);
        } catch (e) {
            // ignore
        }

        try {
            const rows = await mysqlClient.query('SELECT metadata_json FROM marketplace_orders WHERE order_id = ?', [orderId]);
            if (rows && rows.length > 0) {
                const raw = rows[0].metadata_json;
                const metadata = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
                invoice = metadata.invoice || null;
                payment = metadata.payment || null;
                productionUnlock = metadata.production_unlock || null;
            }
        } catch (e) {
            // ignore
        }

        try {
            const auditRes = await marketplaceOrderService.listAuditEvents({ orderIntentId: orderId, limit: 200 });
            fileAccessAudit = sanitizeFileAccessAuditEvents(auditRes?.events || []);
        } catch (e) {
            // ignore
        }
    }

    const packageReleaseGate = evaluatePackageReleaseGate({
        productionPackageGovernance,
        invoice,
        payment,
        productionUnlock
    });

    const approvedArtifact = packageReleaseGate.ready
        ? {
            type: productionPackageGovernance.approved_artifact_type || null,
            hash: productionPackageGovernance.approved_artifact_hash || null
        }
        : null;

    const warnings = [...new Set([
        ...(productionPackageGovernance.warnings || []),
        ...(productionPackageGovernance.blocked_by_governance_domains || []).map(d => `Blocked by governance domain: ${d}`)
    ])];

    return {
        ok: true,
        job_id: jobId,
        order_id: orderId,
        generated_at: new Date().toISOString(),
        package_release_gate: packageReleaseGate,
        approved_artifact: approvedArtifact,
        included_reports: productionPackageGovernance.included_reports || [],
        human_report_summary: {
            recommended_next_action: report.recommended_next_action || null,
            review_required: report.fix_summary?.review_required === true,
            production_certified: report.fix_summary?.production_certified === true,
            highest_risk_level: report.fix_summary?.highest_risk_level || 'UNKNOWN'
        },
        fix_audit_summary: {
            applied_count: report.fix_summary?.applied_count || 0,
            skipped_count: report.fix_summary?.skipped_count || 0,
            failed_count: report.fix_summary?.failed_count || 0
        },
        validation_report_summary: buildValidationReportSummary(report),
        artifact_trust: report.artifact_trust || {},
        warnings,
        payment_status: {
            invoice_status: invoice?.status || 'UNKNOWN',
            payment_status: payment?.status || 'UNKNOWN',
            production_unlock_status: productionUnlock?.status || 'PRODUCTION_LOCKED'
        },
        order_summary: buildOrderSummary(order),
        file_access_audit: fileAccessAudit
    };
}

module.exports = {
    buildProductionHandoffPackage,
    evaluatePackageReleaseGate,
    buildOrderSummary,
    sanitizeFileAccessAuditEvents,
    buildValidationReportSummary,
    FILE_ACCESS_AUDIT_EVENT_TYPES
};
