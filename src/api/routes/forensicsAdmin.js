/**
 * src/api/routes/forensicsAdmin.js
 * 
 * Forensic Timeline & Trace Stitching API.
 */
const express = require('express');
const router = express.Router();
const db = require('../services/db');
const logger = require('../services/logger').child('forensics-router');

/**
 * GET /api/admin/forensics/timeline/:jobId
 * Reconstructs the full lifecycle of a job across all service boundaries.
 */
router.get('/timeline/:jobId', async (req, res) => {
    const { jobId } = req.params;

    try {
        // 1. Fetch Primary Job Record
        const { rows: [job] } = await db.query('SELECT * FROM jobs WHERE id = ?', [jobId]);
        if (!job) return res.status(404).json({ ok: false, error: 'JOB_NOT_FOUND' });

        // 2. Fetch Audit Logs for this Job and its Request ID
        const requestId = job.metadata_json?.traceId || job.metadata_json?.requestId;
        const { rows: auditLogs } = await db.query(`
            SELECT * FROM api_audit_logs 
            WHERE resource_id = ? OR request_id = ?
            ORDER BY created_at ASC
        `, [jobId, requestId]);

        // 3. Fetch Artifact History
        const { rows: artifacts } = await db.query(`
            SELECT * FROM preflight_artifacts 
            WHERE job_id = ? 
            ORDER BY created_at ASC
        `, [jobId]);

        // 4. Stitch Timeline
        const timeline = [];

        // Add creation event
        timeline.push({
            event: 'JOB_INGESTED',
            timestamp: job.created_at,
            actor: 'Gateway-Ingress',
            metadata: { type: job.type, tenantId: job.tenant_id }
        });

        // Map Audit Logs
        auditLogs.forEach(log => {
            timeline.push({
                event: log.action,
                timestamp: log.created_at,
                actor: log.user_role || 'System',
                metadata: { requestId: log.request_id, ip: log.ip_address }
            });
        });

        // Map Artifacts
        artifacts.forEach(art => {
            timeline.push({
                event: `ARTIFACT_${art.type}`,
                timestamp: art.created_at,
                actor: 'Artifact-Registry',
                metadata: { filename: art.filename, size: art.size_bytes }
            });
        });

        // Sort by timestamp
        timeline.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        res.json({
            ok: true,
            jobId,
            traceId: requestId,
            state: job.status === 'COMPLETED' ? 'FORENSIC_CERTIFIED' : 'ANALYSIS_ACTIVE',
            timeline
        });

    } catch (err) {
        logger.error({ event: 'forensic_reconstruction_failed', jobId, error: err.message });
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
