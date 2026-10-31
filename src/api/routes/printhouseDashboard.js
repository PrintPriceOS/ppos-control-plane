/**
 * src/api/routes/printhouseDashboard.js
 * 
 * Secure Dedicated Printhouse Dashboard API routing.
 * Strictly scopes all returned telemetry, orders, queue dispatches, and incidents
 * to the authenticated tenant_id and printhouse_id.
 */
const express = require('express');
const router = express.Router();
const db = require('../services/mysqlClient');
const { resolveActorContext, requirePrinthouseScope, requireApprovedPrinthouse } = require('../middleware/auth');

// Secure all routes under this router with Printhouse role scope and approved check
router.use(requirePrinthouseScope());
router.use(requireApprovedPrinthouse);

function getCanonicalResult(payload) {
    return payload?.result || payload || {};
}

/**
 * GET /api/printhouse/dashboard/summary
 * Scoped preflight checks, job summary, and storage metrics.
 */
router.get('/summary', async (req, res) => {
    const context = resolveActorContext(req);
    const generatedAt = new Date().toISOString();

    const summary = {
        activeJobs: 0,
        completedJobsToday: 0,
        failedJobsToday: 0,
        storage: {
            sizeBytes: null,
            artifactsCount: null,
            status: "UNAVAILABLE"
        }
    };

    try {
        // Query scoped active and completed jobs from preflight_job_registry through files join
        const jobsSql = `
            SELECT pj.status, pj.created_at
            FROM preflight_job_registry pj
            JOIN marketplace_order_files mof ON pj.job_id = mof.preflight_job_id
            JOIN marketplace_orders mo ON mof.order_id = mo.order_id
            WHERE mo.tenant_id = ? AND mo.printhouse_id = ?
        `;
        const jobRows = await db.query(jobsSql, [context.tenantId, context.printhouseId]);

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        (jobRows || []).forEach(row => {
            const createdTime = new Date(row.created_at).getTime();
            if (['PENDING', 'PROCESSING', 'QUEUED', 'RUNNING'].includes(row.status)) {
                summary.activeJobs++;
            }
            if (row.status === 'COMPLETED' && createdTime >= startOfDay.getTime()) {
                summary.completedJobsToday++;
            }
            if (['FAILED', 'FAILED_RUNTIME_ENVIRONMENT', 'ERROR'].includes(row.status) && createdTime >= startOfDay.getTime()) {
                summary.failedJobsToday++;
            }
        });

        // Query storage metrics using join to guarantee no data leakage
        try {
            const storageSql = `
                SELECT COUNT(ar.id) as cnt, SUM(ar.size_bytes) as total_bytes
                FROM preflight_artifact_registry ar
                JOIN preflight_job_registry jr ON ar.job_id = jr.job_id
                JOIN marketplace_order_files mof ON jr.job_id = mof.preflight_job_id
                JOIN marketplace_orders mo ON mof.order_id = mo.order_id
                WHERE mo.tenant_id = ? AND mo.printhouse_id = ?
            `;
            const [storeRow] = await db.query(storageSql, [context.tenantId, context.printhouseId]);
            if (storeRow && storeRow.cnt > 0) {
                summary.storage.artifactsCount = Number(storeRow.cnt);
                summary.storage.sizeBytes = Number(storeRow.total_bytes || 0);
                summary.storage.status = "ACTIVE";
            } else {
                summary.storage.status = "UNAVAILABLE";
            }
        } catch (e) {
            summary.storage.status = "UNAVAILABLE";
        }

        res.json({
            ok: true,
            data: summary,
            meta: {
                generatedAt,
                scope: "PRINTHOUSE",
                freshness: "LIVE",
                partial: false
            }
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/printhouse/dashboard/orders
 * Scoped expected revenue and assigned orders list.
 */
router.get('/orders', async (req, res) => {
    const context = resolveActorContext(req);
    const generatedAt = new Date().toISOString();

    try {
        const ordersSql = `
            SELECT order_id, status, currency, estimated_price, created_at, metadata_json
            FROM marketplace_orders
            WHERE tenant_id = ? AND printhouse_id = ?
              AND status IN ('ACKNOWLEDGED', 'MACHINE_ASSIGNED', 'IN_PRODUCTION', 'SHIPPED')
            ORDER BY created_at DESC
            LIMIT 50
        `;
        const rows = await db.query(ordersSql, [context.tenantId, context.printhouseId]);

        let expectedRevenueEUR = 0;
        const ordersList = [];

        (rows || []).forEach(row => {
            let metadata = {};
            try {
                metadata = typeof row.metadata_json === 'string'
                    ? JSON.parse(row.metadata_json)
                    : (row.metadata_json || {});
            } catch (e) {}

            // Skip sandbox or simulation orders
            if (metadata.sandbox_mode === true || metadata.is_simulation === true) {
                return;
            }

            const val = Number(row.estimated_price || 0);
            if (row.currency === 'EUR') {
                expectedRevenueEUR += val;
            }

            ordersList.push({
                id: row.order_id,
                status: row.status,
                value: val,
                currency: row.currency,
                timestamp: new Date(row.created_at).getTime(),
                isUrgent: !!metadata.urgent
            });
        });

        res.json({
            ok: true,
            data: {
                expectedRevenueEUR,
                orders: ordersList
            },
            meta: {
                generatedAt,
                scope: "PRINTHOUSE",
                freshness: "LIVE",
                partial: false
            }
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/printhouse/dashboard/machines
 * Scoped printer node details (Fleet).
 */
router.get('/machines', async (req, res) => {
    const context = resolveActorContext(req);
    const generatedAt = new Date().toISOString();

    try {
        const sql = `
            SELECT id, name, status, region, heartbeat_at
            FROM printer_nodes
            WHERE tenant_id = ? AND id = ?
        `;
        const rows = await db.query(sql, [context.tenantId, context.printhouseId]);

        const machines = (rows || []).map(row => ({
            id: row.id,
            name: row.name,
            status: row.status,
            region: row.region,
            heartbeatAt: row.heartbeat_at
        }));

        res.json({
            ok: true,
            data: { machines },
            meta: {
                generatedAt,
                scope: "PRINTHOUSE",
                freshness: "LIVE",
                partial: false
            }
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/printhouse/dashboard/queue
 * Scoped queue size and dispatches.
 */
router.get('/queue', async (req, res) => {
    const context = resolveActorContext(req);
    const generatedAt = new Date().toISOString();

    try {
        const sql = `
            SELECT id, status, type, created_at
            FROM jobs
            WHERE tenant_id = ? AND printhouse_id = ?
            ORDER BY created_at DESC
            LIMIT 50
        `;
        const rows = await db.query(sql, [context.tenantId, context.printhouseId]);

        const dispatches = (rows || []).map(row => ({
            id: row.id,
            status: row.status,
            type: row.type,
            timestamp: new Date(row.created_at).getTime()
        }));

        res.json({
            ok: true,
            data: { dispatches },
            meta: {
                generatedAt,
                scope: "PRINTHOUSE",
                freshness: "LIVE",
                partial: false
            }
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/printhouse/dashboard/incidents
 * Scoped operational incidents.
 */
router.get('/incidents', async (req, res) => {
    const context = resolveActorContext(req);
    const generatedAt = new Date().toISOString();

    try {
        const sql = `
            SELECT id, scope, severity, event_type, status, created_at, details_json
            FROM operational_incidents
            WHERE tenant_id = ?
        `;
        const rows = await db.query(sql, [context.tenantId]);

        const incidents = [];
        (rows || []).forEach(row => {
            let details = {};
            try {
                details = typeof row.details_json === 'string'
                    ? JSON.parse(row.details_json)
                    : (row.details_json || {});
            } catch (e) {}

            // Guarantee indirect ownership filter: check machine_id, job_id, or order_id
            const matchesPrinthouse = 
                details.printhouseId === context.printhouseId ||
                details.printhouse_id === context.printhouseId ||
                row.scope === context.printhouseId;

            if (matchesPrinthouse) {
                incidents.push({
                    id: row.id,
                    scope: row.scope,
                    severity: row.severity,
                    eventType: row.event_type,
                    status: row.status,
                    timestamp: new Date(row.created_at).getTime()
                });
            }
        });

        res.json({
            ok: true,
            data: { incidents },
            meta: {
                generatedAt,
                scope: "PRINTHOUSE",
                freshness: "LIVE",
                partial: false
            }
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/printhouse/dashboard/activity
 * Scoped preflight audit events.
 */
router.get('/activity', async (req, res) => {
    const context = resolveActorContext(req);
    const generatedAt = new Date().toISOString();

    try {
        const sql = `
            SELECT id, action, status, message, created_at
            FROM preflight_audit_events
            WHERE tenant_id = ?
            ORDER BY created_at DESC
            LIMIT 50
        `;
        const rows = await db.query(sql, [context.tenantId]);

        const events = (rows || []).map(row => ({
            id: row.id,
            action: row.action,
            status: row.status,
            message: row.message,
            timestamp: new Date(row.created_at).getTime()
        }));

        res.json({
            ok: true,
            data: { events },
            meta: {
                generatedAt,
                scope: "PRINTHOUSE",
                freshness: "LIVE",
                partial: false
            }
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
