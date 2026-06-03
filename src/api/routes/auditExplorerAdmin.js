/**
 * src/api/routes/auditExplorerAdmin.js
 * 
 * Canonical Audit Explorer backend routes targeting the primary api_audit_logs table.
 * 
 * TODO [PHASE 11/12 MES Integration]: 
 * When manufacturing_dispatch_events and manufacturing_evidence_ledger are actually
 * created in the database schema, they should be re-integrated here. 
 * Do NOT query non-existent tables to avoid silent errors.
 */
const express = require('express');
const router = express.Router();
const db = require('../services/mysqlClient');
const logger = require('../services/logger').child('audit-explorer-router');

// Helper to map DB row to unified frontend model
function mapAuditRow(row) {
    let metadata = {};
    if (row.metadata_json) {
        try {
            metadata = typeof row.metadata_json === 'string' ? JSON.parse(row.metadata_json) : row.metadata_json;
        } catch (e) {
            // ignore
        }
    }

    const severityFromStatus = row.status === 'FAILURE' ? 'ERROR' : row.status === 'WARNING' ? 'WARNING' : 'INFO';

    return {
        id: String(row.id),
        timestamp: row.created_at || new Date().toISOString(),
        actor: metadata.actor || row.user_id || row.tenant_id || 'system',
        event_type: row.event_type || 'UNKNOWN',
        entity_type: metadata.entity_type || metadata.resource_type || 'SYSTEM',
        entity_id: metadata.entity_id || metadata.resource_id || 'N/A',
        severity: metadata.severity || severityFromStatus,
        trace_id: metadata.trace_id || metadata.request_id || 'N/A',
        source_service: 'CONTROL_PLANE',
        message: metadata.message || `[${row.event_type}] Completed with status: ${row.status}`,
        metadata_json: metadata,
        tenant_id: row.tenant_id || 'unspecified'
    };
}

async function fetchSourceSafely(queryStr, params) {
    try {
        const rows = await db.query(queryStr, params);
        const data = Array.isArray(rows[0]) ? rows[0] : (Array.isArray(rows) ? rows : []);
        return data.map(mapAuditRow);
    } catch (err) {
        console.error('[AUDIT_EXPLORER_ERROR]', err.message);
        logger.warn({ event: 'audit_source_query_failed', error: err.message });
        return [];
    }
}

/**
 * GET /api/admin/audit
 */
router.get('/', async (req, res) => {
    const limit = Math.min(Number(req.query.limit || 200), 1000);
    const {
        entity_type,
        actor,
        tenant,
        dispatch,
        event_type,
        severity
    } = req.query;

    let apiWhere = "1=1";
    const apiParams = [];

    if (tenant) { apiWhere += " AND tenant_id = ?"; apiParams.push(tenant); }
    if (event_type) { apiWhere += " AND event_type LIKE ?"; apiParams.push(`%${event_type}%`); }
    // Add logic to search inside JSON for actor/entity if strictly needed,
    // or we can do post-filtering for complex logic.
    
    try {
        let combined = await fetchSourceSafely(`
            SELECT id, event_type, tenant_id, user_id, status, metadata_json, created_at
            FROM api_audit_logs
            WHERE ${apiWhere}
            ORDER BY created_at DESC LIMIT ?
        `, [...apiParams, limit * 2]); // Fetch more for post-filtering

        // Post-filter on unified properties
        if (entity_type && entity_type.trim() !== "") {
            combined = combined.filter(c => c.entity_type?.toUpperCase().includes(entity_type.toUpperCase()));
        }
        if (severity && severity.trim() !== "") {
            combined = combined.filter(c => c.severity?.toUpperCase() === severity.toUpperCase());
        }
        if (actor && actor.trim() !== "") {
            combined = combined.filter(c => c.actor?.toLowerCase().includes(actor.toLowerCase()));
        }

        // We don't filter by dispatch here since it's MES specific, but if passed, we can filter entity_id
        if (dispatch && dispatch.trim() !== "") {
            combined = combined.filter(c => c.entity_id === dispatch);
        }

        combined.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        const slicedData = combined.slice(0, limit);

        res.json({
            ok: true,
            count: slicedData.length,
            data: slicedData,
            events: slicedData,
            audit: slicedData,
            source_status: "ACTIVE"
        });
    } catch (err) {
        return res.json({ 
            ok: true, 
            events: [], 
            audit: [], 
            data: [],
            count: 0,
            source_status: "AUDIT_SOURCE_UNAVAILABLE" 
        });
    }
});

/**
 * GET /api/admin/audit/:id
 */
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const combined = await fetchSourceSafely(`
            SELECT id, event_type, tenant_id, user_id, status, metadata_json, created_at
            FROM api_audit_logs
            WHERE id = ? OR JSON_EXTRACT(metadata_json, '$.trace_id') = ? OR JSON_EXTRACT(metadata_json, '$.request_id') = ?
        `, [id, id, id]);

        if (combined.length > 0) {
            return res.json({ ok: true, data: combined[0], lineage: combined });
        }
        res.status(404).json({ ok: false, error: 'FORENSIC_RECORD_NOT_FOUND' });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/audit/entity/:entityType/:entityId
 */
router.get('/entity/:entityType/:entityId', async (req, res) => {
    const { entityType, entityId } = req.params;
    try {
        const combined = await fetchSourceSafely(`
            SELECT id, event_type, tenant_id, user_id, status, metadata_json, created_at
            FROM api_audit_logs
            WHERE JSON_EXTRACT(metadata_json, '$.entity_id') = ? OR JSON_EXTRACT(metadata_json, '$.resource_id') = ?
        `, [entityId, entityId]);

        combined.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        res.json({
            ok: true,
            entityType: entityType.toUpperCase(),
            entityId,
            timeline: combined
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
