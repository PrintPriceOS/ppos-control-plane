/**
 * src/api/routes/auditExplorerAdmin.js
 * 
 * Canonical Audit Explorer backend routes unifying forensic timelines across:
 * - api_audit_log
 * - manufacturing_dispatch_events
 * - manufacturing_evidence_ledger
 * - audit_logs
 */
const express = require('express');
const router = express.Router();
const db = require('../services/mysqlClient');
const logger = require('../services/logger').child('audit-explorer-router');

// Helper to safely execute a query and map its results to a unified schema
async function fetchSourceSafely(sourceName, queryStr, params, mapper) {
    try {
        const rows = await db.query(queryStr, params);
        const data = Array.isArray(rows[0]) ? rows[0] : (Array.isArray(rows) ? rows : []);
        return data.map(row => ({
            id: row.id ? String(row.id) : `gen-${Date.now()}-${Math.random()}`,
            timestamp: row.timestamp || row.created_at || new Date().toISOString(),
            actor: row.actor || row.user_id || row.tenant_id || 'System',
            event_type: row.event_type || row.action || 'UNKNOWN_EVENT',
            entity_type: row.entity_type || 'SYSTEM',
            entity_id: row.entity_id || 'N/A',
            severity: row.severity ? String(row.severity).toUpperCase() : 'INFO',
            trace_id: row.trace_id || row.request_id || row.hash || 'N/A',
            source_service: sourceName,
            message: row.message || row.details || row.action || 'Event snapshot recorded',
            metadata_json: row.metadata_json || row.payload_json || row.governance_snapshot || null,
            tenant_id: row.tenant_id || 'unspecified'
        }));
    } catch (err) {
        logger.warn({ event: 'audit_source_query_failed', sourceName, error: err.message });
        return [];
    }
}

/**
 * GET /api/admin/audit
 * Supports rich multi-parameter forensic filtering.
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

    // 1. Fetch from api_audit_log
    let apiWhere = "1=1";
    const apiParams = [];
    if (tenant) { apiWhere += " AND tenant_id = ?"; apiParams.push(tenant); }
    if (event_type) { apiWhere += " AND action LIKE ?"; apiParams.push(`%${event_type}%`); }
    
    const p1 = fetchSourceSafely('API_GATEWAY', `
        SELECT id, created_at as timestamp, tenant_id as actor, action as event_type, 
               resource_type as entity_type, resource_id as entity_id, 'INFO' as severity, 
               request_id as trace_id, action as message, governance_snapshot as metadata_json, tenant_id 
        FROM api_audit_log 
        WHERE ${apiWhere}
        ORDER BY created_at DESC LIMIT ?
    `, [...apiParams, limit]);

    // 2. Fetch from manufacturing_dispatch_events
    let mesWhere = "1=1";
    const mesParams = [];
    if (tenant) { mesWhere += " AND tenant_id = ?"; mesParams.push(tenant); }
    if (dispatch) { mesWhere += " AND dispatch_id = ?"; mesParams.push(dispatch); }
    if (event_type) { mesWhere += " AND event_type LIKE ?"; mesParams.push(`%${event_type}%`); }
    if (actor) { mesWhere += " AND actor_id LIKE ?"; mesParams.push(`%${actor}%`); }

    const p2 = fetchSourceSafely('MES_ORCHESTRATION', `
        SELECT id, created_at as timestamp, actor_id as actor, event_type, 
               'DISPATCH' as entity_type, dispatch_id as entity_id, 'INFO' as severity, 
               manufacturing_package_id as trace_id, message, metadata_json, tenant_id 
        FROM manufacturing_dispatch_events 
        WHERE ${mesWhere}
        ORDER BY created_at DESC LIMIT ?
    `, [...mesParams, limit]);

    // 3. Fetch from manufacturing_evidence_ledger
    let ledWhere = "1=1";
    const ledParams = [];
    if (tenant) { ledWhere += " AND tenant_id = ?"; ledParams.push(tenant); }
    if (dispatch) { ledWhere += " AND dispatch_id = ?"; ledParams.push(dispatch); }
    if (event_type) { ledWhere += " AND evidence_type LIKE ?"; ledParams.push(`%${event_type}%`); }

    const p3 = fetchSourceSafely('EVIDENCE_LEDGER', `
        SELECT id, created_at as timestamp, tenant_id as actor, evidence_type as event_type, 
               'DISPATCH' as entity_type, dispatch_id as entity_id, 'INFO' as severity, 
               hash as trace_id, CONCAT('Evidence verified node block chain: ', evidence_type) as message, 
               payload_json as metadata_json, tenant_id 
        FROM manufacturing_evidence_ledger 
        WHERE ${ledWhere}
        ORDER BY id DESC LIMIT ?
    `, [...ledParams, limit]);

    // 4. Fetch from general audit_logs
    let genWhere = "1=1";
    const genParams = [];
    if (tenant) { genWhere += " AND tenant_id = ?"; genParams.push(tenant); }
    if (event_type) { genWhere += " AND event_type LIKE ?"; genParams.push(`%${event_type}%`); }

    const p4 = fetchSourceSafely('SYSTEM_CORE', `
        SELECT id, created_at as timestamp, user_id as actor, event_type, 
               'SYSTEM' as entity_type, job_id as entity_id, status as severity, 
               'N/A' as trace_id, CONCAT('Action trigger completed status: ', status) as message, 
               metadata_json, tenant_id 
        FROM audit_logs 
        WHERE ${genWhere}
        ORDER BY created_at DESC LIMIT ?
    `, [...genParams, limit]);

    try {
        const [r1, r2, r3, r4] = await Promise.all([p1, p2, p3, p4]);
        let combined = [...r1, ...r2, ...r3, ...r4];

        // Post-filter on unified properties if requested
        if (entity_type && entity_type.trim() !== "") {
            combined = combined.filter(c => c.entity_type?.toUpperCase().includes(entity_type.toUpperCase()));
        }
        if (severity && severity.trim() !== "") {
            combined = combined.filter(c => c.severity?.toUpperCase() === severity.toUpperCase());
        }
        if (actor && actor.trim() !== "") {
            combined = combined.filter(c => c.actor?.toLowerCase().includes(actor.toLowerCase()));
        }

        // Sort unified timeline by timestamp descending
        combined.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        res.json({
            ok: true,
            count: combined.length,
            data: combined.slice(0, limit)
        });
    } catch (err) {
        logger.error({ event: 'audit_aggregation_error', error: err.message });
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/admin/audit/:id
 * Retrieve a specific single forensic record across databases.
 */
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    // Check if ID matches entity_id or explicit ID by doing a light generic search
    req.query.limit = 500;
    // Route back to base search and filter exactly
    try {
        // Forward query to local base aggregation
        const p1 = fetchSourceSafely('API_GATEWAY', "SELECT id, created_at as timestamp, tenant_id as actor, action as event_type, resource_type as entity_type, resource_id as entity_id, 'INFO' as severity, request_id as trace_id, action as message, governance_snapshot as metadata_json, tenant_id FROM api_audit_log WHERE id = ? OR request_id = ?", [id, id]);
        const p2 = fetchSourceSafely('MES_ORCHESTRATION', "SELECT id, created_at as timestamp, actor_id as actor, event_type, 'DISPATCH' as entity_type, dispatch_id as entity_id, 'INFO' as severity, manufacturing_package_id as trace_id, message, metadata_json, tenant_id FROM manufacturing_dispatch_events WHERE id = ? OR dispatch_id = ?", [id, id]);
        const p3 = fetchSourceSafely('EVIDENCE_LEDGER', "SELECT id, created_at as timestamp, tenant_id as actor, evidence_type as event_type, 'DISPATCH' as entity_type, dispatch_id as entity_id, 'INFO' as severity, hash as trace_id, CONCAT('Evidence verified node block chain: ', evidence_type) as message, payload_json as metadata_json, tenant_id FROM manufacturing_evidence_ledger WHERE hash = ? OR dispatch_id = ?", [id, id]);
        
        const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
        const combined = [...r1, ...r2, ...r3];
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
 * Retrieves complete unified timeline specifically scoped to an entity.
 */
router.get('/entity/:entityType/:entityId', async (req, res) => {
    const { entityType, entityId } = req.params;
    try {
        // Build targeted requests
        const p1 = fetchSourceSafely('API_GATEWAY', "SELECT id, created_at as timestamp, tenant_id as actor, action as event_type, resource_type as entity_type, resource_id as entity_id, 'INFO' as severity, request_id as trace_id, action as message, governance_snapshot as metadata_json, tenant_id FROM api_audit_log WHERE resource_id = ? OR request_id = ?", [entityId, entityId]);
        const p2 = fetchSourceSafely('MES_ORCHESTRATION', "SELECT id, created_at as timestamp, actor_id as actor, event_type, 'DISPATCH' as entity_type, dispatch_id as entity_id, 'INFO' as severity, manufacturing_package_id as trace_id, message, metadata_json, tenant_id FROM manufacturing_dispatch_events WHERE dispatch_id = ? OR manufacturing_package_id = ?", [entityId, entityId]);
        const p3 = fetchSourceSafely('EVIDENCE_LEDGER', "SELECT id, created_at as timestamp, tenant_id as actor, evidence_type as event_type, 'DISPATCH' as entity_type, dispatch_id as entity_id, 'INFO' as severity, hash as trace_id, CONCAT('Evidence verified node block chain: ', evidence_type) as message, payload_json as metadata_json, tenant_id FROM manufacturing_evidence_ledger WHERE dispatch_id = ?", [entityId]);
        
        const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
        const combined = [...r1, ...r2, ...r3];
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
